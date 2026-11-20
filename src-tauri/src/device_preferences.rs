//! Bounded, typed display preferences. Never accepts paths or chart data.
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs::{self, OpenOptions}, io::{Read, Write}, path::Path, sync::Mutex};

static LOCK: Mutex<()> = Mutex::new(());
const MAX_BYTES:u64 = 8192;
const ASPECTS:&[&str]=&["congiunzione","opposizione","trigono","quadrato","sestile","quinconce","semisestile","semiquadrato","quintile","biquintile","semiquintile","novile","settile","phisolare","philunare","parallelodideclinazione","antiparallelo"];
const POINTS:&[&str]=&["Sun","Moon","Mercury","Venus","Mars","Jupiter","Saturn","Uranus","Neptune","Pluto","Chiron","true Node","true Node Sud","mean Node","mean Node Sud","osc. Apogee","osc. Perigee","mean Apogee","mean Perigee","AS","MC","DS","IC"];
const HOUSES:&[&str]=&["egizia","placido","koch","regio-montano","porfirio"];

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct Ui {pub theme:String,pub locale:String,pub house_system:Option<String>}
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Aspect {pub active:bool,pub orb:Option<f64>}
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Point {pub shown:bool,pub orb:f64,pub aspects:bool}
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct Chart {pub show_aspects:bool,pub aspects:BTreeMap<String,Aspect>,pub points:BTreeMap<String,Point>}
#[derive(Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct Request {pub protocol_version:u8,pub operation:String,pub section:String,pub ui:Option<Ui>,pub chart:Option<Chart>}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Response {pub protocol_version:u8,pub status:&'static str,pub ui:Option<Ui>,pub chart:Option<Chart>}
#[derive(Deserialize,Serialize)]
#[serde(deny_unknown_fields)]
struct StoredUi {version:u8,ui:Ui}
#[derive(Deserialize,Serialize)]
#[serde(deny_unknown_fields)]
struct StoredChart {version:u8,chart:Chart}

fn valid_ui(ui:&Ui)->bool {
    matches!(ui.theme.as_str(),"dark"|"light") && matches!(ui.locale.as_str(),"it"|"en") &&
        ui.house_system.as_deref().map(|s|HOUSES.contains(&s)).unwrap_or(true)
}
fn valid_chart(chart:&Chart)->bool {
    chart.aspects.len()==ASPECTS.len() && chart.points.len()==POINTS.len() &&
    chart.aspects.iter().all(|(id,a)|ASPECTS.contains(&id.as_str()) && a.orb.map(|x|x.is_finite() && (0.1..=15.0).contains(&x)).unwrap_or(true)) &&
    chart.points.iter().all(|(id,p)|POINTS.contains(&id.as_str()) && p.orb.is_finite() && (0.0..=15.0).contains(&p.orb))
}
fn read_bytes(folder:&Path,name:&str)->Result<Option<Vec<u8>>,()> {
    let file=match fs::File::open(folder.join(name)) {Ok(f)=>f,Err(e) if e.kind()==std::io::ErrorKind::NotFound=>return Ok(None),Err(_)=>return Err(())};
    let mut data=Vec::new();file.take(MAX_BYTES+1).read_to_end(&mut data).map_err(|_|())?;
    if data.len() as u64>MAX_BYTES {return Err(());} Ok(Some(data))
}
fn read_ui(folder:&Path)->Result<Option<Ui>,()> {
    let Some(data)=read_bytes(folder,"ui-preferences-v1.json")? else {return Ok(None)};
    let stored:StoredUi=serde_json::from_slice(&data).map_err(|_|())?;
    if stored.version==1 && valid_ui(&stored.ui) {Ok(Some(stored.ui))} else {Err(())}
}
fn read_chart(folder:&Path)->Result<Option<Chart>,()> {
    let Some(data)=read_bytes(folder,"chart-settings-v1.json")? else {return Ok(None)};
    let stored:StoredChart=serde_json::from_slice(&data).map_err(|_|())?;
    if stored.version==1 && valid_chart(&stored.chart) {Ok(Some(stored.chart))} else {Err(())}
}
fn write_bytes(folder:&Path,name:&str,data:&[u8])->Result<(),()> {
    if data.len() as u64>MAX_BYTES {return Err(());}
    fs::create_dir_all(folder).map_err(|_|())?;
    let tmp=folder.join(format!("{name}.tmp"));
    match fs::remove_file(&tmp) {Ok(())=>(),Err(e) if e.kind()==std::io::ErrorKind::NotFound=>(),Err(_)=>return Err(())};
    let result=(||->std::io::Result<()> {let mut file=OpenOptions::new().write(true).create_new(true).open(&tmp)?;file.write_all(data)?;file.sync_all()?;fs::rename(&tmp,folder.join(name))?;Ok(())})();
    if result.is_err() {let _=fs::remove_file(tmp);} result.map_err(|_|())
}
pub fn unavailable()->Response {Response{protocol_version:1,status:"unavailable",ui:None,chart:None}}
pub fn handle(folder:&Path,request:Request)->Response {
    if request.protocol_version!=1 {return unavailable();}
    let Ok(_guard)=LOCK.lock() else {return unavailable();};
    let result=match (request.operation.as_str(),request.section.as_str(),request.ui,request.chart) {
        ("get","ui",None,None)=>read_ui(folder).map(|ui|(ui,None)),
        ("get","chart",None,None)=>read_chart(folder).map(|chart|(None,chart)),
        ("set","ui",Some(ui),None) if valid_ui(&ui)=>read_ui(folder).and_then(|_|serde_json::to_vec(&StoredUi{version:1,ui:ui.clone()}).map_err(|_|())).and_then(|data|write_bytes(folder,"ui-preferences-v1.json",&data)).map(|_|(Some(ui),None)),
        ("set","chart",None,Some(chart)) if valid_chart(&chart)=>read_chart(folder).and_then(|_|serde_json::to_vec(&StoredChart{version:1,chart:chart.clone()}).map_err(|_|())).and_then(|data|write_bytes(folder,"chart-settings-v1.json",&data)).map(|_|(None,Some(chart))),
        _=>Err(())
    };
    match result {Ok((ui,chart))=>Response{protocol_version:1,status:"ok",ui,chart},Err(_)=>unavailable()}
}

#[cfg(test)]
mod tests {
    use super::*;
    fn folder()->std::path::PathBuf {std::env::temp_dir().join(format!("vs-device-preferences-{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()))}
    fn sample_chart()->Chart {Chart{show_aspects:false,aspects:ASPECTS.iter().map(|id|(id.to_string(),Aspect{active:true,orb:Some(2.5)})).collect(),points:POINTS.iter().map(|id|(id.to_string(),Point{shown:true,orb:6.0,aspects:false})).collect()}}
    #[test]
    fn shared_frontend_fixture_matches_native_contract() {
        let fixture:serde_json::Value=serde_json::from_str(include_str!("../../contracts/device-preferences-v1-fixture.json")).unwrap();
        let ui:StoredUi=serde_json::from_value(fixture["ui"].clone()).unwrap();
        let chart:StoredChart=serde_json::from_value(fixture["chart"].clone()).unwrap();
        assert_eq!(ui.version,1);assert!(valid_ui(&ui.ui));assert_eq!(ui.ui.house_system.as_deref(),Some("koch"));
        assert_eq!(chart.version,1);assert!(valid_chart(&chart.chart));
        assert_eq!(chart.chart.aspects["quinconce"].orb,Some(1.5));assert_eq!(chart.chart.points["Uranus"].orb,4.5);
    }
    #[test]
    fn sections_roundtrip_and_reject_unreviewed_fields() {
        let dir=folder();let ui=Ui{theme:"light".into(),locale:"en".into(),house_system:Some("koch".into())};let chart=sample_chart();
        assert!(read_ui(&dir).unwrap().is_none());assert!(read_chart(&dir).unwrap().is_none());
        assert_eq!(handle(&dir,Request{protocol_version:1,operation:"set".into(),section:"ui".into(),ui:Some(ui.clone()),chart:None}).status,"ok");
        assert_eq!(handle(&dir,Request{protocol_version:1,operation:"set".into(),section:"chart".into(),ui:None,chart:Some(chart.clone())}).status,"ok");
        assert_eq!(read_ui(&dir).unwrap(),Some(ui));assert_eq!(read_chart(&dir).unwrap(),Some(chart.clone()));
        let mut invalid=chart;invalid.points.get_mut("Sun").unwrap().orb=16.0;
        assert_eq!(handle(&dir,Request{protocol_version:1,operation:"set".into(),section:"chart".into(),ui:None,chart:Some(invalid)}).status,"unavailable");
        assert_eq!(read_chart(&dir).unwrap(),Some(sample_chart()));
        assert!(serde_json::from_str::<Request>(r#"{"protocolVersion":1,"operation":"get","section":"ui","path":"x"}"#).is_err());
        fs::remove_file(dir.join("ui-preferences-v1.json")).unwrap();fs::remove_file(dir.join("chart-settings-v1.json")).unwrap();fs::remove_dir(dir).unwrap();
    }
    #[test]
    fn future_or_corrupt_files_are_not_overwritten() {
        let dir=folder();fs::create_dir_all(&dir).unwrap();let file=dir.join("ui-preferences-v1.json");let contents=br#"{"version":2,"ui":{"theme":"dark","locale":"it","houseSystem":null}}"#;fs::write(&file,contents).unwrap();
        let result=handle(&dir,Request{protocol_version:1,operation:"set".into(),section:"ui".into(),ui:Some(Ui{theme:"light".into(),locale:"en".into(),house_system:None}),chart:None});
        assert_eq!(result.status,"unavailable");assert_eq!(fs::read(&file).unwrap(),contents);fs::remove_file(file).unwrap();fs::remove_dir(dir).unwrap();
    }
}
