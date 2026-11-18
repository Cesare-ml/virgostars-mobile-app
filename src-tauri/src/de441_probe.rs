//! Optional, read-only diagnostic bridge to VirgoStars-Ephemeris.
//!
//! Returns **geometric** ICRF/J2000 state vectors, not astrological positions.
//! `de441_probe` requires JD TDB directly. The separate `de441_probe_civil`
//! delegates a documented, date-limited *approximate* UTC→TDB conversion to
//! the canonical core. Neither is connected to the natal chart calculator.
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum BodyToken {
    SolarSystemBarycenter,
    Mercury,
    Venus,
    EarthMoonBarycenter,
    Earth,
    Moon,
    MarsBarycenter,
    JupiterBarycenter,
    SaturnBarycenter,
    UranusBarycenter,
    NeptuneBarycenter,
    PlutoBarycenter,
    Sun,
}

#[cfg(feature = "de441-native-probe")]
impl From<BodyToken> for virgostars_ephemeris_core::de441::Body {
    fn from(value: BodyToken) -> Self {
        use virgostars_ephemeris_core::de441::Body;
        match value {
            BodyToken::SolarSystemBarycenter => Body::SolarSystemBarycenter,
            BodyToken::Mercury => Body::Mercury,
            BodyToken::Venus => Body::Venus,
            BodyToken::EarthMoonBarycenter => Body::EarthMoonBarycenter,
            BodyToken::Earth => Body::Earth,
            BodyToken::Moon => Body::Moon,
            BodyToken::MarsBarycenter => Body::MarsBarycenter,
            BodyToken::JupiterBarycenter => Body::JupiterBarycenter,
            BodyToken::SaturnBarycenter => Body::SaturnBarycenter,
            BodyToken::UranusBarycenter => Body::UranusBarycenter,
            BodyToken::NeptuneBarycenter => Body::NeptuneBarycenter,
            BodyToken::PlutoBarycenter => Body::PlutoBarycenter,
            BodyToken::Sun => Body::Sun,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProbeRequest {
    protocol_version: u8,
    jd_tdb: f64,
    target: BodyToken,
    center: BodyToken,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CivilProbeRequest {
    protocol_version: u8,
    /// ISO-8601 civil timestamp with Z or an explicit numeric UTC offset.
    timestamp: String,
    target: BodyToken,
    center: BodyToken,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeVector {
    position_km: [f64; 3],
    velocity_km_per_day: [f64; 3],
    frame: &'static str,
    quantity: &'static str,
    epoch_scale: &'static str,
    length_unit: &'static str,
    speed_unit: &'static str,
    source: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResponse {
    protocol_version: u8,
    status: &'static str,
    selected_pack_id: Option<String>,
    result: Option<ProbeVector>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CivilTimeConversion {
    jd_tdb: f64,
    model: &'static str,
    accuracy: &'static str,
    utc_coverage: &'static str,
    source: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CivilProbeResponse {
    #[serde(flatten)]
    probe: ProbeResponse,
    conversion: Option<CivilTimeConversion>,
}

impl CivilProbeResponse {
    fn status(status: &'static str) -> Self {
        Self { probe: ProbeResponse::status(status, None), conversion: None }
    }
}

impl ProbeResponse {
    fn status(status: &'static str, selected_pack_id: Option<String>) -> Self {
        Self { protocol_version: 1, status, selected_pack_id, result: None }
    }
}

/// Command exists in all builds; normal builds always report unavailable.
/// An explicit cargo feature enables the separately pinned canonical reader.
#[tauri::command]
pub async fn de441_probe(app: AppHandle, request: ProbeRequest) -> ProbeResponse {
    if request.protocol_version != 1
        || !request.jd_tdb.is_finite()
        || request.target == request.center
    {
        return ProbeResponse::status("invalid_request", None);
    }

    #[cfg(feature = "de441-native-probe")]
    {
        let directory = match crate::de441_packs::pack_dir(&app) {
            Ok(directory) => directory,
            Err(_) => return ProbeResponse::status("storage_unavailable", None),
        };
        match tauri::async_runtime::spawn_blocking(move || probe_from_directory(directory, request)).await {
            Ok(response) => response,
            Err(_) => ProbeResponse::status("reader_failed", None),
        }
    }

    #[cfg(not(feature = "de441-native-probe"))]
    {
        let _ = (app, request);
        ProbeResponse::status("provider_unavailable", None)
    }
}

/// A separate opt-in diagnostic for modern civil dates (1972 through
/// 2027-06-27 UTC), using the core's existing *approximate* model only.
/// Historical DE441 packs remain accessible through explicit JD TDB input;
/// this command must never invent a historical UTC offset or Delta-T.
#[tauri::command]
pub async fn de441_probe_civil(app: AppHandle, request: CivilProbeRequest) -> CivilProbeResponse {
    if request.protocol_version != 1 || request.target == request.center ||
        request.timestamp.len() > 64 || request.timestamp.len() < 20 ||
        !request.timestamp.is_ascii()
    {
        return CivilProbeResponse::status("invalid_request");
    }

    #[cfg(feature = "de441-native-probe")]
    {
        use virgostars_ephemeris_core::first_sky::{CivilTimestamp, SkyError};

        let civil = match CivilTimestamp::parse(&request.timestamp) {
            Ok(civil) => civil,
            Err(_) => return CivilProbeResponse::status("invalid_request"),
        };
        let jd_tdb = match civil.to_approximate_tdb_julian_date() {
            Ok(epoch) if epoch.0.is_finite() => epoch.0,
            Err(SkyError::UnsupportedUtc) => return CivilProbeResponse::status("unsupported_utc"),
            _ => return CivilProbeResponse::status("invalid_request"),
        };
        let directory = match crate::de441_packs::pack_dir(&app) {
            Ok(directory) => directory,
            Err(_) => return CivilProbeResponse::status("storage_unavailable"),
        };
        let core_request = ProbeRequest {
            protocol_version: 1,
            jd_tdb,
            target: request.target,
            center: request.center,
        };
        let probe = match tauri::async_runtime::spawn_blocking(move || {
            probe_from_directory(directory, core_request)
        }).await {
            Ok(probe) => probe,
            Err(_) => ProbeResponse::status("reader_failed", None),
        };
        CivilProbeResponse {
            probe,
            conversion: Some(CivilTimeConversion {
                jd_tdb,
                model: "IERS_LEAP_SECONDS_USNO_TRUNCATED_TDB_TT",
                accuracy: "approximate",
                utc_coverage: "1972-01-01/2027-06-27",
                source: "virgostars_ephemeris_core",
            }),
        }
    }

    #[cfg(not(feature = "de441-native-probe"))]
    {
        let _ = (app, request);
        CivilProbeResponse::status("provider_unavailable")
    }
}

#[cfg(feature = "de441-native-probe")]
fn probe_from_directory(directory: std::path::PathBuf, request: ProbeRequest) -> ProbeResponse {
    use virgostars_ephemeris_core::de441::JulianDateTdb;
    use virgostars_ephemeris_core::de441_pack_manager::{De441PackError, De441PackManager};

    let mut reader = match De441PackManager::from_mobile_directory(&directory) {
        Ok(reader) => reader,
        Err(_) => return ProbeResponse::status("reader_failed", None),
    };
    let epoch = JulianDateTdb(request.jd_tdb);
    let selected_id = match reader.select_pack(epoch) {
        Ok(spec) => spec.id.clone(),
        Err(De441PackError::NoPackForEpoch(_)) => {
            return ProbeResponse::status("outside_coverage", None)
        }
        Err(_) => return ProbeResponse::status("reader_failed", None),
    };

    match crate::de441_packs::verify_pack_in_directory(&directory, &selected_id) {
        Ok("verified") => {}
        Ok("missing") => return ProbeResponse::status("missing_pack", Some(selected_id)),
        _ => return ProbeResponse::status("invalid_pack", Some(selected_id)),
    }

    let vector = match reader.state(request.target.into(), request.center.into(), epoch) {
        Ok(vector) => vector,
        Err(_) => return ProbeResponse::status("reader_failed", Some(selected_id)),
    };
    if !vector.position_km.iter().chain(vector.velocity_km_per_day.iter()).all(|value| value.is_finite()) {
        return ProbeResponse::status("reader_failed", Some(selected_id));
    }
    ProbeResponse {
        protocol_version: 1,
        status: "ok",
        selected_pack_id: Some(selected_id),
        result: Some(ProbeVector {
            position_km: vector.position_km,
            velocity_km_per_day: vector.velocity_km_per_day,
            frame: "ICRF/J2000",
            quantity: "geometric",
            epoch_scale: "TDB",
            length_unit: "km",
            speed_unit: "km/day",
            source: "de441_classic",
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::{BodyToken, CivilProbeRequest, ProbeRequest};

    #[test]
    fn request_rejects_unknown_fields_and_parses_named_bodies() {
        assert!(serde_json::from_str::<ProbeRequest>(
            r#"{"protocolVersion":1,"jdTdb":2451545.0,"target":"sun","center":"earth"}"#
        ).is_ok());
        assert!(serde_json::from_str::<ProbeRequest>(
            r#"{"protocolVersion":1,"jdTdb":2451545.0,"target":"sun","center":"earth","path":"/tmp/escape"}"#
        ).is_err());
        assert_ne!(BodyToken::Sun, BodyToken::Earth);
    }

    #[test]
    fn civil_request_requires_explicit_timestamp_and_rejects_extra_paths() {
        assert!(serde_json::from_str::<CivilProbeRequest>(
            r#"{"protocolVersion":1,"timestamp":"2026-11-18T12:00:00+01:00","target":"sun","center":"earth"}"#
        ).is_ok());
        assert!(serde_json::from_str::<CivilProbeRequest>(
            r#"{"protocolVersion":1,"timestamp":"2026-11-18T12:00:00Z","target":"sun","center":"earth","filePath":"any"}"#
        ).is_err());
    }

    #[cfg(feature = "de441-native-probe")]
    #[test]
    fn canonical_core_rejects_unsupported_civil_dates_and_matches_utc_offsets() {
        use virgostars_ephemeris_core::first_sky::{CivilTimestamp, SkyError};
        let utc = CivilTimestamp::parse("2026-11-18T11:00:00Z").unwrap()
            .to_approximate_tdb_julian_date().unwrap();
        let local = CivilTimestamp::parse("2026-11-18T12:00:00+01:00").unwrap()
            .to_approximate_tdb_julian_date().unwrap();
        assert_eq!(utc, local);
        let unsupported = CivilTimestamp::parse("1960-01-01T00:00:00Z").unwrap();
        assert!(matches!(unsupported.to_approximate_tdb_julian_date(), Err(SkyError::UnsupportedUtc)));
    }

    // Modification 2026-11-18: exercise the real diagnostic boundary and its
    // fail-closed responses without changing any user-owned packages.
    #[cfg(feature = "de441-native-probe")]
    #[test]
    fn probe_rejects_missing_and_corrupt_core_without_fallback() {
        use super::probe_from_directory;
        let dir = std::env::temp_dir().join(format!("virgostars-de441-probe-audit-{}", std::process::id()));
        std::fs::create_dir(&dir).unwrap();
        let request = || ProbeRequest { protocol_version: 1, jd_tdb: 2451545.0, target: BodyToken::Sun, center: BodyToken::Earth };
        let missing = probe_from_directory(dir.clone(), request());
        assert_eq!(missing.status, "missing_pack");
        assert!(missing.result.is_none());
        let path = dir.join("de441-core.eph");
        std::fs::write(&path, b"corrupt").unwrap();
        let corrupt = probe_from_directory(dir.clone(), request());
        assert_eq!(corrupt.status, "invalid_pack");
        assert!(corrupt.result.is_none());
        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }

    #[cfg(feature = "de441-native-probe")]
    #[test]
    #[ignore = "requires DE441_PACKS_DIR with locally held, separately licensed packs"]
    fn probe_reads_verified_real_base_pack() {
        use super::probe_from_directory;
        let directory = std::path::PathBuf::from(std::env::var_os("DE441_PACKS_DIR").expect("DE441_PACKS_DIR"));
        let response = probe_from_directory(directory, ProbeRequest { protocol_version: 1, jd_tdb: 2451545.0, target: BodyToken::Sun, center: BodyToken::Earth });
        assert_eq!(response.status, "ok");
        assert_eq!(response.selected_pack_id.as_deref(), Some("core"));
        let state = response.result.expect("geometric state");
        assert_eq!(state.quantity, "geometric");
        assert_eq!(state.frame, "ICRF/J2000");
        assert!(state.position_km.iter().chain(state.velocity_km_per_day.iter()).all(|x| x.is_finite()));
        println!("sun-earth JD TDB 2451545.0 position_km={:?} velocity_km_per_day={:?}", state.position_km, state.velocity_km_per_day);
    }
}
