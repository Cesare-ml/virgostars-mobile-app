//! Experimental native coordinator. The browser and callback are injected by
//! trusted platform code; no Tauri commands, intent receiver or UI are wired.
//! All methods that perform I/O must run on a dedicated native worker.
use crate::android_chart_snapshot::{self, ChartSummary, SnapshotError, SnapshotTransport};
use crate::android_connected_session::{self, SessionError, SessionTransport, VerifiedSession};
use crate::android_login_attempt::{AndroidLoginAttempt, LoginDecision};
use crate::android_snapshot_cache::{CacheError, SnapshotCache};
use crate::android_token_exchange::{self, TokenScope, TokenTransport};
use crate::archive_keys::KeyStore;
use std::sync::{Arc, Mutex};
use std::time::Instant;

/// Implementations must open the system browser directly, not a WebView, and
/// must not log or send the URL to JavaScript. The URL contains OAuth state.
pub(crate) trait SystemBrowser {
    fn open(&self, url: &str) -> Result<(), ()>;
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum LoginStatus {
    Idle,
    Pending,
    Connected,
}
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum CoordinatorError {
    Busy,
    InvalidCallback,
    Denied,
    Authorization,
    Network,
    Cache,
    Unavailable,
}

enum State {
    Idle,
    Pending(AndroidLoginAttempt),
    Connected(Arc<VerifiedSession>),
}

/// One native owner per app process. Account changes are serialized against
/// commits. The supplied addresses are trusted native configuration;
/// an Android-verified App Link must be configured independently before use.
pub(crate) struct LoginCoordinator {
    state: Mutex<State>,
    consent: String,
    redirect: String,
}
impl LoginCoordinator {
    pub(crate) fn new(consent: &str, redirect: &str) -> Self {
        Self {
            state: Mutex::new(State::Idle),
            consent: consent.to_owned(),
            redirect: redirect.to_owned(),
        }
    }
    pub(crate) fn status(&self, now: Instant) -> Result<LoginStatus, CoordinatorError> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| CoordinatorError::Unavailable)?;
        if matches!(&*state, State::Pending(attempt) if attempt.is_expired(now))
            || matches!(&*state, State::Connected(session) if session.remaining_seconds(now)==0)
        {
            *state = State::Idle;
        }
        Ok(match &*state {
            State::Idle => LoginStatus::Idle,
            State::Pending(_) => LoginStatus::Pending,
            State::Connected(_) => LoginStatus::Connected,
        })
    }
    pub(crate) fn begin<B: SystemBrowser>(
        &self,
        browser: &B,
        now: Instant,
    ) -> Result<(), CoordinatorError> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| CoordinatorError::Unavailable)?;
        if !matches!(*state, State::Idle) {
            return Err(CoordinatorError::Busy);
        }
        let mut attempt = AndroidLoginAttempt::new(&self.consent, &self.redirect, now)
            .map_err(|_| CoordinatorError::Unavailable)?;
        let url = attempt
            .take_browser_url(now)
            .map_err(|_| CoordinatorError::Unavailable)?;
        browser
            .open(&url)
            .map_err(|_| CoordinatorError::Unavailable)?;
        *state = State::Pending(attempt);
        Ok(())
    }
    /// Only native Android code may supply the verified App Link callback.
    /// A malformed or unrelated callback leaves the pending attempt available.
    pub(crate) fn accept<T: TokenTransport + SessionTransport>(
        &self,
        callback: &str,
        transport: &T,
        now: impl Fn() -> Instant,
    ) -> Result<(), CoordinatorError> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| CoordinatorError::Unavailable)?;
        let State::Pending(attempt) = &mut *state else {
            return Err(CoordinatorError::InvalidCallback);
        };
        if attempt.is_expired(now()) {
            *state = State::Idle;
            return Err(CoordinatorError::Authorization);
        }
        let decision = attempt
            .accept(callback, now())
            .map_err(|_| CoordinatorError::InvalidCallback)?;
        *state = State::Idle; // one-use: a failed or denied exchange cannot be replayed
        if matches!(decision, LoginDecision::Denied) {
            return Err(CoordinatorError::Denied);
        }
        let grant = android_token_exchange::exchange(transport, decision, now())
            .map_err(|_| CoordinatorError::Authorization)?;
        // The account screen is read-only and must not accept wider grants.
        if grant.scope() != TokenScope::Read {
            return Err(CoordinatorError::Authorization);
        }
        let verified = android_connected_session::verify(transport, grant, &now)
            .map_err(|_| CoordinatorError::Authorization)?;
        *state = State::Connected(Arc::new(verified));
        Ok(())
    }
    /// Drops local credentials and cancels the attempt. This is not server-side
    /// revocation and cached data are not made available offline by this method.
    pub(crate) fn clear_local_session(&self) -> Result<(), CoordinatorError> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| CoordinatorError::Unavailable)?;
        *state = State::Idle;
        Ok(())
    }
    /// Read a complete snapshot and persist it for the verified profile. Session
    /// and cache errors do not expose response bodies or personally identifying data.
    pub(crate) fn synchronize<T: SnapshotTransport + SessionTransport>(
        &self,
        transport: &T,
        cache: &SnapshotCache,
        keys: &dyn KeyStore,
        now: impl Fn() -> Instant,
    ) -> Result<Vec<ChartSummary>, CoordinatorError> {
        let session = {
            let state = self
                .state
                .lock()
                .map_err(|_| CoordinatorError::Unavailable)?;
            let State::Connected(session) = &*state else {
                return Err(CoordinatorError::Authorization);
            };
            Arc::clone(session)
        };
        let result = (|| {
            let (baseline, _) = cache.prepare(&session, keys, now()).map_err(map_cache)?;
            let snapshot =
                android_chart_snapshot::fetch(transport, &session, &now).map_err(|e| match e {
                    SnapshotError::Expired | SnapshotError::Rejected => {
                        CoordinatorError::Authorization
                    }
                    SnapshotError::Network => CoordinatorError::Network,
                    SnapshotError::Invalid => CoordinatorError::Unavailable,
                })?;
            {
                let state = self
                    .state
                    .lock()
                    .map_err(|_| CoordinatorError::Unavailable)?;
                if !matches!(&*state, State::Connected(active) if Arc::ptr_eq(active, &session)) {
                    return Err(CoordinatorError::Authorization);
                }
            }
            android_connected_session::revalidate(transport, &session, &now).map_err(
                |e| match e {
                    SessionError::Expired | SessionError::Rejected | SessionError::Invalid => {
                        CoordinatorError::Authorization
                    }
                    SessionError::Network => CoordinatorError::Network,
                },
            )?;
            let state = self
                .state
                .lock()
                .map_err(|_| CoordinatorError::Unavailable)?;
            if !matches!(&*state, State::Connected(active) if Arc::ptr_eq(active, &session)) {
                return Err(CoordinatorError::Authorization);
            }
            let summaries = snapshot
                .summaries()
                .map_err(|_| CoordinatorError::Unavailable)?;
            cache.provision_key(keys).map_err(map_cache)?;
            cache
                .commit(&session, keys, baseline, snapshot, &now)
                .map_err(map_cache)?;
            Ok(summaries)
        })();
        if result.as_ref().err() == Some(&CoordinatorError::Authorization) {
            let mut state = self
                .state
                .lock()
                .map_err(|_| CoordinatorError::Unavailable)?;
            if matches!(&*state, State::Connected(active) if Arc::ptr_eq(active, &session)) {
                *state = State::Idle;
            }
        }
        result
    }
}
fn map_cache(error: CacheError) -> CoordinatorError {
    match error {
        CacheError::Expired => CoordinatorError::Authorization,
        _ => CoordinatorError::Cache,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::android_chart_snapshot::SnapshotResponse;
    use crate::android_connected_session::SessionResponse;
    use crate::android_token_exchange::TokenResponse;
    use crate::archive_keys::{fake::FakeKeyStore, new_key};
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    use sha2::{Digest, Sha256};
    use std::cell::{Cell, RefCell};
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{Duration, SystemTime, UNIX_EPOCH};
    use url::{form_urlencoded, Url};
    use zeroize::Zeroizing;

    const CONSENT: &str = "https://example.test/collega-dispositivo";
    const REDIRECT: &str = "https://example.test/virgostars/oauth/callback";
    const PROFILE: &str = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    struct Browser {
        url: RefCell<Option<Zeroizing<String>>>,
        fail: bool,
    }
    impl SystemBrowser for Browser {
        fn open(&self, url: &str) -> Result<(), ()> {
            if self.fail {
                return Err(());
            }
            *self.url.borrow_mut() = Some(Zeroizing::new(url.to_owned()));
            Ok(())
        }
    }
    impl Browser {
        fn new() -> Self {
            Self {
                url: RefCell::new(None),
                fail: false,
            }
        }
        fn fields(&self) -> std::collections::HashMap<String, String> {
            let saved = self.url.borrow();
            let parsed = Url::parse(saved.as_ref().unwrap()).unwrap();
            form_urlencoded::parse(parsed.fragment().unwrap().as_bytes())
                .into_owned()
                .collect()
        }
    }
    struct Transport {
        challenge: String,
        profile: &'static str,
        write_scope: bool,
        session_calls: Cell<usize>,
        reject_recheck: bool,
        profile_changed: bool,
    }
    impl TokenTransport for Transport {
        fn post_form(
            &self,
            _: &str,
            body: &str,
            _: Duration,
            _: usize,
        ) -> Result<TokenResponse, ()> {
            let fields: std::collections::HashMap<_, _> = form_urlencoded::parse(body.as_bytes())
                .into_owned()
                .collect();
            assert_eq!(fields["client_id"], "virgostars-android");
            assert_eq!(fields["redirect_uri"], REDIRECT);
            assert_eq!(fields["code"], "c".repeat(43));
            assert_eq!(
                URL_SAFE_NO_PAD.encode(Sha256::digest(fields["code_verifier"].as_bytes())),
                self.challenge
            );
            let bearer = format!("{}.{}.{}", "a".repeat(45), "b".repeat(45), "c".repeat(45));
            let scope = if self.write_scope {
                "chart_sync:read chart_sync:charts:write"
            } else {
                "chart_sync:read"
            };
            Ok(TokenResponse{status:200,content_type:"application/json".into(),body:format!(
                r#"{{"access_token":"{bearer}","token_type":"Bearer","expires_in":300,"scope":"{scope}"}}"#).into_bytes()})
        }
    }
    impl SessionTransport for Transport {
        fn get_session(
            &self,
            _: &str,
            _: &str,
            _: Duration,
            _: usize,
        ) -> Result<SessionResponse, ()> {
            let n = self.session_calls.get() + 1;
            self.session_calls.set(n);
            if n > 1 && self.reject_recheck {
                return Ok(SessionResponse {
                    status: 401,
                    content_type: String::new(),
                    body: vec![],
                });
            }
            let profile = if n > 1 && self.profile_changed {
                "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
            } else {
                self.profile
            };
            Ok(SessionResponse {status:200,content_type:"application/json".into(),body:format!(
                r#"{{"contractVersion":1,"status":"active","scope":"chart_sync:read","profileRef":"{profile}"}}"#).into_bytes()})
        }
    }
    impl SnapshotTransport for Transport {
        fn get_snapshot(
            &self,
            _: &str,
            _: &str,
            _: Duration,
            _: usize,
        ) -> Result<SnapshotResponse, ()> {
            Ok(SnapshotResponse {status:200,content_type:"application/json".into(),body:format!(
                r#"{{"contractVersion":1,"cursor":{{"epoch":"{}","changeSeq":"42"}},"charts":[]}}"#,self.profile).into_bytes()})
        }
    }
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let n = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "vs-login-test-{}-{n}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            if let Ok(entries) = fs::read_dir(&self.0) {
                for entry in entries.flatten() {
                    if entry.file_type().is_ok_and(|t| t.is_file()) {
                        let _ = fs::remove_file(entry.path());
                    }
                }
            }
            let _ = fs::remove_dir(&self.0);
        }
    }
    fn keys() -> FakeKeyStore {
        let keys = FakeKeyStore::empty();
        keys.store(&new_key().unwrap()).unwrap();
        keys
    }
    fn start_login(coordinator: &LoginCoordinator, now: Instant) -> (Browser, Transport, String) {
        let browser = Browser::new();
        coordinator.begin(&browser, now).unwrap();
        let fields = browser.fields();
        assert_eq!(fields["client_id"], "virgostars-android");
        assert!(!fields.contains_key("request_charts_write"));
        let callback = format!(
            "{REDIRECT}?code={}&state={}",
            "c".repeat(43),
            fields["state"]
        );
        let transport = Transport {
            challenge: fields["code_challenge"].clone(),
            profile: PROFILE,
            write_scope: false,
            session_calls: Cell::new(0),
            reject_recheck: false,
            profile_changed: false,
        };
        (browser, transport, callback)
    }

    #[test]
    fn read_only_login_rejects_a_broader_grant() {
        let now = Instant::now();
        let coordinator = LoginCoordinator::new(CONSENT, REDIRECT);
        let (_, mut transport, callback) = start_login(&coordinator, now);
        transport.write_scope = true;
        assert_eq!(
            coordinator.accept(&callback, &transport, || now),
            Err(CoordinatorError::Authorization)
        );
        assert_eq!(transport.session_calls.get(), 0);
        assert_eq!(coordinator.status(now), Ok(LoginStatus::Idle));
    }

    #[test]
    fn switching_accounts_keeps_both_cached_snapshots_bound_to_their_profiles() {
        let now = Instant::now();
        let coordinator = LoginCoordinator::new(CONSENT, REDIRECT);
        let fixture = Fixture::new();
        let cache = SnapshotCache::in_native_directory(&fixture.0);
        let keys = keys();
        let (_, transport_a, callback_a) = start_login(&coordinator, now);
        coordinator
            .accept(&callback_a, &transport_a, || now)
            .unwrap();
        coordinator
            .synchronize(&transport_a, &cache, &keys, || now)
            .unwrap();
        coordinator.clear_local_session().unwrap();
        let (_, mut transport_b, callback_b) = start_login(&coordinator, now);
        transport_b.profile = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
        coordinator
            .accept(&callback_b, &transport_b, || now)
            .unwrap();
        let state = coordinator.state.lock().unwrap();
        let State::Connected(session) = &*state else {
            panic!("missing second session");
        };
        assert!(cache.prepare(session, &keys, now).unwrap().1.is_none());
        drop(state);
        coordinator
            .synchronize(&transport_b, &cache, &keys, || now)
            .unwrap();
        assert_eq!(fs::read_dir(&fixture.0).unwrap().count(), 2);
        let state = coordinator.state.lock().unwrap();
        let State::Connected(session) = &*state else {
            panic!("missing second session");
        };
        assert_eq!(
            cache
                .prepare(session, &keys, now)
                .unwrap()
                .1
                .unwrap()
                .profile_ref(),
            transport_b.profile
        );
    }

    #[test]
    fn signout_during_download_prevents_commit_and_does_not_block_on_network() {
        use std::sync::mpsc;
        use std::thread;
        struct Blocking {
            inner: Transport,
            ready: mpsc::Sender<()>,
            release: mpsc::Receiver<()>,
        }
        impl SessionTransport for Blocking {
            fn get_session(
                &self,
                endpoint: &str,
                bearer: &str,
                timeout: Duration,
                max: usize,
            ) -> Result<SessionResponse, ()> {
                self.inner.get_session(endpoint, bearer, timeout, max)
            }
        }
        impl SnapshotTransport for Blocking {
            fn get_snapshot(
                &self,
                endpoint: &str,
                bearer: &str,
                timeout: Duration,
                max: usize,
            ) -> Result<SnapshotResponse, ()> {
                self.ready.send(()).map_err(|_| ())?;
                self.release
                    .recv_timeout(Duration::from_secs(3))
                    .map_err(|_| ())?;
                self.inner.get_snapshot(endpoint, bearer, timeout, max)
            }
        }
        let now = Instant::now();
        let coordinator = Arc::new(LoginCoordinator::new(CONSENT, REDIRECT));
        let (_, transport, callback) = start_login(&coordinator, now);
        coordinator.accept(&callback, &transport, || now).unwrap();
        let fixture = Fixture::new();
        let folder = fixture.0.clone();
        let keys = keys();
        let (ready_tx, ready_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let worker = Arc::clone(&coordinator);
        let task = thread::spawn(move || {
            worker.synchronize(
                &Blocking {
                    inner: transport,
                    ready: ready_tx,
                    release: release_rx,
                },
                &SnapshotCache::in_native_directory(&folder),
                &keys,
                || now,
            )
        });
        ready_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        let (clear_tx, clear_rx) = mpsc::channel();
        let clearer = Arc::clone(&coordinator);
        let clear = thread::spawn(move || {
            let _ = clear_tx.send(clearer.clear_local_session());
        });
        let cleared = clear_rx.recv_timeout(Duration::from_secs(1));
        if cleared.is_err() {
            let _ = release_tx.send(());
            let _ = task.join();
            panic!("signout blocked on network");
        }
        assert_eq!(cleared.unwrap(), Ok(()));
        clear.join().unwrap();
        let (_, mut second, callback) = start_login(&coordinator, now);
        second.profile = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
        coordinator.accept(&callback, &second, || now).unwrap();
        release_tx.send(()).unwrap();
        assert!(matches!(
            task.join().unwrap(),
            Err(CoordinatorError::Authorization)
        ));
        assert_eq!(coordinator.status(now), Ok(LoginStatus::Connected));
        assert_eq!(fs::read_dir(&fixture.0).unwrap().count(), 0);
    }

    #[test]
    fn pkce_session_and_encrypted_snapshot_work_together_with_synthetic_transport() {
        let now = Instant::now();
        let coordinator = LoginCoordinator::new(CONSENT, REDIRECT);
        let (_browser, transport, callback) = start_login(&coordinator, now);
        assert_eq!(coordinator.status(now), Ok(LoginStatus::Pending));
        assert_eq!(
            coordinator.accept("https://foreign.test/callback?code=bad", &transport, || now),
            Err(CoordinatorError::InvalidCallback)
        );
        coordinator.accept(&callback, &transport, || now).unwrap();
        assert_eq!(coordinator.status(now), Ok(LoginStatus::Connected));
        assert_eq!(
            coordinator.accept(&callback, &transport, || now),
            Err(CoordinatorError::InvalidCallback)
        );
        let fixture = Fixture::new();
        let cache = SnapshotCache::in_native_directory(&fixture.0);
        let keys = keys();
        coordinator
            .synchronize(&transport, &cache, &keys, || now)
            .unwrap();
        assert_eq!(transport.session_calls.get(), 2); // initial login and post-download recheck
        let state = coordinator.state.lock().unwrap();
        let State::Connected(session) = &*state else {
            panic!("no synthetic session");
        };
        let saved = cache.prepare(session, &keys, now).unwrap().1.unwrap();
        assert_eq!(saved.profile_ref(), PROFILE);
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(saved.json()).unwrap()["cursor"]
                ["changeSeq"],
            "42"
        );
        drop(state);
        let entry = fs::read_dir(&fixture.0).unwrap().next().unwrap().unwrap();
        let ciphertext = fs::read(entry.path()).unwrap();
        assert!(!ciphertext
            .windows(PROFILE.len())
            .any(|v| v == PROFILE.as_bytes()));
        coordinator.clear_local_session().unwrap();
        assert_eq!(coordinator.status(now), Ok(LoginStatus::Idle));
        assert!(matches!(
            coordinator.synchronize(&transport, &cache, &keys, || now),
            Err(CoordinatorError::Authorization)
        ));
    }
    #[test]
    fn revoked_or_changed_account_after_download_cannot_write_the_cache() {
        for changed in [false, true] {
            let now = Instant::now();
            let coordinator = LoginCoordinator::new(CONSENT, REDIRECT);
            let (_browser, mut transport, callback) = start_login(&coordinator, now);
            coordinator.accept(&callback, &transport, || now).unwrap();
            transport.reject_recheck = !changed;
            transport.profile_changed = changed;
            let fixture = Fixture::new();
            let cache = SnapshotCache::in_native_directory(&fixture.0);
            let keys = keys();
            assert!(matches!(
                coordinator.synchronize(&transport, &cache, &keys, || now),
                Err(CoordinatorError::Authorization)
            ));
            assert_eq!(coordinator.status(now), Ok(LoginStatus::Idle));
            assert_eq!(fs::read_dir(&fixture.0).unwrap().count(), 0);
        }
    }
    #[test]
    fn cancel_denial_and_expiry_do_not_leave_a_connected_account() {
        let now = Instant::now();
        let coordinator = LoginCoordinator::new(CONSENT, REDIRECT);
        let (browser, transport, _) = start_login(&coordinator, now);
        assert_eq!(
            coordinator.begin(&browser, now),
            Err(CoordinatorError::Busy)
        );
        let deny = format!(
            "{REDIRECT}?error=access_denied&state={}",
            browser.fields()["state"]
        );
        assert_eq!(
            coordinator.accept(&deny, &transport, || now),
            Err(CoordinatorError::Denied)
        );
        assert_eq!(coordinator.status(now), Ok(LoginStatus::Idle));
        let (_browser, transport, callback) = start_login(&coordinator, now);
        assert_eq!(
            coordinator.accept(&callback, &transport, || now + Duration::from_secs(301)),
            Err(CoordinatorError::Authorization)
        );
        assert_eq!(coordinator.status(now), Ok(LoginStatus::Idle));
        let failed = Browser {
            url: RefCell::new(None),
            fail: true,
        };
        assert_eq!(
            coordinator.begin(&failed, now),
            Err(CoordinatorError::Unavailable)
        );
        assert_eq!(coordinator.status(now), Ok(LoginStatus::Idle));
    }
}
