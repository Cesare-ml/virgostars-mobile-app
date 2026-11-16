//! Tauri bridge for the single-feature current-sky MVP.
//! Location stays on-device. The provider adapter fails closed until a
//! legally distributable and independently validated implementation is linked.
use serde::{Deserialize, Serialize};

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo { platform: &'static str, mode: &'static str, schema_version: u8 }

#[derive(Deserialize, Clone)]
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

#[derive(Serialize, Debug)]
#[serde(rename_all = "lowercase")]
enum SkyBody { Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto }

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct CurrentSkyPosition { body: SkyBody, longitude_deg: f64, latitude_deg: f64, retrograde: Option<bool> }

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct CurrentSkyAngle { longitude_deg: f64, latitude_deg: f64 }

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct CurrentSkyAspect {
    first_body: String, second_body: String, aspect: String,
    exact_angle_deg: f64, orb_deg: f64, applying: Option<bool>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct CurrentSkyObserver {
    latitude_deg: f64, longitude_deg_east: f64, altitude_meters: Option<f64>, location_accuracy_meters: f64,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct CurrentSkyProviderInfo {
    id: String, version: String, ephemeris: String, time_scale: String,
    coordinate_frame: String, zodiac: String, ayanamsa_id: Option<String>,
    house_system: String, limitations: Vec<String>,
}

/// Must remain structurally aligned with src/app/current-sky/contracts.ts.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct CurrentSkySnapshot {
    schema_version: u8, calculated_at_utc: String, timezone_id: String, utc_offset_minutes: i16,
    observer: CurrentSkyObserver, provider: CurrentSkyProviderInfo, positions: Vec<CurrentSkyPosition>,
    ascendant: CurrentSkyAngle, midheaven: CurrentSkyAngle, house_cusps: Vec<f64>, aspects: Vec<CurrentSkyAspect>,
}

#[derive(Debug, PartialEq, Eq)]
enum CurrentSkyError { InvalidInput(&'static str), ProviderUnavailable }

impl std::fmt::Display for CurrentSkyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidInput(reason) => write!(f, "current_sky_invalid_input:{reason}"),
            Self::ProviderUnavailable => write!(f, "sky_engine_unavailable"),
        }
    }
}

/// Stable native boundary. Concrete Swiss/DE441 implementations must be separate
/// adapters and may only be selected after the required license and validation gates.
trait CurrentSkyProvider {
    fn id(&self) -> &'static str;
    fn calculate(&self, input: &CurrentSkyInput) -> Result<CurrentSkySnapshot, CurrentSkyError>;
}

struct NoCurrentSkyProvider;
impl CurrentSkyProvider for NoCurrentSkyProvider {
    fn id(&self) -> &'static str { "unavailable" }
    fn calculate(&self, _input: &CurrentSkyInput) -> Result<CurrentSkySnapshot, CurrentSkyError> {
        Err(CurrentSkyError::ProviderUnavailable)
    }
}

#[tauri::command]
fn runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        platform: if cfg!(target_os = "android") { "android" } else if cfg!(target_os = "ios") { "ios" } else { "desktop-preview" },
        mode: "prototype", schema_version: 1,
    }
}

fn validate_current_sky_input(input: &CurrentSkyInput) -> Result<(), CurrentSkyError> {
    if input.schema_version != 1 { return Err(CurrentSkyError::InvalidInput("unsupported-contract-version")); }
    if !is_valid_utc_timestamp(&input.captured_at_utc) { return Err(CurrentSkyError::InvalidInput("captured-at-utc")); }
    if input.timezone_id.is_empty() || input.timezone_id.len() > 128 { return Err(CurrentSkyError::InvalidInput("timezone-id")); }
    if !(-840..=840).contains(&input.utc_offset_minutes) { return Err(CurrentSkyError::InvalidInput("utc-offset")); }
    if !input.latitude_deg.is_finite() || !(-90.0..=90.0).contains(&input.latitude_deg) { return Err(CurrentSkyError::InvalidInput("latitude")); }
    if !input.longitude_deg_east.is_finite() || !(-180.0..=180.0).contains(&input.longitude_deg_east) { return Err(CurrentSkyError::InvalidInput("longitude")); }
    if input.altitude_meters.is_some_and(|v| !v.is_finite()) { return Err(CurrentSkyError::InvalidInput("altitude")); }
    if !input.location_accuracy_meters.is_finite() || input.location_accuracy_meters < 0.0 { return Err(CurrentSkyError::InvalidInput("location-accuracy")); }
    Ok(())
}

fn is_valid_utc_timestamp(value: &str) -> bool {
    if !value.is_ascii() || !value.ends_with('Z') { return false; }
    let Some((date, time)) = value[..value.len() - 1].split_once('T') else { return false; };
    if date.len() != 10 || time.len() < 8 || &date[4..5] != "-" || &date[7..8] != "-" || &time[2..3] != ":" || &time[5..6] != ":" { return false; }
    if !date[0..4].bytes().all(|b| b.is_ascii_digit()) || !date[5..7].bytes().all(|b| b.is_ascii_digit()) || !date[8..10].bytes().all(|b| b.is_ascii_digit()) { return false; }
    if !time[0..2].bytes().all(|b| b.is_ascii_digit()) || !time[3..5].bytes().all(|b| b.is_ascii_digit()) { return false; }
    let seconds = &time[6..];
    let second_text = seconds.split_once('.').map_or(seconds, |(whole, fraction)| { if fraction.is_empty() || fraction.len() > 9 || !fraction.bytes().all(|b| b.is_ascii_digit()) { "invalid" } else { whole } });
    if second_text.len() != 2 || !second_text.bytes().all(|b| b.is_ascii_digit()) { return false; }
    let year: i32 = match date[0..4].parse() { Ok(v) => v, Err(_) => return false };
    let month: u32 = match date[5..7].parse() { Ok(v) => v, Err(_) => return false };
    let day: u32 = match date[8..10].parse() { Ok(v) => v, Err(_) => return false };
    let hour: u32 = match time[0..2].parse() { Ok(v) => v, Err(_) => return false };
    let minute: u32 = match time[3..5].parse() { Ok(v) => v, Err(_) => return false };
    let second: u32 = match second_text.parse() { Ok(v) => v, Err(_) => return false };
    if year < 1 || !(1..=12).contains(&month) || hour > 23 || minute > 59 || second > 59 { return false; }
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days = match month { 1 | 3 | 5 | 7 | 8 | 10 | 12 => 31, 4 | 6 | 9 | 11 => 30, 2 if leap => 29, 2 => 28, _ => return false };
    (1..=days).contains(&day)
}

#[tauri::command]
fn calculate_current_sky(input: CurrentSkyInput) -> Result<CurrentSkySnapshot, String> {
    validate_current_sky_input(&input).map_err(|error| error.to_string())?;
    let provider = NoCurrentSkyProvider;
    let _provider_id = provider.id();
    provider.calculate(&input).map_err(|error| error.to_string())
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
    fn valid_input() -> CurrentSkyInput { CurrentSkyInput { schema_version: 1, captured_at_utc: "2026-11-16T11:00:00.000Z".into(), timezone_id: "Europe/Rome".into(), utc_offset_minutes: 60, latitude_deg: 44.5, longitude_deg_east: 11.3, altitude_meters: None, location_accuracy_meters: 12.0 } }
    #[test] fn runtime_contract_is_non_privileged() { let info = super::runtime_info(); assert_eq!(info.mode, "prototype"); assert_eq!(info.schema_version, 1); }
    #[test] fn rejects_out_of_range_location() { let mut input = valid_input(); input.latitude_deg = 91.0; assert_eq!(validate_current_sky_input(&input), Err(CurrentSkyError::InvalidInput("latitude"))); }
    #[test] fn rejects_invalid_civil_time_not_just_bad_suffix() { for value in ["notTnotZ", "2026-02-30T12:00:00Z", "2026-11-16T25:00:00Z", "2026-11-16T12:61:00Z", "2026-11-16T12:00:61Z", "2026-11-16T12:00:00.9999999999Z"] { assert!(!is_valid_utc_timestamp(value), "accepted {value}"); } }
    #[test] fn accepts_fractional_utc_timestamp() { assert!(is_valid_utc_timestamp("2026-11-16T11:00:00.123456Z")); }
    #[test] fn native_command_does_not_fabricate_a_chart_without_provider() { assert_eq!(calculate_current_sky(valid_input()).unwrap_err(), "sky_engine_unavailable"); }
}
