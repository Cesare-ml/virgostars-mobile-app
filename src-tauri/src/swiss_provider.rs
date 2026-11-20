//! Temporary `EphemerisProvider` backed by the Swiss Ephemeris C library.
//!
//! Compiled only with the `swiss-ephemeris` Cargo feature. It stands in until
//! VirgoStars-Ephemeris is validated and is the only module allowed to call it.
//! Swiss Ephemeris is AGPL-3.0 or commercially licensed: read
//! `docs/SWISS_EPHEMERIS_PROVIDER.md` before distributing a binary built with it.
//!
//! Data source: the built-in Moshier ephemeris needs no files. If the local
//! environment variable `VIRGOSTARS_EPHE_PATH` names a directory, Swiss `.se1`
//! files there are used instead. The path never crosses IPC and is never logged.
use crate::chart_calculation::{
    BodyPositionV1, ChartSnapshotV1, EphemerisProvider, HouseSystemV1, Luminary, ProviderError, ProviderInfoV1,
    ValidatedRequest,
};
use std::ffi::{c_char, c_int, CStr, CString};
use std::sync::{Mutex, OnceLock};
use sweph_sys as swe;

const EPHE_PATH_VARIABLE: &str = "VIRGOSTARS_EPHE_PATH";
const MESSAGE_BYTES: usize = 256;

/// Names follow the keys already used by the Charts renderer settings.
const BODIES: [(&str, c_int); 15] = [
    ("Sun", swe::SE_SUN),
    ("Moon", swe::SE_MOON),
    ("Mercury", swe::SE_MERCURY),
    ("Venus", swe::SE_VENUS),
    ("Mars", swe::SE_MARS),
    ("Jupiter", swe::SE_JUPITER),
    ("Saturn", swe::SE_SATURN),
    ("Uranus", swe::SE_URANUS),
    ("Neptune", swe::SE_NEPTUNE),
    ("Pluto", swe::SE_PLUTO),
    ("mean Node", swe::SE_MEAN_NODE),
    ("true Node", swe::SE_TRUE_NODE),
    ("mean Apogee", swe::SE_MEAN_APOG),
    ("osc. Apogee", swe::SE_OSCU_APOG),
    ("Chiron", swe::SE_CHIRON),
];

/// `egizia` is the equal system with the Ascendant in the middle of house 1.
const HOUSE_SYSTEMS: [(&str, u8); 5] = [
    ("egizia", b'V'),
    ("placido", b'P'),
    ("koch", b'K'),
    ("regio-montano", b'R'),
    ("porfirio", b'O'),
];

/// The C library keeps global state, so every call goes through this lock.
static ENGINE: Mutex<()> = Mutex::new(());
/// Base ephemeris flag chosen once: Swiss files if a directory was configured.
static EPHEMERIS_FLAG: OnceLock<c_int> = OnceLock::new();

pub struct SwissEphemeris;

fn configured_directory() -> Option<CString> {
    let raw = std::env::var_os(EPHE_PATH_VARIABLE)?;
    let path = std::path::Path::new(&raw);
    if !path.is_dir() {
        return None;
    }
    CString::new(path.to_str()?).ok()
}

/// Must be called while holding `ENGINE`.
fn ephemeris_flag() -> c_int {
    *EPHEMERIS_FLAG.get_or_init(|| match configured_directory() {
        Some(directory) => {
            // SAFETY: valid NUL-terminated string; the library copies it.
            unsafe { swe::swe_set_ephe_path(directory.as_ptr()) };
            swe::SEFLG_SWIEPH
        }
        None => swe::SEFLG_MOSEPH,
    })
}

fn source_of(returned_flags: c_int) -> &'static str {
    if returned_flags & swe::SEFLG_MOSEPH != 0 {
        "moshier"
    } else if returned_flags & swe::SEFLG_SWIEPH != 0 {
        "swiss_files"
    } else {
        "jpl"
    }
}

/// Must be called while holding `ENGINE`.
fn calc(julian_day_ut: f64, body: c_int, flags: c_int) -> Option<([f64; 6], c_int)> {
    let mut values = [0.0_f64; 6];
    let mut message = [0 as c_char; MESSAGE_BYTES];
    // SAFETY: both buffers have the sizes the C API documents (6 doubles, 256 chars).
    let returned = unsafe { swe::swe_calc_ut(julian_day_ut, body, flags, values.as_mut_ptr(), message.as_mut_ptr()) };
    (returned >= 0 && values.iter().all(|value| value.is_finite())).then_some((values, returned))
}

fn body_position(julian_day_ut: f64, id: &'static str, body: c_int, base: c_int) -> Option<BodyPositionV1> {
    let (ecliptic, returned) = calc(julian_day_ut, body, base | swe::SEFLG_SPEED)?;
    let (equatorial, _) = calc(julian_day_ut, body, base | swe::SEFLG_SPEED | swe::SEFLG_EQUATORIAL)?;
    Some(BodyPositionV1 {
        id,
        longitude_deg: ecliptic[0],
        latitude_deg: ecliptic[1],
        distance_au: ecliptic[2],
        longitude_speed: ecliptic[3],
        latitude_speed: ecliptic[4],
        distance_speed: ecliptic[5],
        right_ascension_deg: equatorial[0],
        declination_deg: equatorial[1],
        ephemeris_source: source_of(returned),
    })
}

fn house_system(julian_day_ut: f64, request: &ValidatedRequest, id: &'static str, code: u8) -> Option<HouseSystemV1> {
    let mut cusps = [0.0_f64; 13];
    let mut angles = [0.0_f64; 10];
    // SAFETY: 13 cusps and 10 angle slots are the documented buffer sizes.
    let returned = unsafe {
        swe::swe_houses_ex(
            julian_day_ut,
            0,
            request.latitude_deg,
            request.longitude_deg,
            c_int::from(code),
            cusps.as_mut_ptr(),
            angles.as_mut_ptr(),
        )
    };
    // A negative result means the library fell back to another system
    // (Placidus and Koch near the poles). Report it as unavailable instead.
    if returned < 0 || cusps[1..].iter().chain(&angles[..4]).any(|value| !value.is_finite()) {
        return None;
    }
    let mut cusps_deg = [0.0_f64; 12];
    cusps_deg.copy_from_slice(&cusps[1..]);
    Some(HouseSystemV1 {
        id,
        cusps_deg,
        ascendant_deg: angles[0],
        mc_deg: angles[1],
        armc_deg: angles[2],
        vertex_deg: angles[3],
    })
}

impl EphemerisProvider for SwissEphemeris {
    fn info(&self) -> ProviderInfoV1 {
        let _engine = ENGINE.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut buffer = [0 as c_char; MESSAGE_BYTES];
        // SAFETY: the library writes a short NUL-terminated version string.
        let version = unsafe {
            swe::swe_version(buffer.as_mut_ptr());
            CStr::from_ptr(buffer.as_ptr())
        };
        ProviderInfoV1 { id: "swiss_ephemeris", engine_version: version.to_string_lossy().into_owned() }
    }

    fn luminary_longitude(&self, body: Luminary, julian_day_ut: f64) -> Result<f64, ProviderError> {
        let _engine = ENGINE.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let id = match body {
            Luminary::Sun => swe::SE_SUN,
            Luminary::Moon => swe::SE_MOON,
        };
        calc(julian_day_ut, id, ephemeris_flag() | swe::SEFLG_SPEED).map(|(values, _)| values[0]).ok_or(ProviderError)
    }

    fn chart(&self, request: &ValidatedRequest) -> Result<ChartSnapshotV1, ProviderError> {
        let _engine = ENGINE.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let base = ephemeris_flag();
        // SAFETY: plain arithmetic on validated calendar fields.
        let julian_day_ut = unsafe {
            swe::swe_julday(request.year, request.month as c_int, request.day as c_int, request.hour, swe::SE_GREG_CAL)
        };
        if !julian_day_ut.is_finite() {
            return Err(ProviderError);
        }
        let mut bodies = Vec::with_capacity(BODIES.len());
        let mut unavailable_bodies = Vec::new();
        for (id, body) in BODIES {
            match body_position(julian_day_ut, id, body, base) {
                Some(position) => bodies.push(position),
                None => unavailable_bodies.push(id),
            }
        }
        let mut houses = Vec::with_capacity(HOUSE_SYSTEMS.len());
        let mut unavailable_house_systems = Vec::new();
        for (id, code) in HOUSE_SYSTEMS {
            match house_system(julian_day_ut, request, id, code) {
                Some(system) => houses.push(system),
                None => unavailable_house_systems.push(id),
            }
        }
        // Without the luminaries there is no chart worth returning.
        if !bodies.iter().any(|body| body.id == "Sun") || !bodies.iter().any(|body| body.id == "Moon") {
            return Err(ProviderError);
        }
        Ok(ChartSnapshotV1 { julian_day_ut, bodies, houses, house_angle_facts: None, unavailable_bodies, unavailable_house_systems })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn j2000(latitude_deg: f64, longitude_deg: f64) -> ValidatedRequest {
        ValidatedRequest { year: 2000, month: 1, day: 1, hour: 12.0, latitude_deg, longitude_deg }
    }

    fn body<'a>(chart: &'a ChartSnapshotV1, id: &str) -> &'a BodyPositionV1 {
        chart.bodies.iter().find(|body| body.id == id).expect("body present")
    }

    fn angle_between(a: f64, b: f64) -> f64 {
        let d = (a - b).rem_euclid(360.0);
        d.min(360.0 - d)
    }

    #[test]
    fn test_j2000_sun_matches_an_independent_low_precision_solar_theory() {
        // Mean longitude 280.466 deg, equation of centre -0.083 deg, nutation and
        // aberration about -0.010 deg: apparent longitude 280.37 deg at J2000.
        let chart = SwissEphemeris.chart(&j2000(0.0, 0.0)).unwrap();
        assert!((chart.julian_day_ut - 2_451_545.0).abs() < 1e-9);
        let sun = body(&chart, "Sun");
        assert!(angle_between(sun.longitude_deg, 280.37) < 0.03, "Sun at {}", sun.longitude_deg);
        assert!(sun.latitude_deg.abs() < 0.01);
        assert!((sun.distance_au - 0.9833).abs() < 0.001);
        assert!((sun.longitude_speed - 1.019).abs() < 0.005);
        // On the ecliptic, sin(dec) = sin(obliquity) * sin(longitude).
        let expected_declination =
            (23.4393_f64.to_radians().sin() * sun.longitude_deg.to_radians().sin()).asin().to_degrees();
        assert!((sun.declination_deg - expected_declination).abs() < 0.01);
    }

    #[test]
    fn test_default_build_reports_the_moshier_source_and_lists_missing_bodies() {
        if std::env::var_os(EPHE_PATH_VARIABLE).is_some() {
            return; // A developer machine with Swiss files exercises the other branch.
        }
        let chart = SwissEphemeris.chart(&j2000(44.7, 11.8)).unwrap();
        assert!(chart.bodies.iter().all(|body| body.ephemeris_source == "moshier"));
        // Chiron has no analytical ephemeris: it must be listed, not invented.
        assert_eq!(chart.unavailable_bodies, vec!["Chiron"]);
        assert!(chart.bodies.iter().all(|body| body.id != "Chiron"));
        assert_eq!(chart.bodies.len(), 14);
    }

    #[test]
    fn test_house_systems_share_the_angles_and_egizia_centres_the_ascendant() {
        let chart = SwissEphemeris.chart(&j2000(44.7, 11.8)).unwrap();
        assert!(chart.unavailable_house_systems.is_empty());
        let system = |id: &str| chart.houses.iter().find(|system| system.id == id).unwrap();
        let egizia = system("egizia");
        let placido = system("placido");
        assert!(angle_between(egizia.ascendant_deg, placido.ascendant_deg) < 1e-9);
        assert!(angle_between(egizia.mc_deg, placido.mc_deg) < 1e-9);
        assert!(angle_between(placido.cusps_deg[0], placido.ascendant_deg) < 1e-9);
        assert!(angle_between(placido.cusps_deg[9], placido.mc_deg) < 1e-9);
        assert!(angle_between(egizia.cusps_deg[0], egizia.ascendant_deg - 15.0) < 1e-9);
        for index in 0..12 {
            let next = egizia.cusps_deg[(index + 1) % 12];
            assert!(angle_between(next, egizia.cusps_deg[index] + 30.0) < 1e-9);
        }
    }

    #[test]
    fn test_polar_placidus_is_reported_unavailable_not_silently_replaced() {
        let chart = SwissEphemeris.chart(&j2000(80.0, 0.0)).unwrap();
        assert!(chart.unavailable_house_systems.contains(&"placido"));
        assert!(chart.unavailable_house_systems.contains(&"koch"));
        assert!(chart.houses.iter().any(|system| system.id == "egizia"));
        assert!(chart.houses.iter().all(|system| system.id != "placido"));
    }

    #[test]
    fn test_provider_identifies_itself() {
        let info = SwissEphemeris.info();
        assert_eq!(info.id, "swiss_ephemeris");
        assert!(info.engine_version.starts_with("2."));
    }
}
