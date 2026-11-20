//! Encrypted archive core adapted from Desktop. Android uses its own device key store;
//! desktop legacy plaintext migration is disabled for the mobile path.
//!
//! Only what the user typed is stored: name, UTC instant, time zone, position and place label.
//! Positions are recalculated when a chart is opened, so the archive does not depend on any
//! ephemeris provider.
//!
//! On disk there is one sealed file (`archive_vault`): a SQLite database encrypted and
//! authenticated as a whole with a random key kept by the operating system's credential store
//! (`archive_keys`). While the app works, the database lives in memory; every change is sealed to a
//! staging file and moved over the archive atomically, so no plain page, journal or temporary copy is
//! ever written. If the key is unavailable or wrong the archive stays locked: there is no plaintext
//! fallback.
//!
//! The first prototype kept a plain SQLite file (`charts-v1.sqlite3`). It is migrated once, after
//! validation and a read-back check, and is **not** deleted automatically: removing it is an explicit
//! request (`remove_legacy`), because ordinary deletion is not secure erasure.
//!
//! The WebView never supplies a path or sees a key. A damaged or newer-format file is reported and
//! left untouched; nothing is repaired or recreated automatically.
use crate::archive_keys::{new_key, Key, KeyError, KeyStore};
use crate::archive_vault::{self, VaultError};
use crate::chart_calculation::{self, ChartRequestV1};
use rusqlite::serialize::OwnedData;
use rusqlite::{params, Connection, DatabaseName, ErrorCode, OpenFlags, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::ptr::NonNull;
use std::sync::Mutex;
#[cfg(test)]
use std::time::{SystemTime, UNIX_EPOCH};

const PROTOCOL_VERSION: u8 = 1;
const SCHEMA_VERSION: i64 = 1;
const LEGACY_FILE_NAME: &str = "charts-v1.sqlite3";
const SEALED_FILE_NAME: &str = "charts-v2.vsarchive";
const STAGING_FILE_NAME: &str = "charts-v2.vsarchive.tmp";
const MAX_CHARTS: i64 = 5000;
const MAX_NAME_CHARS: usize = 80;
const MAX_PLACE_CHARS: usize = 160;
const MAX_ZONE_BYTES: usize = 120;
const MAX_SEALED_BYTES: u64 = 16 * 1024 * 1024;

/// One reader-writer at a time: every change is a read, a change and a rewrite of the sealed file.
static ARCHIVE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArchiveRequestV1 {
    pub protocol_version: u8,
    /// `list`, `save`, `delete` or `remove_legacy`.
    pub operation: String,
    pub chart: Option<ChartRecordV1>,
    pub id: Option<String>,
}

/// What the user entered. The id is generated once by the client and never
/// changes, so repeating a save is idempotent.
#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChartRecordV1 {
    pub id: String,
    pub name: String,
    pub utc_iso: String,
    pub time_zone: String,
    pub lat_micro: i32,
    pub lng_micro: i32,
    pub place_name: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SavedChartV1 {
    pub id: String,
    pub name: String,
    pub utc_iso: String,
    pub time_zone: String,
    pub lat_micro: i32,
    pub lng_micro: i32,
    pub place_name: String,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveResponseV1 {
    pub protocol_version: u8,
    /// `ok`, `invalid_request`, `not_found`, `archive_full`, `archive_unavailable`,
    /// `archive_corrupt`, `archive_newer` or `archive_locked`.
    pub status: &'static str,
    /// The whole archive after the operation, present only with `ok`.
    pub charts: Option<Vec<SavedChartV1>>,
    /// The old plain-text file of the first prototype is still on disk.
    pub legacy_present: bool,
}

type Failure = &'static str;

/// What a successful operation hands back.
#[derive(Debug, Clone, PartialEq)]
struct Outcome {
    charts: Vec<SavedChartV1>,
    legacy_present: bool,
}

fn failure(status: Failure) -> ArchiveResponseV1 {
    ArchiveResponseV1 { protocol_version: PROTOCOL_VERSION, status, charts: None, legacy_present: false }
}
#[cfg(all(target_os = "android", feature = "archive-mobile"))]
pub fn unavailable() -> ArchiveResponseV1 { failure("archive_unavailable") }

/// Lowercase canonical UUID text, e.g. from `crypto.randomUUID()`.
fn valid_id(id: &str) -> bool {
    id.len() == 36
        && id.bytes().enumerate().all(|(index, byte)| match index {
            8 | 13 | 18 | 23 => byte == b'-',
            _ => matches!(byte, b'0'..=b'9' | b'a'..=b'f'),
        })
}

/// Display text: bounded, already trimmed, no control or invisible format characters.
fn valid_text(text: &str, max_chars: usize) -> bool {
    text.chars().count() <= max_chars
        && text.trim() == text
        && !text.chars().any(|ch| ch.is_control() || matches!(ch, '\u{200B}'..='\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}' | '\u{FEFF}'))
}

fn valid_zone(zone: &str) -> bool {
    !zone.is_empty()
        && zone.len() <= MAX_ZONE_BYTES
        && zone.split('/').enumerate().all(|(index, part)| {
            let mut bytes = part.bytes();
            match bytes.next() {
                Some(first) if index > 0 || first.is_ascii_alphabetic() => {
                    (first.is_ascii_alphanumeric() || matches!(first, b'_' | b'+' | b'-'))
                        && bytes.all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'+' | b'-'))
                }
                _ => false,
            }
        })
}

fn valid_record(chart: &ChartRecordV1) -> bool {
    let instant_and_place = ChartRequestV1 {
        protocol_version: chart_calculation::PROTOCOL_VERSION,
        utc_iso: chart.utc_iso.clone(),
        lat_micro: chart.lat_micro,
        lng_micro: chart.lng_micro,
    };
    valid_id(&chart.id)
        && valid_text(&chart.name, MAX_NAME_CHARS)
        && valid_text(&chart.place_name, MAX_PLACE_CHARS)
        && valid_zone(&chart.time_zone)
        && chart_calculation::validate(&instant_and_place).is_some()
}

fn classify(error: &rusqlite::Error) -> Failure {
    match error.sqlite_error_code() {
        Some(ErrorCode::NotADatabase | ErrorCode::DatabaseCorrupt) => "archive_corrupt",
        _ => "archive_unavailable",
    }
}

const SCHEMA: &str = "CREATE TABLE saved_charts (
       id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
       name TEXT NOT NULL,
       utc_iso TEXT NOT NULL,
       time_zone TEXT NOT NULL,
       lat_micro INTEGER NOT NULL CHECK (lat_micro BETWEEN -90000000 AND 90000000),
       lng_micro INTEGER NOT NULL CHECK (lng_micro BETWEEN -180000000 AND 180000000),
       place_name TEXT NOT NULL,
       created_at_ms INTEGER NOT NULL,
       updated_at_ms INTEGER NOT NULL
     ) STRICT;
     PRAGMA user_version = 1;";

/// An empty database at the current schema, in memory only.
fn fresh_connection() -> Result<Connection, Failure> {
    let connection = Connection::open_in_memory().map_err(|error| classify(&error))?;
    connection.execute_batch("PRAGMA temp_store=MEMORY;").map_err(|error| classify(&error))?;
    connection.execute_batch(SCHEMA).map_err(|error| classify(&error))?;
    Ok(connection)
}

/// Checks health and schema of a database opened by either path.
fn check_connection(connection: &Connection) -> Result<(), Failure> {
    let health: String =
        connection.query_row("PRAGMA quick_check(1)", [], |row| row.get(0)).map_err(|error| classify(&error))?;
    if health != "ok" {
        return Err("archive_corrupt");
    }
    let version: i64 =
        connection.query_row("PRAGMA user_version", [], |row| row.get(0)).map_err(|error| classify(&error))?;
    match version {
        SCHEMA_VERSION => Ok(()),
        // Written by a newer application: reading it with old rules could lose data.
        newer if newer > SCHEMA_VERSION => Err("archive_newer"),
        _ => Err("archive_corrupt"),
    }
}

/// Hands decrypted database bytes to SQLite as an in-memory database.
fn connection_from_bytes(bytes: &[u8]) -> Result<Connection, Failure> {
    if bytes.is_empty() {
        return Err("archive_corrupt");
    }
    // SQLite takes ownership of memory it allocated itself.
    let data = unsafe {
        let pointer = rusqlite::ffi::sqlite3_malloc64(bytes.len() as u64) as *mut u8;
        let pointer = NonNull::new(pointer).ok_or("archive_unavailable")?;
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), pointer.as_ptr(), bytes.len());
        OwnedData::from_raw_nonnull(pointer, bytes.len())
    };
    let mut connection = Connection::open_in_memory().map_err(|error| classify(&error))?;
    connection.deserialize(DatabaseName::Main, data, false).map_err(|error| classify(&error))?;
    connection.execute_batch("PRAGMA temp_store=MEMORY;").map_err(|error| classify(&error))?;
    check_connection(&connection)?;
    Ok(connection)
}

fn bytes_from_connection(connection: &Connection) -> Result<zeroize::Zeroizing<Vec<u8>>, Failure> {
    let data = connection.serialize(DatabaseName::Main).map_err(|error| classify(&error))?;
    Ok(zeroize::Zeroizing::new(data.to_vec()))
}

fn list(connection: &Connection) -> Result<Vec<SavedChartV1>, Failure> {
    let mut statement = connection
        .prepare(
            "SELECT id,name,utc_iso,time_zone,lat_micro,lng_micro,place_name,created_at_ms,updated_at_ms
             FROM saved_charts ORDER BY name COLLATE NOCASE, created_at_ms, id LIMIT ?1",
        )
        .map_err(|error| classify(&error))?;
    let rows = statement
        .query_map([MAX_CHARTS], |row| {
            Ok(SavedChartV1 {
                id: row.get(0)?,
                name: row.get(1)?,
                utc_iso: row.get(2)?,
                time_zone: row.get(3)?,
                lat_micro: row.get(4)?,
                lng_micro: row.get(5)?,
                place_name: row.get(6)?,
                created_at_ms: row.get(7)?,
                updated_at_ms: row.get(8)?,
            })
        })
        .map_err(|error| classify(&error))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| classify(&error))
}

fn save(connection: &mut Connection, chart: &ChartRecordV1, now_ms: i64, limit: i64) -> Result<(), Failure> {
    let transaction =
        connection.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|error| classify(&error))?;
    let exists: bool = transaction
        .query_row("SELECT EXISTS(SELECT 1 FROM saved_charts WHERE id=?1)", [&chart.id], |row| row.get(0))
        .map_err(|error| classify(&error))?;
    if !exists {
        let count: i64 = transaction
            .query_row("SELECT COUNT(*) FROM saved_charts", [], |row| row.get(0))
            .map_err(|error| classify(&error))?;
        if count >= limit {
            return Err("archive_full");
        }
    }
    transaction
        .execute(
            "INSERT INTO saved_charts
               (id,name,utc_iso,time_zone,lat_micro,lng_micro,place_name,created_at_ms,updated_at_ms)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)
             ON CONFLICT(id) DO UPDATE SET
               name=excluded.name, utc_iso=excluded.utc_iso, time_zone=excluded.time_zone,
               lat_micro=excluded.lat_micro, lng_micro=excluded.lng_micro,
               place_name=excluded.place_name, updated_at_ms=excluded.updated_at_ms",
            params![chart.id, chart.name, chart.utc_iso, chart.time_zone, chart.lat_micro, chart.lng_micro, chart.place_name, now_ms],
        )
        .map_err(|error| classify(&error))?;
    transaction.commit().map_err(|error| classify(&error))
}

fn delete(connection: &Connection, id: &str) -> Result<(), Failure> {
    match connection.execute("DELETE FROM saved_charts WHERE id=?1", [id]) {
        Ok(0) => Err("not_found"),
        Ok(_) => Ok(()),
        Err(error) => Err(classify(&error)),
    }
}

/// Where the archive files live: all inside the one folder the application owns.
#[derive(Debug, Clone)]
pub struct ArchivePaths {
    legacy: PathBuf,
    sealed: PathBuf,
    staging: PathBuf,
    allow_legacy: bool,
}

impl ArchivePaths {
    pub fn in_folder(folder: &Path) -> Self {
        Self {
            legacy: folder.join(LEGACY_FILE_NAME),
            sealed: folder.join(SEALED_FILE_NAME),
            staging: folder.join(STAGING_FILE_NAME),
            allow_legacy: true,
        }
    }
    #[cfg(all(target_os = "android", feature = "archive-mobile"))]
    pub fn mobile(folder: &Path) -> Self {
        Self { allow_legacy:false, ..Self::in_folder(folder) }
    }
}

fn key_failure(_: KeyError) -> Failure {
    "archive_locked"
}

fn vault_failure(error: VaultError) -> Failure {
    match error {
        VaultError::NotAnArchive => "archive_corrupt",
        VaultError::Newer => "archive_newer",
        // Wrong key and altered file look the same: the archive stays locked.
        VaultError::Authentication => "archive_locked",
    }
}

/// The key of this device's archive, created on first use. A key that was stored must read back
/// identically before anything is encrypted with it.
fn key_for_writing(keys: &dyn KeyStore) -> Result<Key, Failure> {
    match keys.load().map_err(key_failure)? {
        Some(key) => Ok(key),
        None => {
            let key = new_key().map_err(key_failure)?;
            keys.store(&key).map_err(key_failure)?;
            match keys.load().map_err(key_failure)? {
                Some(back) if *back == *key => Ok(back),
                _ => Err("archive_locked"),
            }
        }
    }
}

/// Writes ciphertext to the staging file, flushes it, and moves it over the archive. Until the move
/// the previous archive is intact; the staging file holds only ciphertext.
fn write_sealed(paths: &ArchivePaths, sealed: &[u8]) -> Result<(), Failure> {
    use std::io::Write;
    if sealed.len() as u64 > MAX_SEALED_BYTES { return Err("archive_full"); }
    let written = (|| -> std::io::Result<()> {
        let mut file = fs::OpenOptions::new().write(true).create(true).truncate(true).open(&paths.staging)?;
        file.write_all(sealed)?;
        file.sync_all()?;
        Ok(())
    })();
    if written.is_err() {
        let _ = fs::remove_file(&paths.staging);
        return Err("archive_unavailable");
    }
    fs::rename(&paths.staging, &paths.sealed).map_err(|_| {
        let _ = fs::remove_file(&paths.staging);
        "archive_unavailable"
    })
}

fn persist(paths: &ArchivePaths, keys: &dyn KeyStore, connection: &Connection) -> Result<(), Failure> {
    let key = key_for_writing(keys)?;
    let plain = bytes_from_connection(connection)?;
    let sealed = archive_vault::seal(&key, &plain).map_err(key_failure)?;
    write_sealed(paths, &sealed)
}

fn load_sealed(paths: &ArchivePaths, keys: &dyn KeyStore) -> Result<Connection, Failure> {
    use std::io::Read;
    // An existing archive needs its own key: a missing key is never replaced by a new one.
    let key = keys.load().map_err(key_failure)?.ok_or("archive_locked")?;
    if fs::metadata(&paths.sealed).map_err(|_| "archive_unavailable")?.len() > MAX_SEALED_BYTES { return Err("archive_corrupt"); }
    let file=fs::File::open(&paths.sealed).map_err(|_| "archive_unavailable")?;
    let mut sealed=Vec::new(); file.take(MAX_SEALED_BYTES+1).read_to_end(&mut sealed).map_err(|_| "archive_unavailable")?;
    if sealed.len() as u64 > MAX_SEALED_BYTES { return Err("archive_corrupt"); }
    let plain = archive_vault::open(&key, &sealed).map_err(vault_failure)?;
    connection_from_bytes(&plain)
}

/// Reads the legacy plain file without altering it, and checks every row with today's rules.
fn read_legacy(path: &Path) -> Result<Vec<SavedChartV1>, Failure> {
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)
        .map_err(|error| classify(&error))?;
    let health: String =
        connection.query_row("PRAGMA quick_check(1)", [], |row| row.get(0)).map_err(|error| classify(&error))?;
    if health != "ok" {
        return Err("archive_corrupt");
    }
    let version: i64 =
        connection.query_row("PRAGMA user_version", [], |row| row.get(0)).map_err(|error| classify(&error))?;
    match version {
        // An empty file of the first prototype: nothing to bring over.
        0 => return Ok(Vec::new()),
        SCHEMA_VERSION => {}
        newer if newer > SCHEMA_VERSION => return Err("archive_newer"),
        _ => return Err("archive_corrupt"),
    }
    let rows = list(&connection)?;
    let count: i64 =
        connection.query_row("SELECT COUNT(*) FROM saved_charts", [], |row| row.get(0)).map_err(|error| classify(&error))?;
    if count as usize != rows.len() {
        return Err("archive_corrupt");
    }
    for row in &rows {
        let record = ChartRecordV1 {
            id: row.id.clone(),
            name: row.name.clone(),
            utc_iso: row.utc_iso.clone(),
            time_zone: row.time_zone.clone(),
            lat_micro: row.lat_micro,
            lng_micro: row.lng_micro,
            place_name: row.place_name.clone(),
        };
        if !valid_record(&record) {
            return Err("archive_corrupt");
        }
    }
    Ok(rows)
}

/// Brings the legacy file into a new sealed archive: validate, stage, read back, then move. The
/// legacy file is never changed, and a crash at any step leaves it readable.
fn migrate(paths: &ArchivePaths, keys: &dyn KeyStore) -> Result<(), Failure> {
    let rows = read_legacy(&paths.legacy)?;
    let key = key_for_writing(keys)?;
    let connection = fresh_connection()?;
    for row in &rows {
        connection
            .execute(
                "INSERT INTO saved_charts
                   (id,name,utc_iso,time_zone,lat_micro,lng_micro,place_name,created_at_ms,updated_at_ms)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![row.id, row.name, row.utc_iso, row.time_zone, row.lat_micro, row.lng_micro, row.place_name, row.created_at_ms, row.updated_at_ms],
            )
            .map_err(|error| classify(&error))?;
    }
    let plain = bytes_from_connection(&connection)?;
    let sealed = archive_vault::seal(&key, &plain).map_err(key_failure)?;
    // Stage only; the archive is switched after the read-back below.
    {
        use std::io::Write;
        let written = (|| -> std::io::Result<()> {
            let mut file = fs::OpenOptions::new().write(true).create(true).truncate(true).open(&paths.staging)?;
            file.write_all(&sealed)?;
            file.sync_all()?;
            Ok(())
        })();
        if written.is_err() {
            let _ = fs::remove_file(&paths.staging);
            return Err("archive_unavailable");
        }
    }
    // Reopen with the key as the credential store gives it back, and compare with what was validated.
    let verified = (|| -> Result<bool, Failure> {
        let key_again = keys.load().map_err(key_failure)?.ok_or("archive_locked")?;
        let staged = fs::read(&paths.staging).map_err(|_| "archive_unavailable")?;
        let opened = archive_vault::open(&key_again, &staged).map_err(vault_failure)?;
        let reread = list(&connection_from_bytes(&opened)?)?;
        Ok(reread == rows)
    })();
    match verified {
        Ok(true) => fs::rename(&paths.staging, &paths.sealed).map_err(|_| {
            let _ = fs::remove_file(&paths.staging);
            "archive_unavailable"
        }),
        Ok(false) => {
            let _ = fs::remove_file(&paths.staging);
            Err("archive_unavailable")
        }
        Err(failure) => {
            let _ = fs::remove_file(&paths.staging);
            Err(failure)
        }
    }
}

/// The archive in memory, and whether a sealed file already exists for it.
struct Session {
    connection: Connection,
}

fn open_session(paths: &ArchivePaths, keys: &dyn KeyStore) -> Result<Session, Failure> {
    if let Some(folder) = paths.sealed.parent() {
        fs::create_dir_all(folder).map_err(|_| "archive_unavailable")?;
    }
    // A staging file left by an interrupted write holds only ciphertext and is disposable.
    let _ = fs::remove_file(&paths.staging);
    if paths.sealed.exists() {
        return Ok(Session { connection: load_sealed(paths, keys)? });
    }
    if paths.allow_legacy && paths.legacy.exists() {
        migrate(paths, keys)?;
        return Ok(Session { connection: load_sealed(paths, keys)? });
    }
    // First use: nothing is written (and no key is made) until the first chart is saved.
    Ok(Session { connection: fresh_connection()? })
}

fn outcome(paths: &ArchivePaths, connection: &Connection) -> Result<Outcome, Failure> {
    Ok(Outcome { charts: list(connection)?, legacy_present: paths.allow_legacy && paths.legacy.exists() })
}

fn run(paths: &ArchivePaths, keys: &dyn KeyStore, request: &ArchiveRequestV1, now_ms: i64, limit: i64) -> Result<Outcome, Failure> {
    if request.protocol_version != PROTOCOL_VERSION {
        return Err("invalid_request");
    }
    // Validate completely before touching the disk.
    let _guard = ARCHIVE_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    match (request.operation.as_str(), &request.chart, &request.id) {
        ("list", None, None) => {
            let session = open_session(paths, keys)?;
            outcome(paths, &session.connection)
        }
        ("save", Some(chart), None) if valid_record(chart) => {
            let mut session = open_session(paths, keys)?;
            save(&mut session.connection, chart, now_ms, limit)?;
            persist(paths, keys, &session.connection)?;
            outcome(paths, &session.connection)
        }
        ("delete", None, Some(id)) if valid_id(id) => {
            let session = open_session(paths, keys)?;
            delete(&session.connection, id)?;
            persist(paths, keys, &session.connection)?;
            outcome(paths, &session.connection)
        }
        ("remove_legacy", None, None) if paths.allow_legacy => {
            // Only once the sealed archive has been opened successfully (migration included).
            let session = open_session(paths, keys)?;
            if paths.legacy.exists() && paths.sealed.exists() {
                fs::remove_file(&paths.legacy).map_err(|_| "archive_unavailable")?;
            }
            outcome(paths, &session.connection)
        }
        _ => Err("invalid_request"),
    }
}

/// Pure entry point, separated from Tauri so it can be unit tested.
pub fn handle(paths: &ArchivePaths, keys: &dyn KeyStore, request: &ArchiveRequestV1, now_ms: i64) -> ArchiveResponseV1 {
    match run(paths, keys, request, now_ms, MAX_CHARTS) {
        Ok(outcome) => ArchiveResponseV1 {
            protocol_version: PROTOCOL_VERSION,
            status: "ok",
            charts: Some(outcome.charts),
            legacy_present: outcome.legacy_present,
        },
        Err(status) => failure(status),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::archive_keys::fake::FakeKeyStore;

    const ID_A: &str = "11111111-1111-4111-8111-111111111111";
    const ID_B: &str = "22222222-2222-4222-8222-222222222222";
    const SENTINEL: &str = "Sentinella Fittizia Ottanta";

    #[test]
    fn mobile_mode_never_reads_migrates_or_removes_a_legacy_file() {
        let dir=std::env::temp_dir().join(format!("vs-no-legacy-{}-{}",std::process::id(),SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir_all(&dir).unwrap();
        let mut paths=ArchivePaths::in_folder(&dir); paths.allow_legacy=false;
        fs::write(&paths.legacy,b"legacy must stay untouched").unwrap();
        let keys=FakeKeyStore::empty();
        let req=ArchiveRequestV1{protocol_version:1,operation:"list".into(),chart:None,id:None};
        let response=handle(&paths,&keys,&req,1000);
        assert_eq!(response.status,"ok"); assert!(!response.legacy_present); assert!(response.charts.unwrap().is_empty());
        let removal=ArchiveRequestV1{operation:"remove_legacy".into(),..req};
        assert_eq!(handle(&paths,&keys,&removal,1000).status,"invalid_request");
        assert_eq!(fs::read(&paths.legacy).unwrap(),b"legacy must stay untouched");
        assert!(!paths.sealed.exists()); fs::remove_file(paths.legacy).unwrap();fs::remove_dir(dir).unwrap();
    }

    #[test]
    fn shared_frontend_record_fixtures_match_native_validation() {
        let fixtures: Vec<serde_json::Value> = serde_json::from_str(include_str!("../../contracts/chart-archive-v1-fixtures.json")).unwrap();
        for item in fixtures {
            let label = item["case"].as_str().unwrap();
            let expected = item["valid"].as_bool().unwrap();
            let record: ChartRecordV1 = serde_json::from_value(item["record"].clone()).unwrap();
            assert_eq!(valid_record(&record), expected, "{label}");
        }
    }

    /// A unique folder in the system temp directory, removed when the test ends.
    struct TempArchive {
        folder: PathBuf,
        paths: ArchivePaths,
    }
    impl TempArchive {
        fn new(label: &str) -> Self {
            let unique = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
            let mut folder = std::env::temp_dir();
            folder.push(format!("vs-chart-archive-{label}-{}-{unique}", std::process::id()));
            let paths = ArchivePaths::in_folder(&folder);
            Self { folder, paths }
        }
        fn files(&self) -> Vec<String> {
            let mut names: Vec<String> = match fs::read_dir(&self.folder) {
                Ok(entries) => entries.map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned()).collect(),
                Err(_) => Vec::new(),
            };
            names.sort();
            names
        }
    }
    impl Drop for TempArchive {
        fn drop(&mut self) {
            let temp = std::env::temp_dir();
            let ours = self.folder.file_name().and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("vs-chart-archive-"));
            let resolved = fs::canonicalize(&self.folder).ok();
            let temp = fs::canonicalize(temp).ok();
            let in_temp = resolved.as_ref().and_then(|path| path.parent()) == temp.as_deref() && temp.is_some();
            let not_link = fs::symlink_metadata(&self.folder).is_ok_and(|meta| !meta.file_type().is_symlink());
            if in_temp && ours && not_link { let _ = fs::remove_dir_all(&self.folder); }
        }
    }

    // Visibly fictional subjects.
    fn record(id: &str, name: &str) -> ChartRecordV1 {
        ChartRecordV1 {
            id: id.to_string(),
            name: name.to_string(),
            utc_iso: "2001-02-03T04:05:06.000Z".to_string(),
            time_zone: "Europe/Rome".to_string(),
            lat_micro: 44_697_805,
            lng_micro: 11_805_778,
            place_name: "Luogo di prova".to_string(),
        }
    }
    fn request(operation: &str) -> ArchiveRequestV1 {
        ArchiveRequestV1 { protocol_version: 1, operation: operation.into(), chart: None, id: None }
    }
    fn list_request() -> ArchiveRequestV1 { request("list") }
    fn save_request(chart: ChartRecordV1) -> ArchiveRequestV1 {
        ArchiveRequestV1 { chart: Some(chart), ..request("save") }
    }
    fn delete_request(id: &str) -> ArchiveRequestV1 {
        ArchiveRequestV1 { id: Some(id.into()), ..request("delete") }
    }
    fn go(archive: &TempArchive, keys: &FakeKeyStore, request: &ArchiveRequestV1, now_ms: i64) -> ArchiveResponseV1 {
        handle(&archive.paths, keys, request, now_ms)
    }

    /// A plain SQLite archive of the first prototype, as it was written then.
    fn write_legacy(archive: &TempArchive, rows: &[(&str, &str, i64, i64)], extra: &str) {
        fs::create_dir_all(&archive.folder).unwrap();
        let connection = Connection::open(&archive.paths.legacy).unwrap();
        connection.execute_batch(SCHEMA).unwrap();
        for (id, name, created, updated) in rows {
            connection
                .execute(
                    "INSERT INTO saved_charts VALUES (?1,?2,'2001-02-03T04:05:06.000Z','Europe/Rome',44697805,11805778,'Luogo di prova',?3,?4)",
                    params![id, name, created, updated],
                )
                .unwrap();
        }
        if !extra.is_empty() {
            connection.execute_batch(extra).unwrap();
        }
    }

    #[test]
    fn test_first_use_writes_nothing_and_makes_no_key() {
        let archive = TempArchive::new("first");
        let keys = FakeKeyStore::empty();
        let response = go(&archive, &keys, &list_request(), 1000);
        assert_eq!(response.status, "ok");
        assert_eq!(response.charts, Some(vec![]));
        assert!(!response.legacy_present);
        assert!(archive.files().is_empty());
        assert!(keys.key.borrow().is_none());
    }

    #[test]
    fn test_saving_creates_one_sealed_file_and_no_plain_text_anywhere() {
        let archive = TempArchive::new("sealed");
        let keys = FakeKeyStore::empty();
        assert_eq!(go(&archive, &keys, &save_request(record(ID_A, SENTINEL)), 1000).status, "ok");
        // Exactly the sealed file: no journal, no staging copy, no legacy file.
        assert_eq!(archive.files(), [SEALED_FILE_NAME]);
        let bytes = fs::read(&archive.paths.sealed).unwrap();
        assert_eq!(&bytes[..8], archive_vault::MAGIC);
        assert!(!bytes.starts_with(b"SQLite format 3"));
        for needle in [SENTINEL, "Luogo di prova", "Europe/Rome", "saved_charts", "2001-02-03"] {
            assert!(!bytes.windows(needle.len()).any(|window| window == needle.as_bytes()), "plain text found: {needle}");
        }
        assert!(keys.key.borrow().is_some(), "the key is made when the first chart is saved");
    }

    #[test]
    fn test_saved_charts_survive_reopening_and_are_listed_by_name() {
        let archive = TempArchive::new("persist");
        let keys = FakeKeyStore::empty();
        assert_eq!(go(&archive, &keys, &save_request(record(ID_B, "Zeta di prova")), 1000).status, "ok");
        let after = go(&archive, &keys, &save_request(record(ID_A, "alfa di prova")), 2000);
        assert_eq!(after.charts.as_ref().unwrap().len(), 2);
        // A new call opens the file again, as after restarting the application.
        let listed = go(&archive, &keys, &list_request(), 3000).charts.unwrap();
        assert_eq!(listed.iter().map(|chart| chart.name.as_str()).collect::<Vec<_>>(), ["alfa di prova", "Zeta di prova"]);
        assert_eq!(listed[0].id, ID_A);
        assert_eq!(listed[0].utc_iso, "2001-02-03T04:05:06.000Z");
        assert_eq!((listed[0].lat_micro, listed[0].lng_micro), (44_697_805, 11_805_778));
        assert_eq!((listed[0].created_at_ms, listed[0].updated_at_ms), (2000, 2000));
    }

    #[test]
    fn test_saving_the_same_id_again_updates_in_place_and_keeps_the_creation_time() {
        let archive = TempArchive::new("update");
        let keys = FakeKeyStore::empty();
        go(&archive, &keys, &save_request(record(ID_A, "Prima versione")), 1000);
        let mut edited = record(ID_A, "Seconda versione");
        edited.lat_micro = -33_868_800;
        let listed = go(&archive, &keys, &save_request(edited), 5000).charts.unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, "Seconda versione");
        assert_eq!(listed[0].lat_micro, -33_868_800);
        assert_eq!((listed[0].created_at_ms, listed[0].updated_at_ms), (1000, 5000));
    }

    #[test]
    fn test_delete_removes_one_chart_and_reports_an_unknown_id() {
        let archive = TempArchive::new("delete");
        let keys = FakeKeyStore::empty();
        go(&archive, &keys, &save_request(record(ID_A, "Da tenere")), 1000);
        go(&archive, &keys, &save_request(record(ID_B, "Da eliminare")), 1000);
        let listed = go(&archive, &keys, &delete_request(ID_B), 2000).charts.unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, ID_A);
        assert_eq!(go(&archive, &keys, &delete_request(ID_B), 3000).status, "not_found");
        assert_eq!(go(&archive, &keys, &list_request(), 4000).charts.unwrap().len(), 1);
        // The deleted chart is gone from the sealed bytes too (a fresh file was written).
        assert_eq!(archive.files(), [SEALED_FILE_NAME]);
    }

    #[test]
    fn test_invalid_requests_are_rejected_without_touching_disk_or_key() {
        let archive = TempArchive::new("invalid");
        let keys = FakeKeyStore::empty();
        let mut bad_requests = vec![
            ArchiveRequestV1 { protocol_version: 2, ..list_request() },
            ArchiveRequestV1 { operation: "drop".into(), ..list_request() },
            ArchiveRequestV1 { id: Some(ID_A.into()), ..list_request() },
            ArchiveRequestV1 { chart: Some(record(ID_A, "x")), ..request("remove_legacy") },
            ArchiveRequestV1 { chart: None, ..save_request(record(ID_A, "x")) },
            delete_request("not-an-id"),
            delete_request("11111111-1111-4111-8111-11111111111G"),
            delete_request("11111111-1111-4111-8111-1111111111111"),
            delete_request(&ID_A.to_uppercase().replace('1', "A")),
        ];
        let mutate = |change: fn(&mut ChartRecordV1)| {
            let mut chart = record(ID_A, "Soggetto di prova");
            change(&mut chart);
            save_request(chart)
        };
        bad_requests.extend([
            mutate(|chart| chart.id = "../../etc".into()),
            mutate(|chart| chart.name = "x".repeat(81)),
            mutate(|chart| chart.name = " spazio iniziale".into()),
            mutate(|chart| chart.name = "riga\nnuova".into()),
            mutate(|chart| chart.name = "nascosto\u{202E}".into()),
            mutate(|chart| chart.place_name = "p".repeat(161)),
            mutate(|chart| chart.utc_iso = "2001-02-03T04:05:06+01:00".into()),
            mutate(|chart| chart.utc_iso = "2001-02-30T04:05:06Z".into()),
            mutate(|chart| chart.time_zone = "+01:00".into()),
            mutate(|chart| chart.time_zone = "Europe/../Rome".into()),
            mutate(|chart| chart.time_zone = "Europe/Rome; DROP".into()),
            mutate(|chart| chart.time_zone = String::new()),
            mutate(|chart| chart.lat_micro = 90_000_001),
            mutate(|chart| chart.lng_micro = -180_000_001),
        ]);
        for (index, bad) in bad_requests.iter().enumerate() {
            assert_eq!(go(&archive, &keys, bad, 1000).status, "invalid_request", "request {index}");
        }
        assert!(archive.files().is_empty(), "validation must happen before any disk access");
        assert!(keys.key.borrow().is_none(), "and before any key is made");
        // An empty name is allowed: the interface shows "unnamed chart".
        assert_eq!(go(&archive, &keys, &save_request(record(ID_A, "")), 1000).status, "ok");
    }

    #[test]
    fn test_text_that_looks_like_sql_is_stored_as_text() {
        let archive = TempArchive::new("literal");
        let keys = FakeKeyStore::empty();
        let name = "Robert'); DROP TABLE saved_charts;--";
        go(&archive, &keys, &save_request(record(ID_A, name)), 1000);
        let listed = go(&archive, &keys, &list_request(), 2000).charts.unwrap();
        assert_eq!(listed[0].name, name);
    }

    #[test]
    fn test_a_full_archive_refuses_new_charts_but_still_updates_existing_ones() {
        let archive = TempArchive::new("full");
        let keys = FakeKeyStore::empty();
        assert!(run(&archive.paths, &keys, &save_request(record(ID_A, "Primo")), 1000, 1).is_ok());
        assert_eq!(run(&archive.paths, &keys, &save_request(record(ID_B, "Secondo")), 2000, 1), Err("archive_full"));
        let updated = run(&archive.paths, &keys, &save_request(record(ID_A, "Primo modificato")), 3000, 1).unwrap();
        assert_eq!(updated.charts.len(), 1);
        assert_eq!(updated.charts[0].name, "Primo modificato");
    }

    #[test]
    fn test_an_unavailable_key_store_locks_the_archive_and_never_falls_back_to_plain_text() {
        let archive = TempArchive::new("nokey-first");
        let keys = FakeKeyStore::empty();
        *keys.unavailable.borrow_mut() = true;
        assert_eq!(go(&archive, &keys, &save_request(record(ID_A, SENTINEL)), 1000).status, "archive_locked");
        assert!(archive.files().is_empty(), "no file of any kind is written without a key");
        // And an archive that exists stays closed, byte for byte.
        *keys.unavailable.borrow_mut() = false;
        go(&archive, &keys, &save_request(record(ID_A, SENTINEL)), 2000);
        let before = fs::read(&archive.paths.sealed).unwrap();
        *keys.unavailable.borrow_mut() = true;
        for operation in [list_request(), save_request(record(ID_B, "Altro")), delete_request(ID_A)] {
            assert_eq!(go(&archive, &keys, &operation, 3000).status, "archive_locked");
        }
        assert_eq!(fs::read(&archive.paths.sealed).unwrap(), before);
        assert_eq!(archive.files(), [SEALED_FILE_NAME]);
    }

    #[test]
    fn test_a_missing_or_wrong_key_keeps_the_archive_locked_and_untouched() {
        let archive = TempArchive::new("wrongkey");
        let keys = FakeKeyStore::empty();
        go(&archive, &keys, &save_request(record(ID_A, SENTINEL)), 1000);
        let before = fs::read(&archive.paths.sealed).unwrap();
        let original = *keys.key.borrow();
        // The credential is gone: a new key must NOT be made over an existing archive.
        *keys.key.borrow_mut() = None;
        assert_eq!(go(&archive, &keys, &list_request(), 2000).status, "archive_locked");
        assert_eq!(go(&archive, &keys, &save_request(record(ID_B, "Altro")), 2000).status, "archive_locked");
        assert!(keys.key.borrow().is_none());
        // A different key opens nothing.
        *keys.key.borrow_mut() = Some(*new_key().unwrap());
        assert_eq!(go(&archive, &keys, &list_request(), 3000).status, "archive_locked");
        assert_eq!(fs::read(&archive.paths.sealed).unwrap(), before);
        // The right key still opens it.
        *keys.key.borrow_mut() = original;
        assert_eq!(go(&archive, &keys, &list_request(), 4000).charts.unwrap().len(), 1);
    }

    #[test]
    fn test_a_tampered_truncated_or_foreign_file_is_reported_and_left_untouched() {
        let archive = TempArchive::new("tamper");
        let keys = FakeKeyStore::empty();
        go(&archive, &keys, &save_request(record(ID_A, SENTINEL)), 1000);
        let good = fs::read(&archive.paths.sealed).unwrap();
        let mut flipped = good.clone();
        let middle = flipped.len() / 2;
        flipped[middle] ^= 0x01;
        let mut newer = good.clone();
        newer[8] = archive_vault::FORMAT_VERSION + 1;
        let cases: Vec<(&str, Vec<u8>, &str)> = vec![
            ("flipped", flipped, "archive_locked"),
            ("truncated", good[..20].to_vec(), "archive_corrupt"),
            ("foreign", b"this is not a sealed archive, it is a damaged file ".repeat(40), "archive_corrupt"),
            ("newer", newer, "archive_newer"),
        ];
        for (label, bytes, expected) in cases {
            fs::write(&archive.paths.sealed, &bytes).unwrap();
            for operation in [list_request(), save_request(record(ID_B, "Altro")), delete_request(ID_A)] {
                assert_eq!(go(&archive, &keys, &operation, 2000).status, expected, "{label}");
            }
            assert_eq!(fs::read(&archive.paths.sealed).unwrap(), bytes, "{label}: file must not change");
        }
    }

    #[test]
    fn test_an_interrupted_write_leaves_a_disposable_staging_file_and_the_archive_intact() {
        let archive = TempArchive::new("staging");
        let keys = FakeKeyStore::empty();
        go(&archive, &keys, &save_request(record(ID_A, "Prima")), 1000);
        let before = fs::read(&archive.paths.sealed).unwrap();
        // A crash after staging and before the move.
        fs::write(&archive.paths.staging, b"half-written ciphertext").unwrap();
        let listed = go(&archive, &keys, &list_request(), 2000).charts.unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(archive.files(), [SEALED_FILE_NAME], "the stale staging file is removed");
        assert_eq!(fs::read(&archive.paths.sealed).unwrap(), before);
    }

    #[test]
    fn test_the_plain_prototype_archive_migrates_exactly_and_is_kept() {
        let archive = TempArchive::new("migrate");
        let keys = FakeKeyStore::empty();
        write_legacy(&archive, &[(ID_B, "Zeta di prova", 1_000, 9_000), (ID_A, SENTINEL, 2_000, 2_500)], "");
        let legacy_before = fs::read(&archive.paths.legacy).unwrap();
        let response = go(&archive, &keys, &list_request(), 5_000);
        assert_eq!(response.status, "ok");
        assert!(response.legacy_present, "the plain file is still there");
        let charts = response.charts.unwrap();
        assert_eq!(charts.iter().map(|chart| chart.id.as_str()).collect::<Vec<_>>(), [ID_A, ID_B]);
        let by_id = |id: &str| charts.iter().find(|chart| chart.id == id).unwrap();
        assert_eq!((by_id(ID_B).created_at_ms, by_id(ID_B).updated_at_ms), (1_000, 9_000));
        assert_eq!((by_id(ID_A).created_at_ms, by_id(ID_A).updated_at_ms), (2_000, 2_500));
        assert_eq!(by_id(ID_A).utc_iso, "2001-02-03T04:05:06.000Z");
        assert_eq!((by_id(ID_A).lat_micro, by_id(ID_A).lng_micro), (44_697_805, 11_805_778));
        // The sealed file exists, holds no plain text, and the legacy file is byte-identical.
        let sealed = fs::read(&archive.paths.sealed).unwrap();
        assert!(!sealed.windows(SENTINEL.len()).any(|window| window == SENTINEL.as_bytes()));
        assert_eq!(fs::read(&archive.paths.legacy).unwrap(), legacy_before);
        assert_eq!(archive.files(), [LEGACY_FILE_NAME, SEALED_FILE_NAME]);
        // A second start opens the sealed archive and does not migrate again.
        assert_eq!(go(&archive, &keys, &list_request(), 6_000).charts.unwrap(), charts);
        assert_eq!(fs::read(&archive.paths.sealed).unwrap(), sealed);
    }

    #[test]
    fn test_migration_stops_without_a_key_and_changes_nothing() {
        let archive = TempArchive::new("migrate-nokey");
        let keys = FakeKeyStore::empty();
        write_legacy(&archive, &[(ID_A, SENTINEL, 1, 1)], "");
        let legacy_before = fs::read(&archive.paths.legacy).unwrap();
        *keys.unavailable.borrow_mut() = true;
        assert_eq!(go(&archive, &keys, &list_request(), 1000).status, "archive_locked");
        assert_eq!(archive.files(), [LEGACY_FILE_NAME]);
        assert_eq!(fs::read(&archive.paths.legacy).unwrap(), legacy_before);
    }

    #[test]
    fn test_a_corrupt_newer_or_invalid_legacy_archive_is_refused_and_left_untouched() {
        let corrupt = TempArchive::new("legacy-corrupt");
        let keys = FakeKeyStore::empty();
        fs::create_dir_all(&corrupt.folder).unwrap();
        let garbage = b"this is not a SQLite database, it is a damaged archive ".repeat(40);
        fs::write(&corrupt.paths.legacy, &garbage).unwrap();
        assert_eq!(go(&corrupt, &keys, &list_request(), 1000).status, "archive_corrupt");
        assert_eq!(fs::read(&corrupt.paths.legacy).unwrap(), garbage);
        assert_eq!(corrupt.files(), [LEGACY_FILE_NAME]);

        let newer = TempArchive::new("legacy-newer");
        write_legacy(&newer, &[(ID_A, SENTINEL, 1, 1)], "PRAGMA user_version = 2;");
        let newer_before = fs::read(&newer.paths.legacy).unwrap();
        assert_eq!(go(&newer, &keys, &list_request(), 1000).status, "archive_newer");
        assert_eq!(fs::read(&newer.paths.legacy).unwrap(), newer_before);
        assert_eq!(newer.files(), [LEGACY_FILE_NAME]);

        // A row that today's rules would never accept stops the whole migration.
        let invalid = TempArchive::new("legacy-invalid");
        write_legacy(&invalid, &[(ID_A, SENTINEL, 1, 1)], "UPDATE saved_charts SET time_zone='Europe/../Rome';");
        let invalid_before = fs::read(&invalid.paths.legacy).unwrap();
        assert_eq!(go(&invalid, &keys, &list_request(), 1000).status, "archive_corrupt");
        assert_eq!(fs::read(&invalid.paths.legacy).unwrap(), invalid_before);
        assert_eq!(invalid.files(), [LEGACY_FILE_NAME]);
        assert!(keys.key.borrow().is_none(), "no key is made for an archive that is refused");
    }

    #[test]
    fn test_an_empty_prototype_archive_migrates_to_an_empty_sealed_one() {
        let archive = TempArchive::new("legacy-empty");
        let keys = FakeKeyStore::empty();
        fs::create_dir_all(&archive.folder).unwrap();
        drop(Connection::open(&archive.paths.legacy).unwrap());
        let response = go(&archive, &keys, &list_request(), 1000);
        assert_eq!(response.status, "ok");
        assert_eq!(response.charts, Some(vec![]));
        assert!(archive.paths.sealed.exists());
    }

    #[test]
    fn test_when_both_exist_the_sealed_archive_wins_and_the_legacy_file_is_ignored() {
        let archive = TempArchive::new("both");
        let keys = FakeKeyStore::empty();
        go(&archive, &keys, &save_request(record(ID_A, "Nel sigillato")), 1000);
        write_legacy(&archive, &[(ID_B, "Solo nel vecchio file", 1, 1)], "");
        let response = go(&archive, &keys, &list_request(), 2000);
        assert_eq!(response.charts.unwrap().iter().map(|chart| chart.name.as_str()).collect::<Vec<_>>(), ["Nel sigillato"]);
        assert!(response.legacy_present);
    }

    #[test]
    fn test_removing_the_legacy_file_is_explicit_and_only_after_the_sealed_archive_opens() {
        let archive = TempArchive::new("remove-legacy");
        let keys = FakeKeyStore::empty();
        write_legacy(&archive, &[(ID_A, SENTINEL, 1, 1)], "");
        // Without the key the migration cannot happen, so nothing may be removed.
        *keys.unavailable.borrow_mut() = true;
        assert_eq!(go(&archive, &keys, &request("remove_legacy"), 1000).status, "archive_locked");
        assert!(archive.paths.legacy.exists());
        *keys.unavailable.borrow_mut() = false;
        let removed = go(&archive, &keys, &request("remove_legacy"), 2000);
        assert_eq!(removed.status, "ok");
        assert!(!removed.legacy_present);
        assert_eq!(removed.charts.unwrap().len(), 1, "the charts survive in the sealed archive");
        assert_eq!(archive.files(), [SEALED_FILE_NAME]);
        // Asking again is harmless.
        assert_eq!(go(&archive, &keys, &request("remove_legacy"), 3000).status, "ok");
    }

    #[test]
    fn test_wire_format_matches_the_typescript_contract() {
        let archive = TempArchive::new("wire");
        let keys = FakeKeyStore::empty();
        let raw = serde_json::to_value(go(&archive, &keys, &save_request(record(ID_A, "Soggetto")), 1234)).unwrap();
        assert_eq!(raw["protocolVersion"], 1);
        assert_eq!(raw["status"], "ok");
        assert_eq!(raw["legacyPresent"], false);
        let chart = &raw["charts"][0];
        for key in ["id", "name", "utcIso", "timeZone", "latMicro", "lngMicro", "placeName", "createdAtMs", "updatedAtMs"] {
            assert!(!chart[key].is_null(), "missing key {key}");
        }
        let extra = r#"{"protocolVersion":1,"operation":"list","chart":null,"id":null,"path":"C:/x"}"#;
        assert!(serde_json::from_str::<ArchiveRequestV1>(extra).is_err());
        let minimal = r#"{"protocolVersion":1,"operation":"list"}"#;
        assert!(serde_json::from_str::<ArchiveRequestV1>(minimal).is_ok());
        let failed = serde_json::to_value(failure("archive_locked")).unwrap();
        assert!(failed["charts"].is_null());
        assert_eq!(failed["status"], "archive_locked");
    }
}
