//! Experimental encrypted, profile-bound snapshot cache. Native only; no IPC.
//! This is not the editable archive and implements no offline access policy.
use crate::android_chart_snapshot::{VerifiedSnapshot, MAX_SNAPSHOT_BYTES};
use crate::android_connected_session::VerifiedSession;
use crate::archive_keys::{new_key, Key, KeyStore};
use crate::archive_vault;
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Instant;

const MAX_SEALED: u64 = MAX_SNAPSHOT_BYTES as u64 + 128;
static CACHE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum CacheError {
    Expired,
    Locked,
    Corrupt,
    Unavailable,
    Conflict,
    ProfileMismatch,
}

/// Paths are constructed exclusively by trusted native code, never by the WebView.
pub(crate) struct SnapshotCache {
    directory: PathBuf,
}

/// Captured before network I/O. A concurrent cache replacement invalidates it.
pub(crate) struct CacheBaseline {
    profile_ref: String,
    digest: Option<[u8; 32]>,
}

fn digest(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}
fn file_name(profile: &str) -> String {
    let hash = digest(profile.as_bytes());
    let mut output = String::from("account-snapshot-");
    for byte in hash {
        use std::fmt::Write as _;
        let _ = write!(output, "{byte:02x}");
    }
    output.push_str(".vscache");
    output
}
fn require_session(session: &VerifiedSession, now: Instant) -> Result<(), CacheError> {
    if session.remaining_seconds(now) == 0 {
        Err(CacheError::Expired)
    } else {
        Ok(())
    }
}
fn load_key(keys: &dyn KeyStore) -> Result<Key, CacheError> {
    keys.load()
        .map_err(|_| CacheError::Locked)?
        .ok_or(CacheError::Locked)
}

impl SnapshotCache {
    pub(crate) fn in_native_directory(directory: &Path) -> Self {
        Self {
            directory: directory.to_owned(),
        }
    }
    fn path(&self, profile: &str) -> PathBuf {
        self.directory.join(file_name(profile))
    }

    /// A dedicated account-cache key may be created only when no ciphertext or
    /// interrupted staging file exists. Never replace a missing key for data.
    pub(crate) fn provision_key(&self, keys: &dyn KeyStore) -> Result<(), CacheError> {
        let _guard = CACHE_LOCK.lock().map_err(|_| CacheError::Unavailable)?;
        if keys.load().map_err(|_| CacheError::Locked)?.is_some() {
            return Ok(());
        }
        match fs::read_dir(&self.directory) {
            Ok(mut entries) => {
                if entries.next().is_some() {
                    return Err(CacheError::Locked);
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(CacheError::Unavailable),
        }
        let fresh = new_key().map_err(|_| CacheError::Locked)?;
        keys.store(&fresh).map_err(|_| CacheError::Locked)?;
        let loaded = load_key(keys)?;
        if *fresh != *loaded {
            return Err(CacheError::Locked);
        }
        Ok(())
    }

    fn read(
        &self,
        profile: &str,
        keys: &dyn KeyStore,
    ) -> Result<Option<(VerifiedSnapshot, [u8; 32])>, CacheError> {
        let path = self.path(profile);
        match fs::symlink_metadata(&path) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err(CacheError::Unavailable),
            Ok(metadata) if !metadata.is_file() || metadata.len() > MAX_SEALED => {
                return Err(CacheError::Corrupt)
            }
            Ok(_) => {}
        }
        let key = load_key(keys)?;
        let mut sealed = Vec::new();
        File::open(path)
            .map_err(|_| CacheError::Unavailable)?
            .take(MAX_SEALED + 1)
            .read_to_end(&mut sealed)
            .map_err(|_| CacheError::Unavailable)?;
        if sealed.len() as u64 > MAX_SEALED {
            return Err(CacheError::Corrupt);
        }
        let plaintext = archive_vault::open(&key, &sealed).map_err(|_| CacheError::Locked)?;
        let snapshot =
            VerifiedSnapshot::from_cached(profile, plaintext).map_err(|_| CacheError::Corrupt)?;
        Ok(Some((snapshot, digest(&sealed))))
    }

    /// Capture a baseline before issuing the request, optionally opening an
    /// already cached snapshot for this verified profile.
    pub(crate) fn prepare(
        &self,
        session: &VerifiedSession,
        keys: &dyn KeyStore,
        now: Instant,
    ) -> Result<(CacheBaseline, Option<VerifiedSnapshot>), CacheError> {
        require_session(session, now)?;
        let _guard = CACHE_LOCK.lock().map_err(|_| CacheError::Unavailable)?;
        let stored = self.read(session.profile_ref(), keys)?;
        let (snapshot, digest) = match stored {
            Some((snapshot, digest)) => (Some(snapshot), Some(digest)),
            None => (None, None),
        };
        Ok((
            CacheBaseline {
                profile_ref: session.profile_ref().to_owned(),
                digest,
            },
            snapshot,
        ))
    }

    /// A successful replacement contains only ciphertext. A different
    /// account, changed cache, missing key, expired session or write failure
    /// leaves the previously committed snapshot untouched.
    pub(crate) fn commit(
        &self,
        session: &VerifiedSession,
        keys: &dyn KeyStore,
        baseline: CacheBaseline,
        snapshot: VerifiedSnapshot,
        now: impl Fn() -> Instant,
    ) -> Result<(), CacheError> {
        require_session(session, now())?;
        if baseline.profile_ref != session.profile_ref()
            || snapshot.profile_ref() != session.profile_ref()
        {
            return Err(CacheError::ProfileMismatch);
        }
        let _guard = CACHE_LOCK.lock().map_err(|_| CacheError::Unavailable)?;
        let stored = self.read(session.profile_ref(), keys)?;
        let current = stored.as_ref().map(|(_, digest)| *digest);
        if current != baseline.digest {
            return Err(CacheError::Conflict);
        }
        // Never create or replace a key here: it could strand an existing
        // offline archive or a different profile's encrypted cache.
        let key = load_key(keys)?;
        let sealed = archive_vault::seal(&key, snapshot.json()).map_err(|_| CacheError::Locked)?;
        if sealed.len() as u64 > MAX_SEALED {
            return Err(CacheError::Unavailable);
        }
        fs::create_dir_all(&self.directory).map_err(|_| CacheError::Unavailable)?;
        let mut random = [0u8; 16];
        getrandom::fill(&mut random).map_err(|_| CacheError::Unavailable)?;
        let mut temp_name = String::from("snapshot-staging-");
        for byte in random {
            use std::fmt::Write as _;
            let _ = write!(temp_name, "{byte:02x}");
        }
        let staging = self.directory.join(temp_name);
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&staging)
            .map_err(|_| CacheError::Unavailable)?;
        let result = (|| {
            file.write_all(&sealed)
                .map_err(|_| CacheError::Unavailable)?;
            file.sync_all().map_err(|_| CacheError::Unavailable)?;
            drop(file);
            let mut readback = Vec::new();
            File::open(&staging)
                .map_err(|_| CacheError::Unavailable)?
                .take(MAX_SEALED + 1)
                .read_to_end(&mut readback)
                .map_err(|_| CacheError::Unavailable)?;
            if readback.len() as u64 > MAX_SEALED {
                return Err(CacheError::Corrupt);
            }
            let plaintext =
                archive_vault::open(&load_key(keys)?, &readback).map_err(|_| CacheError::Locked)?;
            if plaintext.as_slice() != snapshot.json() {
                return Err(CacheError::Corrupt);
            }
            require_session(session, now())?;
            fs::rename(&staging, self.path(session.profile_ref()))
                .map_err(|_| CacheError::Unavailable)?;
            Ok(())
        })();
        if result.is_err() {
            let _ = fs::remove_file(&staging);
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::android_connected_session::{self, SessionResponse, SessionTransport};
    use crate::android_token_exchange::{TokenScope, UnverifiedGrant};
    use crate::archive_keys::{fake::FakeKeyStore, new_key};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{Duration, SystemTime, UNIX_EPOCH};
    use zeroize::Zeroizing;

    const A: &str = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const B: &str = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    struct FakeSession(&'static str);
    impl SessionTransport for FakeSession {
        fn get_session(
            &self,
            _: &str,
            _: &str,
            _: Duration,
            _: usize,
        ) -> Result<SessionResponse, ()> {
            Ok(SessionResponse { status:200, content_type:"application/json".into(), body:format!(
                r#"{{"contractVersion":1,"status":"active","scope":"chart_sync:read","profileRef":"{}"}}"#,self.0).into_bytes() })
        }
    }
    fn session(profile: &'static str, now: Instant) -> VerifiedSession {
        android_connected_session::verify(
            &FakeSession(profile),
            UnverifiedGrant::synthetic(TokenScope::Read, now + Duration::from_secs(60)),
            || now,
        )
        .unwrap_or_else(|_| panic!("invalid synthetic session"))
    }
    fn snapshot(profile: &str, seq: u64) -> VerifiedSnapshot {
        let bytes = format!(
            r#"{{"contractVersion":1,"cursor":{{"epoch":"{profile}","changeSeq":"{seq}"}},"charts":[]}}"#
        );
        VerifiedSnapshot::from_cached(profile, Zeroizing::new(bytes.into_bytes()))
            .unwrap_or_else(|_| panic!("invalid synthetic snapshot"))
    }
    fn keys() -> FakeKeyStore {
        let keys = FakeKeyStore::empty();
        keys.store(&new_key().unwrap()).unwrap();
        keys
    }
    struct Fixture {
        dir: PathBuf,
    }
    impl Fixture {
        fn new() -> Self {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let n = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir = std::env::temp_dir().join(format!(
                "vs-snapshot-test-{}-{n}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&dir).unwrap();
            Self { dir }
        }
        fn cache(&self) -> SnapshotCache {
            SnapshotCache::in_native_directory(&self.dir)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            // This is the unique test-owned directory created above; files only.
            if let Ok(entries) = fs::read_dir(&self.dir) {
                for entry in entries.flatten() {
                    if entry.file_type().is_ok_and(|t| t.is_file()) {
                        let _ = fs::remove_file(entry.path());
                    }
                }
            }
            let _ = fs::remove_dir(&self.dir);
        }
    }
    #[test]
    fn separates_accounts_and_keeps_files_encrypted() {
        let fixture = Fixture::new();
        let cache = fixture.cache();
        let keys = keys();
        let now = Instant::now();
        let a = session(A, now);
        let b = session(B, now);
        let (base, prior) = cache.prepare(&a, &keys, now).unwrap();
        assert!(prior.is_none());
        cache
            .commit(&a, &keys, base, snapshot(A, 1), || now)
            .unwrap();
        let (base_b, prior) = cache.prepare(&b, &keys, now).unwrap();
        assert!(prior.is_none());
        cache
            .commit(&b, &keys, base_b, snapshot(B, 2), || now)
            .unwrap();
        assert_eq!(
            cache.prepare(&a, &keys, now).unwrap().1.unwrap().json(),
            snapshot(A, 1).json()
        );
        assert_eq!(
            cache.prepare(&b, &keys, now).unwrap().1.unwrap().json(),
            snapshot(B, 2).json()
        );
        for profile in [A, B] {
            let raw = fs::read(cache.path(profile)).unwrap();
            assert!(!raw
                .windows(profile.len())
                .any(|window| window == profile.as_bytes()));
            assert!(!raw.windows(15).any(|window| window == b"contractVersion"));
        }
        let (base, _) = cache.prepare(&a, &keys, now).unwrap();
        assert_eq!(
            cache.commit(&b, &keys, base, snapshot(A, 9), || now),
            Err(CacheError::ProfileMismatch)
        );
        assert_eq!(
            cache.prepare(&a, &keys, now).unwrap().1.unwrap().json(),
            snapshot(A, 1).json()
        );
    }
    #[test]
    fn stale_response_and_expired_session_cannot_overwrite_new_snapshot() {
        let fixture = Fixture::new();
        let cache = fixture.cache();
        let keys = keys();
        let now = Instant::now();
        let a = session(A, now);
        let (old, _) = cache.prepare(&a, &keys, now).unwrap();
        let (new, _) = cache.prepare(&a, &keys, now).unwrap();
        cache
            .commit(&a, &keys, new, snapshot(A, 2), || now)
            .unwrap();
        assert_eq!(
            cache.commit(&a, &keys, old, snapshot(A, 1), || now),
            Err(CacheError::Conflict)
        );
        let (base, _) = cache.prepare(&a, &keys, now).unwrap();
        let calls = std::cell::Cell::new(0);
        assert_eq!(
            cache.commit(&a, &keys, base, snapshot(A, 3), || {
                let n = calls.get();
                calls.set(n + 1);
                if n == 0 {
                    now
                } else {
                    now + Duration::from_secs(60)
                }
            }),
            Err(CacheError::Expired)
        );
        assert_eq!(
            cache.prepare(&a, &keys, now).unwrap().1.unwrap().json(),
            snapshot(A, 2).json()
        );
        assert_eq!(fs::read_dir(&fixture.dir).unwrap().count(), 1); // staging was removed
    }
    #[test]
    fn missing_wrong_or_unavailable_key_and_tampering_never_replace_data() {
        let fixture = Fixture::new();
        let cache = fixture.cache();
        let keys = keys();
        let now = Instant::now();
        let a = session(A, now);
        let (base, _) = cache.prepare(&a, &keys, now).unwrap();
        cache
            .commit(&a, &keys, base, snapshot(A, 1), || now)
            .unwrap();
        let path = cache.path(A);
        let original = fs::read(&path).unwrap();
        let saved = keys.key.borrow_mut().take().unwrap();
        assert!(matches!(
            cache.prepare(&a, &keys, now),
            Err(CacheError::Locked)
        ));
        *keys.key.borrow_mut() = Some(*new_key().unwrap());
        assert!(matches!(
            cache.prepare(&a, &keys, now),
            Err(CacheError::Locked)
        ));
        assert_eq!(fs::read(&path).unwrap(), original);
        *keys.key.borrow_mut() = Some(saved);
        let mut tampered = original.clone();
        let last = tampered.len() - 1;
        tampered[last] ^= 1;
        fs::write(&path, &tampered).unwrap();
        assert!(matches!(
            cache.prepare(&a, &keys, now),
            Err(CacheError::Locked)
        ));
        assert_eq!(fs::read(&path).unwrap(), tampered);
        fs::write(&path, &original).unwrap();
        *keys.unavailable.borrow_mut() = true;
        assert!(matches!(
            cache.prepare(&a, &keys, now),
            Err(CacheError::Locked)
        ));
        assert_eq!(fs::read(&path).unwrap(), original);
    }
    #[test]
    fn first_write_with_no_key_fails_without_making_a_key_or_file() {
        let fixture = Fixture::new();
        let cache = fixture.cache();
        let keys = FakeKeyStore::empty();
        let now = Instant::now();
        let a = session(A, now);
        let (base, _) = cache.prepare(&a, &keys, now).unwrap();
        assert_eq!(
            cache.commit(&a, &keys, base, snapshot(A, 1), || now),
            Err(CacheError::Locked)
        );
        assert!(keys.load().unwrap().is_none());
        assert_eq!(fs::read_dir(&fixture.dir).unwrap().count(), 0);
    }

    #[test]
    fn provisioning_creates_a_key_only_for_an_empty_cache_and_never_replaces_a_lost_key() {
        let fixture = Fixture::new();
        let cache = fixture.cache();
        let keys = FakeKeyStore::empty();
        let now = Instant::now();
        let a = session(A, now);
        cache.provision_key(&keys).unwrap();
        let original = keys.load().unwrap().unwrap();
        let (baseline, _) = cache.prepare(&a, &keys, now).unwrap();
        cache
            .commit(&a, &keys, baseline, snapshot(A, 1), || now)
            .unwrap();
        keys.key.borrow_mut().take();
        assert_eq!(cache.provision_key(&keys), Err(CacheError::Locked));
        assert!(keys.load().unwrap().is_none());
        *keys.key.borrow_mut() = Some(*original);
        assert!(cache.prepare(&a, &keys, now).unwrap().1.is_some());
    }

    #[test]
    fn copying_ciphertext_to_a_different_profile_is_rejected() {
        let fixture = Fixture::new();
        let cache = fixture.cache();
        let keys = keys();
        let now = Instant::now();
        let a = session(A, now);
        let b = session(B, now);
        let (base, _) = cache.prepare(&a, &keys, now).unwrap();
        cache
            .commit(&a, &keys, base, snapshot(A, 1), || now)
            .unwrap();
        let copied = fs::read(cache.path(A)).unwrap();
        fs::write(cache.path(B), &copied).unwrap();
        assert!(matches!(
            cache.prepare(&b, &keys, now),
            Err(CacheError::Corrupt)
        ));
        assert_eq!(fs::read(cache.path(B)).unwrap(), copied);
        assert_eq!(
            cache.prepare(&a, &keys, now).unwrap().1.unwrap().json(),
            snapshot(A, 1).json()
        );
    }
}
