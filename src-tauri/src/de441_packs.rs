//! Local DE441 file custody, not an ephemeris implementation.
//!
//! The canonical reader / astronomical calculations live in VirgoStars-Ephemeris.
//! Only ten catalogued files may be installed in this application's private data
//! directory. There are intentionally no download URLs, arbitrary file paths,
//! or permissions to read another application's files.
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager, State};

const MAX_CHUNK_BYTES: usize = 128 * 1024;
const CATALOG: &str = include_str!("../../src/assets/de441-pack-catalog.json");

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PackDefinition {
    id: String,
    first_year: i32,
    last_year: i32,
    required: bool,
    filename: String,
    bytes: u64,
    sha256: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PackCatalog {
    schema: String,
    distribution_rights: String,
    scientific_validation: String,
    description: String,
    packs: Vec<PackDefinition>,
}

fn read_catalog() -> PackCatalog {
    let catalog: PackCatalog = serde_json::from_str(CATALOG).expect("checked-in DE441 catalog JSON");
    assert_eq!(catalog.schema, "virgostars.de441.pack-catalog.v1");
    assert_eq!(catalog.distribution_rights, "review_pending");
    assert_eq!(catalog.scientific_validation, "independent_reference_pending");
    assert!(!catalog.description.is_empty());
    catalog
}

fn definition(id: &str) -> Result<PackDefinition, &'static str> {
    read_catalog().packs.into_iter().find(|item| item.id == id).ok_or("unknown_pack")
}

fn pack_dir(app: &AppHandle) -> Result<PathBuf, &'static str> {
    app.path().app_data_dir().map(|path| path.join("de441-packs")).map_err(|_| "storage_unavailable")
}

fn file_path(app: &AppHandle, pack: &PackDefinition) -> Result<PathBuf, &'static str> {
    // Filenames are compiled into the audited catalog, not accepted from IPC.
    Ok(pack_dir(app)?.join(&pack.filename))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackInventory {
    id: String,
    first_year: i32,
    last_year: i32,
    required: bool,
    filename: String,
    bytes: u64,
    status: &'static str, // missing | installed_unverified | invalid_size
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Verification {
    id: String,
    status: &'static str, // verified | invalid_hash | invalid_size | missing
}

struct Upload {
    id: String,
    expected: PackDefinition,
    staging: PathBuf,
    file: File,
    received: u64,
}

enum UploadSlot {
    Idle,
    Active(Upload),
    Finalizing,
}

pub struct UploadState(Mutex<UploadSlot>);

impl Default for UploadState {
    fn default() -> Self { Self(Mutex::new(UploadSlot::Idle)) }
}

#[tauri::command]
pub fn ephemeris_pack_inventory(app: AppHandle) -> Result<Vec<PackInventory>, &'static str> {
    let directory = pack_dir(&app)?;
    Ok(read_catalog().packs.into_iter().map(|pack| {
        let status = match fs::metadata(directory.join(&pack.filename)) {
            Ok(meta) if meta.is_file() && meta.len() == pack.bytes => "installed_unverified",
            Ok(_) => "invalid_size",
            Err(_) => "missing",
        };
        PackInventory {
            id: pack.id,
            first_year: pack.first_year,
            last_year: pack.last_year,
            required: pack.required,
            filename: pack.filename,
            bytes: pack.bytes,
            status,
        }
    }).collect())
}

fn sha256_file(path: &Path) -> Result<String, &'static str> {
    let mut file = File::open(path).map_err(|_| "read_failed")?;
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let size = file.read(&mut buffer).map_err(|_| "read_failed")?;
        if size == 0 { break; }
        hash.update(&buffer[..size]);
    }
    Ok(format!("{:x}", hash.finalize()))
}

#[tauri::command]
pub async fn ephemeris_pack_verify(app: AppHandle, id: String) -> Result<Verification, &'static str> {
    let pack = definition(&id)?;
    let path = file_path(&app, &pack)?;
    tauri::async_runtime::spawn_blocking(move || {
        let status = match fs::metadata(&path) {
            Err(_) => "missing",
            Ok(meta) if !meta.is_file() || meta.len() != pack.bytes => "invalid_size",
            Ok(_) => if sha256_file(&path)? == pack.sha256 { "verified" } else { "invalid_hash" },
        };
        Ok(Verification { id: pack.id, status })
    }).await.map_err(|_| "verification_failed")?
}

#[tauri::command]
pub fn ephemeris_pack_begin(
    app: AppHandle,
    uploads: State<'_, UploadState>,
    id: String,
) -> Result<(), &'static str> {
    let pack = definition(&id)?;
    let path = file_path(&app, &pack)?;
    let mut upload = uploads.0.lock().map_err(|_| "upload_unavailable")?;
    if !matches!(*upload, UploadSlot::Idle) { return Err("upload_in_progress"); }
    if path.exists() { return Err("already_installed_remove_first"); }
    let directory = pack_dir(&app)?;
    fs::create_dir_all(&directory).map_err(|_| "storage_unavailable")?;
    let staging = directory.join(format!("{}.part", pack.filename));
    // Recover only an abandoned staging file with a fixed catalog-derived name.
    if staging.exists() { fs::remove_file(&staging).map_err(|_| "staging_cleanup_failed")?; }
    let file = OpenOptions::new().write(true).create_new(true).open(&staging)
        .map_err(|_| "storage_unavailable")?;
    *upload = UploadSlot::Active(Upload { id, expected: pack, staging, file, received: 0 });
    Ok(())
}

#[tauri::command]
pub fn ephemeris_pack_write(
    uploads: State<'_, UploadState>,
    id: String,
    offset: u64,
    chunk_base64: String,
) -> Result<u64, &'static str> {
    if chunk_base64.len() > 4 * ((MAX_CHUNK_BYTES + 2) / 3) {
        return Err("chunk_too_large");
    }
    let bytes = STANDARD.decode(chunk_base64).map_err(|_| "invalid_chunk")?;
    if bytes.is_empty() || bytes.len() > MAX_CHUNK_BYTES { return Err("invalid_chunk"); }
    let mut guard = uploads.0.lock().map_err(|_| "upload_unavailable")?;
    let upload = match &mut *guard {
        UploadSlot::Active(upload) => upload,
        _ => return Err("no_upload"),
    };
    if upload.id != id || offset != upload.received { return Err("unexpected_upload_offset"); }
    if upload.received.checked_add(bytes.len() as u64).filter(|size| *size <= upload.expected.bytes).is_none() {
        return Err("upload_too_large");
    }
    upload.file.write_all(&bytes).map_err(|_| "storage_write_failed")?;
    upload.received += bytes.len() as u64;
    Ok(upload.received)
}

#[tauri::command]
pub async fn ephemeris_pack_finish(
    app: AppHandle,
    uploads: State<'_, UploadState>,
    id: String,
) -> Result<Verification, &'static str> {
    let upload = {
        let mut guard = uploads.0.lock().map_err(|_| "upload_unavailable")?;
        if !matches!(&*guard, UploadSlot::Active(upload) if upload.id == id) { return Err("no_upload"); }
        match std::mem::replace(&mut *guard, UploadSlot::Finalizing) {
            UploadSlot::Active(upload) => upload,
            _ => unreachable!("checked active upload"),
        }
    };
    // The finalizing sentinel stays held until the hash / rename completes.
    // A second begin must never delete the staging file during verification.
    let target = file_path(&app, &upload.expected);
    let result = tauri::async_runtime::spawn_blocking(move || {
        let Upload { expected, staging, mut file, received, .. } = upload;
        let io_result = file.flush().and_then(|_| file.sync_all());
        drop(file); // Close before any cleanup (required especially on Windows).
        let result = (|| {
            let target = target?;
            if received != expected.bytes { return Err("incomplete_upload"); }
            io_result.map_err(|_| "storage_write_failed")?;
            if sha256_file(&staging)? != expected.sha256 { return Err("checksum_mismatch"); }
            if target.exists() { return Err("already_installed_remove_first"); }
            fs::rename(&staging, &target).map_err(|_| "install_failed")?;
            Ok(Verification { id: expected.id, status: "verified" })
        })();
        if result.is_err() { let _ = fs::remove_file(&staging); }
        result
    }).await.map_err(|_| "install_failed");
    *uploads.0.lock().map_err(|_| "upload_unavailable")? = UploadSlot::Idle;
    result?
}

#[tauri::command]
pub fn ephemeris_pack_cancel(uploads: State<'_, UploadState>, id: String) -> Result<(), &'static str> {
    let mut guard = uploads.0.lock().map_err(|_| "upload_unavailable")?;
    match &*guard {
        UploadSlot::Idle => return Ok(()),
        UploadSlot::Finalizing => return Err("upload_in_progress"),
        UploadSlot::Active(upload) if upload.id != id => return Err("upload_in_progress"),
        UploadSlot::Active(_) => {},
    }
    let upload = match std::mem::replace(&mut *guard, UploadSlot::Idle) {
        UploadSlot::Active(upload) => upload,
        _ => unreachable!("checked active upload"),
    };
    drop(upload.file);
    fs::remove_file(upload.staging).map_err(|_| "staging_cleanup_failed")
}

#[tauri::command]
pub fn ephemeris_pack_remove(
    app: AppHandle,
    uploads: State<'_, UploadState>,
    id: String,
) -> Result<(), &'static str> {
    let pack = definition(&id)?;
    let guard = uploads.0.lock().map_err(|_| "upload_unavailable")?;
    if !matches!(*guard, UploadSlot::Idle) { return Err("upload_in_progress"); }
    let path = file_path(&app, &pack)?;
    if path.exists() { fs::remove_file(path).map_err(|_| "remove_failed")?; }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn catalog_is_scoped_to_ten_fixed_classic_slices() {
        let catalog = read_catalog();
        assert_eq!(catalog.packs.len(), 10);
        assert_eq!(catalog.packs.iter().filter(|pack| pack.required).count(), 1);
        let mut names = std::collections::HashSet::new();
        for pack in catalog.packs {
            assert!(names.insert(pack.filename.clone()));
            assert!(pack.filename.starts_with("de441-") && pack.filename.ends_with(".eph"));
            assert!(!pack.filename.contains('/') && !pack.filename.contains('\\'));
            assert!(pack.bytes > 10_000_000);
            assert_eq!(pack.sha256.len(), 64);
            assert!(pack.sha256.bytes().all(|byte| byte.is_ascii_hexdigit()));
        }
    }
    #[test]
    fn hash_is_streamed_over_full_file() {
        let path = std::env::temp_dir().join(format!("virgostars-de441-test-{}", std::process::id()));
        fs::write(&path, b"abc").unwrap();
        assert_eq!(sha256_file(&path).unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        fs::remove_file(path).unwrap();
    }
}
