//! Only a mode and optional pseudonymous chart UUID; never chart inputs or paths.
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::Mutex;

static LOCK:Mutex<()> = Mutex::new(());
const FILE:&str = "startup-v1.json";
const STAGING:&str = "startup-v1.json.tmp";

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct Preference {pub mode:String, pub chart_id:Option<String>}

#[derive(Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct Request {pub protocol_version:u8, pub operation:String, pub preference:Option<Preference>}

#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Response {pub protocol_version:u8, pub status:&'static str, pub preference:Option<Preference>}

fn valid_id(id:&str)->bool {
    id.len()==36 && id.bytes().enumerate().all(|(i,b)| if matches!(i,8|13|18|23) {b==b'-'} else {b.is_ascii_digit() || (b'a'..=b'f').contains(&b)})
}
fn valid(value:&Preference)->bool {
    (value.mode=="sky" || value.mode=="natal-transits") &&
    value.chart_id.as_deref().map(valid_id).unwrap_or(value.mode=="sky")
}
fn read(folder:&Path)->Result<Preference,()> {
    let file=match fs::File::open(folder.join(FILE)) {
        Ok(file)=>file, Err(e) if e.kind()==std::io::ErrorKind::NotFound=>return Ok(Preference{mode:"sky".into(),chart_id:None}), Err(_)=>return Err(())
    };
    let mut bytes=Vec::new();file.take(257).read_to_end(&mut bytes).map_err(|_|())?;
    if bytes.len()>256 {return Err(());}
    let pref:Preference=serde_json::from_slice(&bytes).map_err(|_|())?;
    if valid(&pref) {Ok(pref)} else {Err(())}
}
fn write(folder:&Path,pref:&Preference)->Result<(),()> {
    // Do not silently replace a damaged/newer preference.
    let _=read(folder)?;
    let data=serde_json::to_vec(pref).map_err(|_|())?;
    fs::create_dir_all(folder).map_err(|_|())?;
    let staging=folder.join(STAGING);
    match fs::remove_file(&staging) {Ok(())=>(),Err(e) if e.kind()==std::io::ErrorKind::NotFound=>(),Err(_)=>return Err(())};
    let result=(||->std::io::Result<()> {let mut file=OpenOptions::new().write(true).create_new(true).open(&staging)?;file.write_all(&data)?;file.sync_all()?;fs::rename(&staging,folder.join(FILE))?;Ok(())})();
    if result.is_err() {let _=fs::remove_file(staging);}
    result.map_err(|_|())
}
pub fn handle(folder:&Path,request:Request)->Response {
    let fail=||Response{protocol_version:1,status:"unavailable",preference:None};
    if request.protocol_version!=1 {return fail();}
    let Ok(_guard)=LOCK.lock() else {return fail();};
    let result=match (request.operation.as_str(),request.preference) {
        ("get",None)=>read(folder),
        ("set",Some(pref)) if valid(&pref)=>write(folder,&pref).map(|_|pref),
        _=>Err(())
    };
    match result {Ok(pref)=>Response{protocol_version:1,status:"ok",preference:Some(pref)},Err(_)=>fail()}
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn roundtrip_and_invalid_input_preserve_previous_preference() {
        let folder=std::env::temp_dir().join(format!("vs-startup-{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let pref=Preference{mode:"natal-transits".into(),chart_id:Some("11111111-1111-4111-8111-111111111111".into())};
        assert_eq!(read(&folder).unwrap().mode,"sky");
        write(&folder,&pref).unwrap();assert_eq!(read(&folder).unwrap(),pref);
        let response=handle(&folder,Request{protocol_version:1,operation:"set".into(),preference:Some(Preference{mode:"natal-transits".into(),chart_id:Some("invalid".into())})});
        assert_eq!(response.status,"unavailable");assert_eq!(read(&folder).unwrap(),pref);
        fs::remove_file(folder.join(FILE)).unwrap();fs::remove_dir(folder).unwrap();
    }
    #[test]
    fn corrupt_or_future_files_are_not_overwritten_and_requests_are_strict() {
        let folder=std::env::temp_dir().join(format!("vs-startup-bad-{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir_all(&folder).unwrap();
        let original=br#"{"mode":"sky","chartId":null,"version":2}"#;
        fs::write(folder.join(FILE),original).unwrap();
        let response=handle(&folder,Request{protocol_version:1,operation:"set".into(),preference:Some(Preference{mode:"sky".into(),chart_id:None})});
        assert_eq!(response.status,"unavailable");assert_eq!(fs::read(folder.join(FILE)).unwrap(),original);
        assert!(serde_json::from_str::<Request>(r#"{"protocolVersion":1,"operation":"get","path":"other"}"#).is_err());
        fs::remove_file(folder.join(FILE)).unwrap();fs::remove_dir(folder).unwrap();
    }
}
