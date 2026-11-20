//! Read-only search of the VirgoStars Desktop city catalog (CPAL-1.0).
use rusqlite::{params, Connection, OpenFlags};
use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Place {
    id: i64, name: String, italian_name: Option<String>, lat_micro: i64,
    lng_micro: i64, population: Option<i64>, state_id: Option<i64>,
    region: Option<String>, time_zone: Option<String>, country_name: Option<String>, country_code: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult { protocol_version: u8, items: Vec<Place> }

fn parse_query(query: &str) -> Option<(String, String, String, String)> {
    if query.chars().count() > 80 { return None; }
    let parts: Vec<_> = query.split(',').map(str::trim).collect();
    if parts.is_empty() || parts.len() > 3 || parts.iter().any(|v| v.is_empty()) { return None; }
    let words: Vec<_> = parts[0].split(|c: char| !c.is_alphanumeric() && c != '_').filter(|v| !v.is_empty()).collect();
    if words.is_empty() || words.len() > 5 || parts[0].chars().filter(|c| c.is_alphanumeric()).count() < 2 { return None; }
    let fts = words.iter().map(|word| format!("\"{}\"*", word)).collect::<Vec<_>>().join(" ");
    Some((fts, parts[0].to_string(), parts.get(1).unwrap_or(&"").to_string(), parts.get(2).unwrap_or(&"").to_string()))
}

fn search_database(path: &Path, query: &str, limit: u8) -> Result<SearchResult, &'static str> {
    let (fts, city, qualifier, country) = parse_query(query).ok_or("PLACE_QUERY_INVALID")?;
    if !(1..=30).contains(&limit) { return Err("PLACE_LIMIT_INVALID"); }
    let db = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)
        .map_err(|_| "PLACE_CATALOG_UNAVAILABLE")?;
    db.pragma_update(None, "query_only", true).map_err(|_| "PLACE_CATALOG_INVALID")?;
    let version: String = db.query_row("SELECT value FROM catalog_meta WHERE key='schemaVersion'", [], |r| r.get(0)).map_err(|_| "PLACE_CATALOG_INVALID")?;
    if version != "2" { return Err("PLACE_CATALOG_VERSION"); }
    let mut stmt = db.prepare("SELECT p.id,p.nome,p.nome_it,p.lat_micro,p.lng_micro,p.pop,p.stato_id,p.regione,p.tz,co.country_name,co.iso2
        FROM places_fts JOIN places p ON p.id=places_fts.rowid LEFT JOIN country_lookup co ON co.stato_id=p.stato_id
        WHERE places_fts MATCH ?1
          AND (?3='' OR (?4='' AND (p.regione=?3 COLLATE NOCASE OR co.iso2=?3 COLLATE NOCASE OR co.country_name=?3 COLLATE NOCASE OR co.country_name_it=?3 COLLATE NOCASE)) OR (?4<>'' AND p.regione=?3 COLLATE NOCASE))
          AND (?4='' OR co.iso2=?4 COLLATE NOCASE OR co.country_name=?4 COLLATE NOCASE OR co.country_name_it=?4 COLLATE NOCASE)
        ORDER BY CASE WHEN p.nome=?2 COLLATE NOCASE OR p.nome_it=?2 COLLATE NOCASE THEN 0 ELSE 1 END, COALESCE(p.pop,0) DESC,p.nome COLLATE NOCASE,p.id LIMIT ?5")
        .map_err(|_| "PLACE_CATALOG_INVALID")?;
    let items = stmt.query_map(params![fts,city,qualifier,country,limit], |r| Ok(Place {
        id:r.get(0)?, name:r.get(1)?, italian_name:r.get(2)?, lat_micro:r.get(3)?, lng_micro:r.get(4)?,
        population:r.get(5)?, state_id:r.get(6)?, region:r.get(7)?, time_zone:r.get(8)?, country_name:r.get(9)?, country_code:r.get(10)?,
    })).map_err(|_| "PLACE_QUERY_FAILED")?.collect::<rusqlite::Result<Vec<_>>>().map_err(|_| "PLACE_QUERY_FAILED")?;
    Ok(SearchResult { protocol_version:1, items })
}

#[cfg(target_os = "android")]
pub(crate) mod android {
    use super::*;
    use jni::objects::{JObject, JValue};
    use sha2::{Digest, Sha256};
    use std::{fs::{self, File, OpenOptions}, io::{Read, Write}, path::PathBuf, sync::{Mutex, atomic::{AtomicUsize, Ordering}}};
    use tauri::Manager;
    const BYTES: u64 = 196_808_704;
    const HASH: &str = "605f0d0e3646812b3aaa4acd8b895dd462b10b58d986df1c2e4ca1a486c7457a";
    static READY: Mutex<Option<PathBuf>> = Mutex::new(None);
    static ACTIVE: AtomicUsize = AtomicUsize::new(0);
    struct Permit;
    impl Drop for Permit { fn drop(&mut self) { ACTIVE.fetch_sub(1, Ordering::Release); } }
    fn reserve() -> Result<Permit, String> {
        let mut n=ACTIVE.load(Ordering::Acquire);
        while n<2 { match ACTIVE.compare_exchange_weak(n,n+1,Ordering::AcqRel,Ordering::Acquire) {
            Ok(_)=>return Ok(Permit), Err(observed)=>n=observed,
        }}
        Err("PLACE_SEARCH_BUSY".into())
    }
    fn valid(path: &Path) -> bool {
        let Ok(mut file)=File::open(path) else {return false};
        if file.metadata().map(|m|m.len()).ok()!=Some(BYTES) {return false;}
        let mut hash=Sha256::new(); let mut buf=[0u8;65536];
        loop { match file.read(&mut buf) { Ok(0)=>break, Ok(n)=>hash.update(&buf[..n]), Err(_)=>return false } }
        format!("{:x}",hash.finalize())==HASH
    }
    fn install(folder: PathBuf) -> Result<PathBuf, String> {
        let mut ready=READY.lock().map_err(|_| "PLACE_CATALOG_UNAVAILABLE")?;
        let dir=folder.join("places"); let target=dir.join("world-cities.sqlite");
        if ready.as_ref()==Some(&target) && target.is_file() {return Ok(target);}
        fs::create_dir_all(&dir).map_err(|_| "PLACE_CATALOG_UNAVAILABLE")?;
        if !valid(&target) {
            let staging=dir.join("world-cities.sqlite.part");
            if staging.exists() {fs::remove_file(&staging).map_err(|_| "PLACE_CATALOG_UNAVAILABLE")?;}
            let mut file=OpenOptions::new().write(true).create_new(true).open(&staging).map_err(|_| "PLACE_CATALOG_UNAVAILABLE")?;
            let result=crate::android_archive::with_jni(|env| {
                let activity=unsafe {JObject::from_raw(ndk_context::android_context().context().cast())};
                let assets=env.call_method(&activity,"getAssets","()Landroid/content/res/AssetManager;",&[])?.l()?;
                let name=env.new_string("places/world-cities.sqlite")?;
                let stream=env.call_method(&assets,"open","(Ljava/lang/String;)Ljava/io/InputStream;",&[JValue::Object(name.as_ref())])?.l()?;
                let buffer=env.new_byte_array(65536)?; let mut bytes=vec![0i8;65536];
                let copied=(|| -> jni::errors::Result<()> {
                    loop {
                        let n=env.call_method(&stream,"read","([B)I",&[JValue::Object(buffer.as_ref())])?.i()?;
                        if n < 0 {break;} if n==0 {return Err(jni::errors::Error::NullPtr("empty asset read"));}
                        env.get_byte_array_region(&buffer,0,&mut bytes[..n as usize])?;
                        let unsigned: Vec<u8>=bytes[..n as usize].iter().map(|v|*v as u8).collect();
                        file.write_all(&unsigned).map_err(|_| jni::errors::Error::NullPtr("asset write"))?;
                    }
                    Ok(())
                })();
                let close=env.call_method(&stream,"close","()V",&[]);
                copied?; close?; Ok(())
            });
            let success=result.is_ok() && file.sync_all().is_ok() && valid(&staging);
            drop(file);
            if !success {let _=fs::remove_file(&staging); return Err("PLACE_CATALOG_UNAVAILABLE".into());}
            fs::rename(&staging,&target).map_err(|_| "PLACE_CATALOG_UNAVAILABLE")?;
        }
        *ready=Some(target.clone()); Ok(target)
    }
    #[tauri::command]
    pub async fn search_offline_places(app: tauri::AppHandle, query: String, limit: Option<u8>) -> Result<SearchResult,String> {
        let count=limit.unwrap_or(12);
        if parse_query(&query).is_none() {return Err("PLACE_QUERY_INVALID".into());}
        if !(1..=30).contains(&count) {return Err("PLACE_LIMIT_INVALID".into());}
        let permit=reserve()?;
        let folder=app.path().app_local_data_dir().map_err(|_| "PLACE_CATALOG_UNAVAILABLE")?;
        tauri::async_runtime::spawn_blocking(move || {let _permit=permit; let path=install(folder)?; search_database(&path,&query,count).map_err(str::to_string)})
            .await.map_err(|_| "PLACE_QUERY_FAILED".to_string())?
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn query_is_bounded_and_quoted() {
        assert_eq!(parse_query("San José, IT").unwrap().0,"\"San\"* \"José\"*");
        assert!(parse_query("x").is_none()); assert!(parse_query(&"a".repeat(81)).is_none());
        assert!(parse_query("Rome,,IT").is_none());
    }
    #[test] fn real_catalog_when_requested() {
        if let Ok(path)=std::env::var("VIRGOSTARS_TEST_CITY_CATALOG") {
            let found=search_database(Path::new(&path),"Roma, IT",12).unwrap();
            assert!(found.items.iter().any(|p| p.country_code.as_deref()==Some("IT")));
            assert!(search_database(Path::new(&path),"Landriano, IT",12).unwrap().items.iter().any(|p|p.name=="Landriano"));
            assert!(search_database(Path::new(&path),"Portomaggiore",12).unwrap().items.iter().any(|p|p.name=="Portomaggiore"));
        }
    }
}
