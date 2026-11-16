//! Tauri bridge for the single-feature current-sky MVP.
//! Location stays on-device. Astronomy is fail-closed until a validated provider
//! is linked; this command never returns illustrative or fabricated chart data.
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct RuntimeInfo {
    platform: &'static str,
    mode: &'static str,
    schema_version: u8,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurrentSkyInput {
    schema_version: u8,
    captured_at_utc: String,
    timezone_id: String,
    utc_offset_minutes: i16,
    latitude_deg: f64,
    longitude_deg_east: f64,
    altitude_meters: Option<f64>,
    location_accuracy_meters: f64,
}

#[tauri::command]
fn runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        platform: if cfg!(target_os = "android") {
            "android"
        } else if cfg!(target_os = "ios") {
            "ios"
        } else {
            "desktop-preview"
        },
        mode: "prototype",
        schema_version: 1,
    }
}

/// Input/permission boundary. Replace the unavailable result only when a
/// legally redistributable, independently validated engine is linked.
#[tauri::command]
fn calculate_current_sky(input: CurrentSkyInput) -> Result<(), String> {
    if input.schema_version != 1 {
        return Err("current_sky_unsupported_contract_version".into());
    }
    if input.captured_at_utc.is_empty()
        || !input.captured_at_utc.ends_with('Z')
        || !input.captured_at_utc.contains('T')
        || input.timezone_id.is_empty()
        || input.timezone_id.len() > 128
        || !(-840..=840).contains(&input.utc_offset_minutes)
        || !input.latitude_deg.is_finite()
        || !(-90.0..=90.0).contains(&input.latitude_deg)
        || !input.longitude_deg_east.is_finite()
        || !(-180.0..=180.0).contains(&input.longitude_deg_east)
        || input.altitude_meters.is_some_and(|v| !v.is_finite())
        || !input.location_accuracy_meters.is_finite()
        || input.location_accuracy_meters < 0.0
    {
        return Err("current_sky_invalid_input".into());
    }

    Err("sky_engine_unavailable".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_geolocation::init());

    builder
        .invoke_handler(tauri::generate_handler![runtime_info, calculate_current_sky])
        .run(tauri::generate_context!())
        .expect("failed to start VirgoStars Mobile");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_input() -> CurrentSkyInput {
        CurrentSkyInput {
            schema_version: 1,
            captured_at_utc: "2026-11-16T11:00:00.000Z".into(),
            timezone_id: "Europe/Rome".into(),
            utc_offset_minutes: 60,
            latitude_deg: 44.5,
            longitude_deg_east: 11.3,
            altitude_meters: None,
            location_accuracy_meters: 12.0,
        }
    }

    #[test]
    fn runtime_contract_is_non_privileged() {
        let info = super::runtime_info();
        assert_eq!(info.mode, "prototype");
        assert_eq!(info.schema_version, 1);
    }

    #[test]
    fn current_sky_rejects_untrusted_inputs_before_provider_dispatch() {
        let mut input = valid_input();
        input.latitude_deg = 91.0;
        assert_eq!(
            calculate_current_sky(input).unwrap_err(),
            "current_sky_invalid_input"
        );
    }

    #[test]
    fn current_sky_never_claims_a_chart_when_no_provider_is_linked() {
        assert_eq!(
            calculate_current_sky(valid_input()).unwrap_err(),
            "sky_engine_unavailable"
        );
    }
}
