//! Bounded, app-owned ephemeris imports. The WebView never supplies a path.
use serde::Serialize;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, atomic::{AtomicU64, Ordering}};
use tauri::Manager;

const MAX_BYTES: u64 = 8 * 1024 * 1024 * 1024;
const MAX_CHUNK: usize = 64 * 1024;
const STAGING: &str = "de441-import.part";
const INSTALLED: &str = "de441-imported.eph";
#[derive(Clone, Copy)]
enum Kind { De441, Usno, Chiron }

struct Import {
    id: u64,
    expected: u64,
    written: u64,
    staged: PathBuf,
    destination: PathBuf,
    file: File,
    kind: Kind,
}
static CURRENT: Mutex<Option<Import>> = Mutex::new(None);
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataStatus {
    available: bool,
    installed_bytes: Option<u64>,
    start_julian_day_tdb: Option<f64>,
    end_julian_day_tdb: Option<f64>,
    usno: Option<UsnoStatus>,
    chiron: Option<RangeStatus>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UsnoStatus { start_julian_day_ut: f64, end_julian_day_ut: f64, predictions: bool }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RangeStatus { start_julian_day_tdb: f64, end_julian_day_tdb: f64 }

fn folder(app: &tauri::AppHandle) -> Result<PathBuf, &'static str> {
    app.path().app_local_data_dir().map(|p| p.join("ephemeris")).map_err(|_| "unavailable")
}

#[cfg(test)]
fn begin_at(dir: &Path, expected: u64, id: u64) -> Result<Import, &'static str> { begin_kind_at(dir, expected, id, Kind::De441, None) }
fn begin_kind_at(dir: &Path, expected: u64, id: u64, kind: Kind, parts: Option<&[u64]>) -> Result<Import, &'static str> {
    use crate::virgostars_provider::{USNO_PART_LIMIT, CHIRON_LIMIT, IMPORTED_USNO, IMPORTED_CHIRON};
    let (staging, installed) = match kind {
        Kind::De441 if expected > 0 && expected <= MAX_BYTES && parts.is_none() => (STAGING, INSTALLED),
        Kind::Chiron if expected > 0 && expected <= CHIRON_LIMIT && parts.is_none() => ("chiron-import.part", IMPORTED_CHIRON),
        Kind::Usno => {
            let p=parts.ok_or("invalid_size")?;
            if p.len()!=3 || p[0]==0 || p[1]==0 || p.iter().any(|n| *n>USNO_PART_LIMIT) || p.iter().sum::<u64>() != expected { return Err("invalid_size"); }
            ("usno-import.part", IMPORTED_USNO)
        },
        _ => return Err("invalid_size"),
    };
    fs::create_dir_all(dir).map_err(|_| "storage_error")?;
    let staged = dir.join(staging);
    // This fixed, app-owned staging file cannot be selected by the WebView.
    match fs::remove_file(&staged) { Ok(()) => (), Err(e) if e.kind() == std::io::ErrorKind::NotFound => (), Err(_) => return Err("storage_error") }
    let mut file = OpenOptions::new().write(true).create_new(true).open(&staged).map_err(|_| "storage_error")?;
    if let Some(p) = parts { if matches!(kind, Kind::Usno) {
        if file.write_all(b"VSUSNO01").and_then(|_| { for n in p { file.write_all(&(*n as u32).to_le_bytes())?; } Ok(()) }).is_err() { drop(file); let _=fs::remove_file(&staged); return Err("storage_error"); }
    }}
    Ok(Import { id, expected, written: 0, staged, destination: dir.join(installed), file, kind })
}

fn append(import: &mut Import, offset: u64, bytes: &[u8]) -> Result<(), &'static str> {
    if bytes.is_empty() || bytes.len() > MAX_CHUNK || offset != import.written || bytes.len() as u64 > import.expected - import.written {
        return Err("invalid_chunk");
    }
    import.file.write_all(bytes).map_err(|_| "storage_error")?;
    import.written += bytes.len() as u64;
    Ok(())
}

fn discard(import: Import) {
    let path = import.staged.clone();
    drop(import);
    let _ = fs::remove_file(path);
}

fn finish(import: Import) -> Result<(), &'static str> {
    if import.written != import.expected { discard(import); return Err("incomplete"); }
    if import.file.sync_all().is_err() { discard(import); return Err("storage_error"); }
    let staged = import.staged.clone();
    let destination = import.destination.clone();
    let kind = import.kind;
    drop(import);
    let valid = match kind {
        Kind::De441 => crate::virgostars_provider::validate_de441(&staged).is_some(),
        Kind::Usno => crate::virgostars_provider::load_usno_bundle(&staged).is_some(),
        Kind::Chiron => crate::virgostars_provider::validate_chiron(&staged).is_some(),
    };
    if !valid {
        let _ = fs::remove_file(&staged);
        return Err("invalid_file");
    }
    if crate::virgostars_provider::install_de441(&staged, &destination).is_err() {
        let _ = fs::remove_file(&staged);
        return Err("storage_error");
    }
    Ok(())
}

#[tauri::command]
pub async fn ephemeris_status(app: tauri::AppHandle) -> Result<DataStatus, &'static str> {
    let base=folder(&app)?;
    let paths=crate::virgostars_provider::configured_data_paths();
    Ok(status_at(&base, paths.as_ref(), crate::virgostars_provider::data_available()))
}

fn status_at(base:&Path, paths:Option<&crate::virgostars_provider::DataPaths>, available:bool) -> DataStatus {
    let path=paths.as_ref().map(|p|p.de441.clone()).unwrap_or_else(||base.join(INSTALLED));
    let coverage=crate::virgostars_provider::validate_de441(&path);
    let size=coverage.and_then(|_| fs::metadata(path).ok().map(|m|m.len()));
    let imported_usno=base.join(crate::virgostars_provider::IMPORTED_USNO);
    let bundle=paths.as_ref().and_then(|p|p.usno_bundle.as_deref()).unwrap_or(&imported_usno);
    let table=if bundle.exists() {crate::virgostars_provider::load_usno_bundle(bundle).map(|(t,_)|t)}
        else {paths.as_ref().and_then(|p|p.usno_directory.as_deref()).and_then(crate::virgostars_provider::load_delta_t)};
    let usno=table.map(|t| UsnoStatus { start_julian_day_ut:t.first_jd_ut(),end_julian_day_ut:t.last_jd_ut(),predictions:t.last_jd_ut()>t.last_measured_jd_ut() });
    let imported_chiron=base.join(crate::virgostars_provider::IMPORTED_CHIRON);
    let chiron_path=paths.as_ref().and_then(|p|p.chiron_spk.as_deref()).unwrap_or(&imported_chiron);
    let chiron=crate::virgostars_provider::validate_chiron(chiron_path).map(|(start,end)|RangeStatus{start_julian_day_tdb:start,end_julian_day_tdb:end});
    DataStatus { available, installed_bytes: size,
        start_julian_day_tdb: coverage.map(|v| v.0), end_julian_day_tdb: coverage.map(|v| v.1), usno, chiron }
}

#[tauri::command]
pub async fn ephemeris_import_begin(app: tauri::AppHandle, size: u64, kind: Option<String>, parts: Option<Vec<u64>>) -> Result<u64, &'static str> {
    let mut current = CURRENT.lock().map_err(|_| "unavailable")?;
    if current.is_some() { return Err("busy"); }
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let kind=match kind.as_deref() { None | Some("de441") => Kind::De441, Some("usno") => Kind::Usno, Some("chiron") => Kind::Chiron, _ => return Err("invalid_size") };
    *current = Some(begin_kind_at(&folder(&app)?, size, id, kind, parts.as_deref())?);
    Ok(id)
}

#[tauri::command]
pub async fn ephemeris_import_chunk(id: u64, offset: u64, bytes: Vec<u8>) -> Result<(), &'static str> {
    let mut current = CURRENT.lock().map_err(|_| "unavailable")?;
    let import = current.as_mut().filter(|i| i.id == id).ok_or("invalid_session")?;
    if let Err(error) = append(import, offset, &bytes) {
        discard(current.take().expect("current import"));
        return Err(error);
    }
    Ok(())
}

#[tauri::command]
pub async fn ephemeris_import_finish(id: u64) -> Result<(), &'static str> {
    let mut current = CURRENT.lock().map_err(|_| "unavailable")?;
    if current.as_ref().map(|i| i.id) != Some(id) { return Err("invalid_session"); }
    finish(current.take().expect("current import"))
}

#[tauri::command]
pub async fn ephemeris_import_cancel(id: u64) -> Result<(), &'static str> {
    let mut current = CURRENT.lock().map_err(|_| "unavailable")?;
    if current.as_ref().map(|i| i.id) != Some(id) { return Err("invalid_session"); }
    discard(current.take().expect("current import"));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn directory() -> PathBuf {
        let n = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        std::env::temp_dir().join(format!("vs-import-{}-{n}", std::process::id()))
    }
    #[test]
    fn bad_or_incomplete_updates_preserve_the_old_file() {
        let dir = directory(); fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(INSTALLED), b"old").unwrap();
        let mut incomplete = begin_at(&dir, 4, 1).unwrap();
        append(&mut incomplete, 0, b"x").unwrap();
        assert_eq!(finish(incomplete), Err("incomplete"));
        let mut invalid = begin_at(&dir, 4, 2).unwrap();
        assert_eq!(append(&mut invalid, 1, b"xxxx"), Err("invalid_chunk"));
        append(&mut invalid, 0, b"xxxx").unwrap();
        assert_eq!(finish(invalid), Err("invalid_file"));
        assert_eq!(fs::read(dir.join(INSTALLED)).unwrap(), b"old");
        assert!(!dir.join(STAGING).exists());
        fs::remove_file(dir.join(INSTALLED)).unwrap(); fs::remove_dir(dir).unwrap();
    }
    #[test]
    fn auxiliary_limits_and_invalid_updates_preserve_existing_files() {
        use crate::virgostars_provider::{IMPORTED_USNO,IMPORTED_CHIRON,USNO_PART_LIMIT,CHIRON_LIMIT};
        let dir=directory(); fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(IMPORTED_USNO),b"old-usno").unwrap();
        fs::write(dir.join(IMPORTED_CHIRON),b"old-chiron").unwrap();
        assert!(begin_kind_at(&dir,2,1,Kind::Usno,Some(&[1,0,1])).is_err());
        assert!(begin_kind_at(&dir,USNO_PART_LIMIT+2,1,Kind::Usno,Some(&[USNO_PART_LIMIT+1,1,0])).is_err());
        assert!(begin_kind_at(&dir,CHIRON_LIMIT+1,1,Kind::Chiron,None).is_err());
        let mut u=begin_kind_at(&dir,3,1,Kind::Usno,Some(&[1,1,1])).unwrap();
        append(&mut u,0,b"bad").unwrap(); assert_eq!(finish(u),Err("invalid_file"));
        let mut c=begin_kind_at(&dir,3,2,Kind::Chiron,None).unwrap();
        append(&mut c,0,b"bad").unwrap(); assert_eq!(finish(c),Err("invalid_file"));
        assert_eq!(fs::read(dir.join(IMPORTED_USNO)).unwrap(),b"old-usno");
        assert_eq!(fs::read(dir.join(IMPORTED_CHIRON)).unwrap(),b"old-chiron");
        fs::remove_file(dir.join(IMPORTED_USNO)).unwrap(); fs::remove_file(dir.join(IMPORTED_CHIRON)).unwrap(); fs::remove_dir(dir).unwrap();
    }
    #[test]
    #[ignore = "requires externally supplied USNO and Chiron data"]
    fn real_auxiliary_data_imports_and_failed_updates_keep_the_old_data() {
        use crate::virgostars_provider::{IMPORTED_USNO,IMPORTED_CHIRON};
        let dir=directory();
        let usno=PathBuf::from(std::env::var_os("VIRGOSTARS_USNO_DIR").unwrap());
        let monthly=fs::read(usno.join("deltat.data")).unwrap();
        let historic=fs::read(usno.join("historic_deltat.data")).unwrap();
        let preds=fs::read(usno.join("deltat.preds")).unwrap();
        let parts=[monthly.len() as u64,historic.len() as u64,preds.len() as u64];
        let mut u=begin_kind_at(&dir,parts.iter().sum(),1,Kind::Usno,Some(&parts)).unwrap();
        for bytes in [&monthly,&historic,&preds] { for chunk in bytes.chunks(MAX_CHUNK) { let offset=u.written; append(&mut u,offset,chunk).unwrap(); } }
        finish(u).unwrap();
        let (table,present)=crate::virgostars_provider::load_usno_bundle(&dir.join(IMPORTED_USNO)).unwrap();
        assert!(present && table.last_jd_ut()>table.last_measured_jd_ut());
        let empty_preds=b"header only\n";
        let bad_parts=[monthly.len() as u64,historic.len() as u64,empty_preds.len() as u64];
        let mut stale=begin_kind_at(&dir,bad_parts.iter().sum(),10,Kind::Usno,Some(&bad_parts)).unwrap();
        for bytes in [monthly.as_slice(),historic.as_slice(),empty_preds.as_slice()] { for chunk in bytes.chunks(MAX_CHUNK) { let offset=stale.written; append(&mut stale,offset,chunk).unwrap(); } }
        assert_eq!(finish(stale),Err("invalid_file"));
        assert!(crate::virgostars_provider::load_usno_bundle(&dir.join(IMPORTED_USNO)).is_some());
        let chiron=fs::read(std::env::var_os("VIRGOSTARS_CHIRON_SPK").unwrap()).unwrap();
        let mut c=begin_kind_at(&dir,chiron.len() as u64,2,Kind::Chiron,None).unwrap();
        for chunk in chiron.chunks(MAX_CHUNK) { let offset=c.written; append(&mut c,offset,chunk).unwrap(); }
        finish(c).unwrap();
        assert!(crate::virgostars_provider::validate_chiron(&dir.join(IMPORTED_CHIRON)).is_some());
        let mut bad=begin_kind_at(&dir,3,3,Kind::Usno,Some(&[1,1,1])).unwrap(); append(&mut bad,0,b"bad").unwrap(); assert_eq!(finish(bad),Err("invalid_file"));
        let mut bad=begin_kind_at(&dir,3,4,Kind::Chiron,None).unwrap(); append(&mut bad,0,b"bad").unwrap(); assert_eq!(finish(bad),Err("invalid_file"));
        assert!(crate::virgostars_provider::load_usno_bundle(&dir.join(IMPORTED_USNO)).is_some());
        assert!(crate::virgostars_provider::validate_chiron(&dir.join(IMPORTED_CHIRON)).is_some());
        fs::remove_file(dir.join(IMPORTED_USNO)).unwrap(); fs::remove_file(dir.join(IMPORTED_CHIRON)).unwrap(); fs::remove_dir(dir).unwrap();
    }
    #[test]
    #[ignore = "requires externally supplied classic DE441 data"]
    fn real_file_is_installed_and_invalid_replacement_keeps_it() {
        let source = std::env::var_os("VIRGOSTARS_DE441_PATH").unwrap();
        let dir = directory(); let length = fs::metadata(&source).unwrap().len();
        let mut import = begin_at(&dir, length, 1).unwrap();
        let mut source = File::open(source).unwrap();
        let mut buf = [0u8; MAX_CHUNK];
        use std::io::Read;
        loop { let n = source.read(&mut buf).unwrap(); if n == 0 { break; } let offset=import.written; append(&mut import, offset, &buf[..n]).unwrap(); }
        finish(import).unwrap();
        assert_eq!(fs::metadata(dir.join(INSTALLED)).unwrap().len(), length);
        let mut bad=begin_at(&dir, 4, 2).unwrap(); append(&mut bad, 0, b"nope").unwrap();
        assert_eq!(finish(bad), Err("invalid_file"));
        assert!(crate::virgostars_provider::validate_de441(&dir.join(INSTALLED)).is_some());
        fs::remove_file(dir.join(INSTALLED)).unwrap(); fs::remove_dir(dir).unwrap();
    }

    #[test]
    #[ignore = "requires desktop DE441, USNO and Chiron files"]
    fn status_reports_active_legacy_files() {
        use crate::virgostars_provider::DataPaths;
        let dir=directory();
        let paths=DataPaths {de441:PathBuf::from(std::env::var_os("VIRGOSTARS_DE441_PATH").unwrap()),
            usno_bundle:None,usno_directory:Some(PathBuf::from(std::env::var_os("VIRGOSTARS_USNO_DIR").unwrap())),
            chiron_spk:Some(PathBuf::from(std::env::var_os("VIRGOSTARS_CHIRON_SPK").unwrap()))};
        let status=status_at(&dir,Some(&paths),true);
        assert!(status.available && status.installed_bytes.unwrap()>0 && status.start_julian_day_tdb.is_some());
        assert!(status.usno.unwrap().predictions && status.chiron.is_some());
    }
}
