//! `EphemerisProvider` backed by VirgoStars-Ephemeris (`virgostars-ephemeris-core`, CPAL-1.0).
//! Adapted for mobile from VirgoStars Desktop commit 023d76d; house methods are
//! performed by the shared `astrological-functions` consumer, not this module.
//!
//! The core is pinned to one reviewed commit in `Cargo.toml`. It calculates apparent geocentric
//! positions of date from a **classic JPL DE441 binary** that is *not* bundled with the source:
//! the host reads its location from the environment or from `ephemeris.json` in the application's
//! data folder, never from the WebView. Optional extras, the same way: the USNO ΔT files
//! (`deltat.data`, `historic_deltat.data`, `deltat.preds`), which extend the time policy past
//! June 2027, and a JPL small-body SPK for Chiron. Without the DE441 file there is no provider and
//! the interface says so; nothing is substituted.
//!
//! Time: a civil UT instant becomes TDB under the core's declared policy (leap seconds 1972–2027,
//! the Espenak–Meeus polynomial 1900–1972, or measured/predicted ΔT with the USNO tables). A date
//! outside that policy is `out_of_range` (see `EphemerisProvider::covers`), not a failure.
//!
//! Houses are not astronomy: this port returns angles from the core (`house_angles`) for the
//! shared house methods. The planets Mars to Pluto are the planetary **system barycenters**, as the core
//! documents; lunar nodes and apogees are the core's mathematical points; Chiron needs its SPK.
use crate::chart_calculation::{
    BodyPositionV1, ChartSnapshotV1, EphemerisProvider, HouseAngleFactsV1, Luminary, ProviderError, ProviderInfoV1,
    ValidatedRequest,
};
use serde::Deserialize;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use virgostars_ephemeris_core::apparent_ecliptic_of_date::{
    geocentric_apparent_six_fields_many_with_options, small_body_apparent_six_fields, tdb_to_tt_jd, ApparentFrame,
    ApparentOptions,
};
use virgostars_ephemeris_core::civil_apparent::{jd_ut_to_tdb_with_policy, jd_ut_to_tdb_with_table, CivilTimeSource};
use virgostars_ephemeris_core::de441::{Body, De441, JulianDateTdb};
use virgostars_ephemeris_core::delta_t_table::DeltaTTable;
use virgostars_ephemeris_core::house_angles::house_angles;
use virgostars_ephemeris_core::lunar_points::{lunar_point, LunarPoint};
use virgostars_ephemeris_core::spk_type21::SmallBodySpk;

/// The core crate version and the commit this build is pinned to (see `Cargo.toml`). The WebView contract
/// accepts only `[A-Za-z0-9._-]{1,40}` here.
const ENGINE_VERSION: &str = "core-0.1.0-6835e00";
/// NAIF id JPL uses for 2060 Chiron in its small-body SPK files.
const CHIRON_NAIF_ID: i32 = 20_002_060;
const CONFIG_FILE: &str = "ephemeris.json";
const MAX_CONFIG_BYTES: u64 = 16 * 1024;

const PLANETS: [(&str, Body); 10] = [
    ("Sun", Body::Sun),
    ("Moon", Body::Moon),
    ("Mercury", Body::Mercury),
    ("Venus", Body::Venus),
    ("Mars", Body::MarsBarycenter),
    ("Jupiter", Body::JupiterBarycenter),
    ("Saturn", Body::SaturnBarycenter),
    ("Uranus", Body::UranusBarycenter),
    ("Neptune", Body::NeptuneBarycenter),
    ("Pluto", Body::PlutoBarycenter),
];
const LUNAR_POINTS: [(&str, LunarPoint); 4] = [
    ("mean Node", LunarPoint::MeanNode),
    ("true Node", LunarPoint::TrueNode),
    ("mean Apogee", LunarPoint::MeanApogee),
    ("osc. Apogee", LunarPoint::OsculatingApogee),
];
const HOUSE_SYSTEMS: [&str; 5] = ["egizia", "placido", "koch", "regio-montano", "porfirio"];

/// Where the data files are. Absolute paths chosen by the user; they never cross IPC.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct DataPaths {
    pub(crate) de441: PathBuf,
    pub(crate) usno_bundle: Option<PathBuf>,
    pub(crate) usno_directory: Option<PathBuf>,
    pub(crate) chiron_spk: Option<PathBuf>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FileConfig {
    de441: Option<String>,
    usno_directory: Option<String>,
    chiron_spk: Option<String>,
}

fn read_config(folder: &Path) -> Option<FileConfig> {
    let mut text = String::new();
    let file = File::open(folder.join(CONFIG_FILE)).ok()?;
    if file.metadata().ok()?.len() > MAX_CONFIG_BYTES { return None; }
    file.take(MAX_CONFIG_BYTES).read_to_string(&mut text).ok()?;
    serde_json::from_str(&text).ok()
}

/// Files shipped inside the installer, under the resource folder (see `docs/EPHEMERIS_DATA_BUNDLE.md`).
const BUNDLED_FOLDER: &str = "ephemeris";
const BUNDLED_DE441: &str = "de441-slice.eph";
const IMPORTED_DE441: &str = "de441-imported.eph";
const BUNDLED_USNO: &str = "usno";
const BUNDLED_CHIRON: &str = "chiron.bsp";
pub(crate) const IMPORTED_USNO: &str = "usno-imported.bundle";
pub(crate) const IMPORTED_CHIRON: &str = "chiron-imported.bsp";
pub(crate) const USNO_PART_LIMIT: u64 = 4 * 1024 * 1024;
pub(crate) const CHIRON_LIMIT: u64 = 32 * 1024 * 1024;

/// Managed import first; otherwise environment, config, local and resource files.
/// `None` when no DE441 location is known at all.
fn data_paths(
    config_folder: Option<&Path>,
    bundled_folder: Option<&Path>,
    env: &dyn Fn(&str) -> Option<String>,
) -> Option<DataPaths> {
    let file = config_folder.and_then(read_config).unwrap_or_default();
    let shipped = |name: &str| bundled_folder.map(|folder| folder.join(BUNDLED_FOLDER).join(name)).filter(|path| path.exists());
    let local = |name: &str| config_folder.map(|folder| folder.join(BUNDLED_FOLDER).join(name)).filter(|path| path.exists());
    let de441: PathBuf = match local(IMPORTED_DE441) {
        // A deliberate in-app import must be the file actually used, even if
        // an older host-side development configuration remains present.
        Some(path) => path,
        None => match env("VIRGOSTARS_DE441_PATH").or(file.de441) {
            Some(path) => path.into(),
            None => local(BUNDLED_DE441).or_else(|| shipped(BUNDLED_DE441))?,
        },
    };
    let usno_bundle = local(IMPORTED_USNO);
    let usno = env("VIRGOSTARS_USNO_DIR").or(file.usno_directory).map(PathBuf::from).or_else(|| local(BUNDLED_USNO)).or_else(|| shipped(BUNDLED_USNO));
    let chiron = local(IMPORTED_CHIRON).or_else(|| env("VIRGOSTARS_CHIRON_SPK").or(file.chiron_spk).map(PathBuf::from)).or_else(|| local(BUNDLED_CHIRON)).or_else(|| shipped(BUNDLED_CHIRON));
    Some(DataPaths { de441, usno_bundle, usno_directory: usno, chiron_spk: chiron })
}

pub(crate) fn load_delta_t(directory: &Path) -> Option<DeltaTTable> {
    let read = |name: &str| { let f = File::open(directory.join(name)).ok()?; if f.metadata().ok()?.len() > USNO_PART_LIMIT { return None; } let mut text=String::new(); f.take(USNO_PART_LIMIT + 1).read_to_string(&mut text).ok()?; (text.len() as u64 <= USNO_PART_LIMIT).then_some(text) };
    let monthly = read("deltat.data")?;
    let historic = read("historic_deltat.data")?;
    let predictions = read("deltat.preds");
    DeltaTTable::from_usno(&monthly, &historic, predictions.as_deref()).ok()
}

fn load_chiron(path: &Path) -> Option<SmallBodySpk> {
    let file = File::open(path).ok()?;
    if file.metadata().ok()?.len() > CHIRON_LIMIT { return None; }
    let mut bytes = Vec::new(); file.take(CHIRON_LIMIT + 1).read_to_end(&mut bytes).ok()?;
    if bytes.len() as u64 > CHIRON_LIMIT { return None; }
    let spk = SmallBodySpk::from_bytes(bytes).ok()?;
    (spk.target_id() == CHIRON_NAIF_ID && spk.center_id() == 10).then_some(spk)
}

/// Private bundle: fixed magic, three little-endian lengths, then UTF-8 texts.
pub(crate) fn load_usno_bundle(path: &Path) -> Option<(DeltaTTable, bool)> {
    let file = File::open(path).ok()?;
    if file.metadata().ok()?.len() > 20 + 3 * USNO_PART_LIMIT { return None; }
    let mut data=Vec::new(); file.take(21 + 3 * USNO_PART_LIMIT).read_to_end(&mut data).ok()?;
    if data.len() < 20 || &data[..8] != b"VSUSNO01" { return None; }
    let length = |i:usize| u32::from_le_bytes(data[i..i+4].try_into().expect("fixed header")) as usize;
    let (a,b,c)=(length(8),length(12),length(16));
    if a == 0 || b == 0 || [a,b,c].iter().any(|n| *n as u64 > USNO_PART_LIMIT) || a.checked_add(b)?.checked_add(c)?.checked_add(20)? != data.len() { return None; }
    let monthly=std::str::from_utf8(&data[20..20+a]).ok()?;
    let historic=std::str::from_utf8(&data[20+a..20+a+b]).ok()?;
    let preds=if c==0 {None} else {Some(std::str::from_utf8(&data[20+a+b..]).ok()?)};
    let table=DeltaTTable::from_usno(monthly,historic,preds).ok()?;
    // If predictions were explicitly selected, do not accept an empty/header-only
    // or stale file as if it contained usable future points.
    if c > 0 && table.last_jd_ut() <= table.last_measured_jd_ut() { return None; }
    Some((table, c > 0))
}

pub(crate) fn validate_chiron(path: &Path) -> Option<(f64, f64)> {
    let spk=load_chiron(path)?;
    let (start,end)=spk.coverage_jd_tdb();
    if !start.is_finite() || !end.is_finite() || end <= start { return None; }
    spk.state_at(JulianDateTdb(start + (end-start)*0.5)).ok()?;
    Some((start,end))
}

struct Engine {
    ephemeris: De441<File>,
    delta_t: Option<DeltaTTable>,
    chiron: Option<SmallBodySpk>,
}

impl Engine {
    fn open(paths: &DataPaths) -> Option<Self> {
        Some(Self {
            ephemeris: De441::open(&paths.de441).ok()?,
            delta_t: if let Some(bundle) = paths.usno_bundle.as_deref() { Some(load_usno_bundle(bundle)?.0) } else { match paths.usno_directory.as_deref() { Some(directory) => Some(load_delta_t(directory)?), None => None } },
            chiron: paths.chiron_spk.as_deref().and_then(load_chiron),
        })
    }

    /// UT to TDB under the core's declared policy (a ΔT table, when loaded, extends it).
    fn to_tdb(&self, jd_ut: f64) -> Result<(JulianDateTdb, CivilTimeSource), ProviderError> {
        match &self.delta_t {
            Some(table) => jd_ut_to_tdb_with_table(jd_ut, table),
            None => jd_ut_to_tdb_with_policy(jd_ut),
        }
        .map_err(|_| ProviderError)
    }
}

static CONFIG_FOLDER: OnceLock<PathBuf> = OnceLock::new();
static RESOURCE_FOLDER: OnceLock<PathBuf> = OnceLock::new();
static ENGINE: Mutex<Option<Engine>> = Mutex::new(None);

/// Called once at startup with the application's data folder (`ephemeris.json` is read from it) and the
/// resource folder of the installed application (the shipped data files are looked for there).
pub fn configure(data_folder: PathBuf, resource_folder: Option<PathBuf>) {
    // An interrupted import is never a usable kernel and can be discarded on startup.
    let _ = std::fs::remove_file(data_folder.join(BUNDLED_FOLDER).join("de441-import.part"));
    let _ = std::fs::remove_file(data_folder.join(BUNDLED_FOLDER).join("usno-import.part"));
    let _ = std::fs::remove_file(data_folder.join(BUNDLED_FOLDER).join("chiron-import.part"));
    let _ = CONFIG_FOLDER.set(data_folder);
    if let Some(folder) = resource_folder {
        let _ = RESOURCE_FOLDER.set(folder);
    }
}

/// Atomically replace the app-owned kernel after validation. Hold the engine lock
/// so no calculation can retain the old open file during replacement.
pub(crate) fn install_de441(staged: &Path, destination: &Path) -> std::io::Result<()> {
    let mut guard = ENGINE.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    *guard = None;
    std::fs::rename(staged, destination)
}

pub(crate) fn validate_de441(path: &Path) -> Option<(f64, f64)> {
    let mut eph = De441::open(path).ok()?;
    let (start, end) = eph.coverage();
    let targets: Vec<Body> = PLANETS.iter().map(|(_, body)| *body).collect();
    // Probe several interior records and all required planetary series. This is
    // structural checking, not a trusted checksum or a proof of authenticity.
    for fraction in [0.1, 0.5, 0.9] {
        let tdb = JulianDateTdb(start.0 + (end.0 - start.0) * fraction);
        let rows = geocentric_apparent_six_fields_many_with_options(&mut eph, &targets, tdb, ApparentOptions::default()).ok()?;
        if rows.len() != targets.len() { return None; }
    }
    Some((start.0, end.0))
}

pub(crate) fn configured_data_paths() -> Option<DataPaths> {
    data_paths(CONFIG_FOLDER.get().map(PathBuf::as_path), RESOURCE_FOLDER.get().map(PathBuf::as_path),
        &|name| std::env::var(name).ok())
}

fn with_engine<T>(action: impl FnOnce(&mut Engine) -> T) -> Option<T> {
    let mut guard = ENGINE.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if guard.is_none() {
        // Tried again on every call until the files are there: nothing is cached about a failure.
        let paths = configured_data_paths()?;
        *guard = Engine::open(&paths);
    }
    guard.as_mut().map(action)
}

/// Whether the DE441 file could be opened: without it there is no provider.
pub fn data_available() -> bool {
    with_engine(|_| ()).is_some()
}

/// Julian day (UT) of a validated proleptic-Gregorian instant (Meeus, chapter 7).
fn julian_day_ut(request: &ValidatedRequest) -> f64 {
    let (mut year, mut month) = (i64::from(request.year), i64::from(request.month));
    if month <= 2 {
        year -= 1;
        month += 12;
    }
    let century = year.div_euclid(100);
    let correction = 2 - century + century.div_euclid(4);
    (365.25 * (year + 4716) as f64).floor() + (30.6001 * (month + 1) as f64).floor() + f64::from(request.day)
        + correction as f64
        - 1524.5
        + request.hour / 24.0
}

fn position(id: &'static str, ecliptic: [f64; 6], equatorial: [f64; 2], source: &'static str) -> BodyPositionV1 {
    BodyPositionV1 {
        id,
        longitude_deg: ecliptic[0],
        latitude_deg: ecliptic[1],
        distance_au: ecliptic[2],
        longitude_speed: ecliptic[3],
        latitude_speed: ecliptic[4],
        distance_speed: ecliptic[5],
        right_ascension_deg: equatorial[0],
        declination_deg: equatorial[1],
        ephemeris_source: source,
    }
}

/// The six fields of an apparent state (the core's field struct is not exported, so a macro).
macro_rules! six {
    ($fields:expr) => {{
        let fields = &$fields;
        [
            fields.longitude_deg,
            fields.latitude_deg,
            fields.distance_au,
            fields.longitude_speed_deg_per_tdb_day,
            fields.latitude_speed_deg_per_tdb_day,
            fields.distance_speed_au_per_tdb_day,
        ]
    }};
}

impl Engine {
    fn chart(&mut self, request: &ValidatedRequest) -> Result<ChartSnapshotV1, ProviderError> {
        let jd_ut = julian_day_ut(request);
        let (tdb, time_source) = self.to_tdb(jd_ut)?;
        let tt = tdb_to_tt_jd(tdb.0).map_err(|_| ProviderError)?;
        let ecliptic_options = ApparentOptions::default();
        let equatorial_options = ApparentOptions { frame: ApparentFrame::TrueEquatorOfDate, ..ApparentOptions::default() };
        let targets: Vec<Body> = PLANETS.iter().map(|(_, body)| *body).collect();
        let ecliptic = geocentric_apparent_six_fields_many_with_options(&mut self.ephemeris, &targets, tdb, ecliptic_options)
            .map_err(|_| ProviderError)?;
        let equatorial =
            geocentric_apparent_six_fields_many_with_options(&mut self.ephemeris, &targets, tdb, equatorial_options)
                .map_err(|_| ProviderError)?;
        let mut bodies = Vec::with_capacity(PLANETS.len() + LUNAR_POINTS.len() + 1);
        for (((id, _), ecl), equ) in PLANETS.iter().zip(&ecliptic).zip(&equatorial) {
            bodies.push(position(id, six!(ecl.fields), [equ.fields.longitude_deg, equ.fields.latitude_deg], "jpl"));
        }
        let mut unavailable_bodies = Vec::new();
        for (id, point) in LUNAR_POINTS {
            let ecl = lunar_point(Some(&mut self.ephemeris), point, ApparentFrame::TrueEclipticOfDate, tdb.0);
            let equ = lunar_point(Some(&mut self.ephemeris), point, ApparentFrame::TrueEquatorOfDate, tdb.0);
            match (ecl, equ) {
                (Ok(ecl), Ok(equ)) => bodies.push(position(
                    id,
                    [
                        ecl.longitude_deg,
                        ecl.latitude_deg,
                        ecl.distance_au,
                        ecl.longitude_rate_deg_per_day,
                        ecl.latitude_rate_deg_per_day,
                        ecl.distance_rate_au_per_day,
                    ],
                    [equ.longitude_deg, equ.latitude_deg], "virgostars_model",
                )),
                _ => unavailable_bodies.push(id),
            }
        }
        // Chiron only with its own kernel; without it, or outside its coverage, it is reported missing.
        let chiron = self.chiron.as_ref().and_then(|spk| {
            let ecl = small_body_apparent_six_fields(&mut self.ephemeris, spk, tdb, ecliptic_options).ok()?;
            let equ = small_body_apparent_six_fields(&mut self.ephemeris, spk, tdb, equatorial_options).ok()?;
            Some(position("Chiron", six!(ecl.fields), [equ.fields.longitude_deg, equ.fields.latitude_deg], "jpl_small_body"))
        });
        match chiron {
            Some(position) => bodies.push(position),
            None => unavailable_bodies.push("Chiron"),
        }
        if !bodies.iter().any(|body| body.id == "Sun") || !bodies.iter().any(|body| body.id == "Moon") {
            return Err(ProviderError);
        }
        let angles = house_angles(jd_ut, tt, request.latitude_deg, request.longitude_deg).map_err(|_| ProviderError)?;
        let time_source = match time_source {
            CivilTimeSource::IersLeapSeconds => "iers_leap_seconds",
            CivilTimeSource::DeltaTPolynomial { .. } => "delta_t_polynomial",
            CivilTimeSource::DeltaTTable { predicted: false, .. } => "delta_t_observed",
            CivilTimeSource::DeltaTTable { predicted: true, .. } => "delta_t_predicted",
        };
        let facts = HouseAngleFactsV1 {
            model: "iau2006_2000b_utc_as_ut1", time_source, tt_julian_day: tt,
            latitude_deg: request.latitude_deg, longitude_deg_east: request.longitude_deg,
            armc_deg: angles.armc_deg, true_obliquity_deg: angles.true_obliquity_deg,
            ascendant_deg: angles.ascendant_deg, mc_deg: angles.midheaven_deg, vertex_deg: angles.extra.vertex_deg,
        };
        Ok(ChartSnapshotV1 { julian_day_ut: jd_ut, bodies, houses: vec![], house_angle_facts: Some(facts), unavailable_bodies, unavailable_house_systems: HOUSE_SYSTEMS.to_vec() })
    }

    fn luminary(&mut self, body: Luminary, jd_ut: f64) -> Result<f64, ProviderError> {
        let (tdb, _) = self.to_tdb(jd_ut)?;
        let target = match body {
            Luminary::Sun => Body::Sun,
            Luminary::Moon => Body::Moon,
        };
        let rows = geocentric_apparent_six_fields_many_with_options(&mut self.ephemeris, &[target], tdb, ApparentOptions::default())
            .map_err(|_| ProviderError)?;
        let longitude = rows.first().ok_or(ProviderError)?.fields.longitude_deg;
        longitude.is_finite().then(|| longitude.rem_euclid(360.0)).ok_or(ProviderError)
    }
}

pub struct VirgoStarsEphemeris;

impl EphemerisProvider for VirgoStarsEphemeris {
    fn info(&self) -> ProviderInfoV1 {
        ProviderInfoV1 { id: "virgostars_ephemeris", engine_version: ENGINE_VERSION.to_string() }
    }

    fn covers(&self, request: &ValidatedRequest) -> bool {
        let jd_ut = julian_day_ut(request);
        // Both the civil-time policy and the actual kernel must cover the epoch.
        with_engine(|engine| engine.to_tdb(jd_ut).is_ok_and(|(tdb, _)| {
            let (start, end) = engine.ephemeris.coverage();
            tdb.0 >= start.0 && tdb.0 <= end.0
        })).unwrap_or(false)
    }

    fn chart(&self, request: &ValidatedRequest) -> Result<ChartSnapshotV1, ProviderError> {
        with_engine(|engine| engine.chart(request)).ok_or(ProviderError)?
    }

    fn luminary_longitude(&self, body: Luminary, julian_day_ut: f64) -> Result<f64, ProviderError> {
        with_engine(|engine| engine.luminary(body, julian_day_ut)).ok_or(ProviderError)?
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(year: i32, month: u32, day: u32, hour: f64) -> ValidatedRequest {
        ValidatedRequest { year, month, day, hour, latitude_deg: 41.8928, longitude_deg: 12.4837 }
    }

    #[test]
    fn test_the_engine_version_fits_the_webview_contract() {
        // chart-calculation-contract.ts rejects anything else, and the chart would never be shown.
        let info = VirgoStarsEphemeris.info();
        assert!((1..=40).contains(&info.engine_version.len()), "{}", info.engine_version);
        assert!(info.engine_version.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'_' || b == b'-'));
        assert!(info.id.len() <= 40 && info.id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_'));
    }

    #[test]
    #[ignore = "requires externally supplied DE441, USNO and Chiron data"]
    fn imported_auxiliaries_are_used_by_the_engine() {
        use std::io::Write;
        let source=PathBuf::from(std::env::var_os("VIRGOSTARS_USNO_DIR").unwrap());
        let parts:Vec<Vec<u8>>=["deltat.data","historic_deltat.data","deltat.preds"].iter().map(|n| std::fs::read(source.join(n)).unwrap()).collect();
        let n=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let bundle=std::env::temp_dir().join(format!("vs-usno-engine-{}-{n}",std::process::id()));
        let mut out=File::create(&bundle).unwrap(); out.write_all(b"VSUSNO01").unwrap();
        for part in &parts { out.write_all(&(part.len() as u32).to_le_bytes()).unwrap(); }
        for part in &parts { out.write_all(part).unwrap(); } drop(out);
        let mut paths=DataPaths { de441:PathBuf::from(std::env::var_os("VIRGOSTARS_DE441_PATH").unwrap()), usno_bundle:None, usno_directory:None, chiron_spk:None };
        let mut before=Engine::open(&paths).unwrap();
        assert!(before.to_tdb(julian_day_ut(&request(2027,7,1,0.0))).is_err());
        assert!(before.chart(&request(2000,1,1,12.0)).unwrap().unavailable_bodies.contains(&"Chiron"));
        paths.usno_bundle=Some(bundle.clone()); paths.chiron_spk=Some(PathBuf::from(std::env::var_os("VIRGOSTARS_CHIRON_SPK").unwrap()));
        let mut after=Engine::open(&paths).unwrap();
        assert!(after.to_tdb(julian_day_ut(&request(2027,7,1,0.0))).is_ok());
        let chart=after.chart(&request(2000,1,1,12.0)).unwrap();
        assert!(chart.bodies.iter().any(|body|body.id=="Chiron" && body.ephemeris_source=="jpl_small_body"));
        assert_eq!(chart.house_angle_facts.unwrap().time_source,"delta_t_observed");
        drop(after); std::fs::remove_file(bundle).unwrap();
    }

    #[test]
    fn test_julian_day_of_known_instants() {
        assert_eq!(julian_day_ut(&request(2000, 1, 1, 12.0)), 2_451_545.0);
        assert_eq!(julian_day_ut(&request(1900, 1, 1, 0.0)), 2_415_020.5);
        assert_eq!(julian_day_ut(&request(1858, 11, 17, 0.0)), 2_400_000.5);
        assert!((julian_day_ut(&request(2027, 6, 28, 0.0)) - 2_461_584.5).abs() < 1e-9);
        assert!((julian_day_ut(&request(2026, 11, 17, 18.0)) - 2_461_362.25).abs() < 1e-9);
    }

    #[test]
    fn test_data_locations_come_from_the_host_and_the_environment_wins() {
        let nothing = |_: &str| None;
        assert_eq!(data_paths(None, None, &nothing), None);
        let env = |name: &str| match name {
            "VIRGOSTARS_DE441_PATH" => Some("C:/data/de441.eph".to_string()),
            "VIRGOSTARS_CHIRON_SPK" => Some("C:/data/chiron.bsp".to_string()),
            _ => None,
        };
        let paths = data_paths(None, None, &env).unwrap();
        assert_eq!(paths.de441, PathBuf::from("C:/data/de441.eph"));
        assert_eq!(paths.chiron_spk, Some(PathBuf::from("C:/data/chiron.bsp")));
        assert_eq!(paths.usno_directory, None);
    }

    #[test]
    fn test_explicit_import_takes_priority_over_old_host_configuration() {
        let n = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let root = std::env::temp_dir().join(format!("vs-import-priority-{}-{n}", std::process::id()));
        let dir = root.join(BUNDLED_FOLDER);
        std::fs::create_dir_all(&dir).unwrap();
        let imported = dir.join(IMPORTED_DE441);
        std::fs::write(&imported, b"fixture").unwrap();
        std::fs::write(dir.join(IMPORTED_USNO),b"fixture").unwrap();
        std::fs::write(dir.join(IMPORTED_CHIRON),b"fixture").unwrap();
        let env = |name: &str| match name { "VIRGOSTARS_DE441_PATH" => Some("C:/old.eph".to_string()), "VIRGOSTARS_CHIRON_SPK" => Some("C:/old.bsp".to_string()), "VIRGOSTARS_USNO_DIR" => Some("C:/old-usno".to_string()), _ => None };
        let paths=data_paths(Some(&root), None, &env).unwrap();
        assert_eq!(paths.de441, imported);
        assert_eq!(paths.usno_bundle, Some(dir.join(IMPORTED_USNO)));
        assert_eq!(paths.chiron_spk, Some(dir.join(IMPORTED_CHIRON)));
        std::fs::remove_file(dir.join(IMPORTED_USNO)).unwrap(); std::fs::remove_file(dir.join(IMPORTED_CHIRON)).unwrap();
        std::fs::remove_file(imported).unwrap(); std::fs::remove_dir(dir).unwrap(); std::fs::remove_dir(root).unwrap();
    }

    #[test]
    fn test_the_files_shipped_with_the_installer_are_the_last_resort() {
        let unique = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let resources = std::env::temp_dir().join(format!("vs-eph-bundled-{}-{unique}", std::process::id()));
        let shipped = resources.join(BUNDLED_FOLDER);
        std::fs::create_dir_all(shipped.join(BUNDLED_USNO)).unwrap();
        std::fs::write(shipped.join(BUNDLED_DE441), b"x").unwrap();
        std::fs::write(shipped.join(BUNDLED_CHIRON), b"x").unwrap();
        let nothing = |_: &str| None;
        let paths = data_paths(None, Some(&resources), &nothing).unwrap();
        assert_eq!(paths.de441, shipped.join(BUNDLED_DE441));
        assert_eq!(paths.usno_directory, Some(shipped.join(BUNDLED_USNO)));
        assert_eq!(paths.chiron_spk, Some(shipped.join(BUNDLED_CHIRON)));
        // A file the user names wins item by item; the others stay shipped.
        let env = |name: &str| (name == "VIRGOSTARS_DE441_PATH").then(|| "D:/full/de441.eph".to_string());
        let paths = data_paths(None, Some(&resources), &env).unwrap();
        assert_eq!(paths.de441, PathBuf::from("D:/full/de441.eph"));
        assert_eq!(paths.chiron_spk, Some(shipped.join(BUNDLED_CHIRON)));
        // Nothing shipped and nothing named: no provider.
        assert_eq!(data_paths(None, Some(&resources.join("missing")), &nothing), None);
        std::fs::remove_file(shipped.join(BUNDLED_DE441)).unwrap();
        std::fs::remove_file(shipped.join(BUNDLED_CHIRON)).unwrap();
        std::fs::remove_dir(shipped.join(BUNDLED_USNO)).unwrap();
        std::fs::remove_dir(shipped).unwrap();
        std::fs::remove_dir(resources).unwrap();
    }

    #[test]
    fn test_the_config_file_is_read_with_unknown_fields_and_oversized_files_rejected() {
        let unique = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let folder = std::env::temp_dir().join(format!("vs-eph-config-{}-{unique}", std::process::id()));
        std::fs::create_dir_all(&folder).unwrap();
        let nothing = |_: &str| None;
        std::fs::write(folder.join(CONFIG_FILE), r#"{"de441":"D:/x/de441.eph","usnoDirectory":"D:/x/usno"}"#).unwrap();
        let paths = data_paths(Some(&folder), None, &nothing).unwrap();
        assert_eq!(paths.de441, PathBuf::from("D:/x/de441.eph"));
        assert_eq!(paths.usno_directory, Some(PathBuf::from("D:/x/usno")));
        // A key it does not know, or a file that is not JSON, gives no configuration at all.
        std::fs::write(folder.join(CONFIG_FILE), r#"{"de441":"D:/x/de441.eph","token":"x"}"#).unwrap();
        assert_eq!(data_paths(Some(&folder), None, &nothing), None);
        std::fs::write(folder.join(CONFIG_FILE), "not json").unwrap();
        assert_eq!(data_paths(Some(&folder), None, &nothing), None);
        std::fs::write(folder.join(CONFIG_FILE), vec![b' '; MAX_CONFIG_BYTES as usize + 1]).unwrap();
        assert!(read_config(&folder).is_none());
        std::fs::remove_file(folder.join(CONFIG_FILE)).unwrap();
        std::fs::remove_dir(folder).unwrap();
    }

    fn require_real_data() {
        assert!(std::env::var_os("VIRGOSTARS_DE441_PATH").is_some() && data_available(), "a readable externally supplied DE441 file is required");
    }

    #[test]
    #[ignore = "requires externally supplied classic DE441 data"]
    fn test_a_chart_at_j2000_is_where_the_sky_was() {
        require_real_data();
        let snapshot = VirgoStarsEphemeris.chart(&request(2000, 1, 1, 12.0)).expect("a chart at J2000");
        let longitude = |id: &str| snapshot.bodies.iter().find(|body| body.id == id).unwrap().longitude_deg;
        // Apparent geocentric longitudes of date at 2000-01-01 12:00 UT (well-known values, to 0.01 degree).
        assert!((longitude("Sun") - 280.37).abs() < 0.01, "Sun {}", longitude("Sun"));
        assert!((longitude("Moon") - 223.32).abs() < 0.02, "Moon {}", longitude("Moon"));
        assert!((longitude("Jupiter") - 25.25).abs() < 0.05, "Jupiter {}", longitude("Jupiter"));
        assert_eq!(snapshot.julian_day_ut, 2_451_545.0);
        // Ten planets and four lunar points; Chiron is reported missing without its kernel.
        assert!(snapshot.bodies.len() >= 14);
        assert!(snapshot.bodies.iter().any(|body| body.ephemeris_source == "jpl"));
        assert!(snapshot.bodies.iter().any(|body| body.ephemeris_source == "virgostars_model"));
        assert!(snapshot.bodies.iter().all(|body| (0.0..360.0).contains(&body.longitude_deg) && body.longitude_speed.is_finite()));
        assert!(snapshot.houses.is_empty());
        assert_eq!(snapshot.unavailable_house_systems.len(), 5);
        assert!(snapshot.house_angle_facts.is_some());
        let sun = snapshot.bodies.iter().find(|body| body.id == "Sun").unwrap();
        assert!(sun.longitude_speed > 0.9 && sun.longitude_speed < 1.1, "Sun speed {}", sun.longitude_speed);
    }

    #[test]
    #[ignore = "requires externally supplied classic DE441 data"]
    fn test_polar_latitudes_report_the_unavailable_systems_instead_of_substituting() {
        require_real_data();
        let polar = ValidatedRequest { latitude_deg: 75.0, ..request(2000, 1, 1, 12.0) };
        let snapshot = VirgoStarsEphemeris.chart(&polar).expect("a chart at a polar latitude");
        assert!(snapshot.unavailable_house_systems.contains(&"placido"));
        assert!(snapshot.houses.is_empty());
        assert!(snapshot.house_angle_facts.is_some());
    }

    #[test]
    #[ignore = "requires externally supplied classic DE441 data"]
    fn test_the_time_policy_limits_are_reported_not_hidden() {
        require_real_data();
        assert!(VirgoStarsEphemeris.covers(&request(1900, 1, 1, 0.0)));
        assert!(VirgoStarsEphemeris.covers(&request(2026, 11, 17, 12.0)));
        assert!(!VirgoStarsEphemeris.covers(&request(1899, 12, 31, 23.0)));
        let with_table = std::env::var("VIRGOSTARS_USNO_DIR").is_ok();
        // After June 2027 only a measured/predicted ΔT table can say what TT is.
        assert_eq!(VirgoStarsEphemeris.covers(&request(2027, 7, 1, 0.0)), with_table);
    }

    #[test]
    #[ignore = "requires externally supplied classic DE441 data"]
    fn test_return_searches_get_the_luminary_longitude() {
        require_real_data();
        let sun = VirgoStarsEphemeris.luminary_longitude(Luminary::Sun, 2_451_545.0).unwrap();
        assert!((sun - 280.37).abs() < 0.01);
        assert!(VirgoStarsEphemeris.luminary_longitude(Luminary::Moon, 2_451_545.0).unwrap() < 360.0);
    }

    #[test]
    fn test_without_the_data_files_there_is_no_provider() {
        // A path that does not exist never opens, and a failed open is not remembered.
        let missing = DataPaths { de441: PathBuf::from("Z:/does/not/exist/de441.eph"), usno_bundle: None, usno_directory: None, chiron_spk: None };
        assert!(Engine::open(&missing).is_none());
    }
}
