//! Optional, read-only diagnostic bridge to VirgoStars-Ephemeris.
//!
//! Returns **geometric** ICRF/J2000 state vectors, not astrological positions.
//! Callers must supply JD TDB themselves; this module never converts UTC, and
//! is deliberately not connected to the production chart calculator.
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
    use super::{BodyToken, ProbeRequest};

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
}
