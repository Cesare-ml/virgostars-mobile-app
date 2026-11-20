//! Versioned chart-calculation command behind an `EphemerisProvider` port.
//!
//! The command carries one UTC instant and one geographic position and returns
//! geocentric positions and house cusps. It reads no file chosen by the WebView,
//! opens no network connection and stores nothing: the request lives only for
//! the duration of the call and is never logged.
//!
//! Astronomy stays behind the port. The temporary Swiss Ephemeris adapter is an
//! optional Cargo feature; the default build has no provider and says so.
use serde::{Deserialize, Serialize};

pub const PROTOCOL_VERSION: u8 = 1;
const MIN_YEAR: i32 = 1600;
const MAX_YEAR: i32 = 2400;
const MAX_LAT_MICRO: i32 = 90_000_000;
const MAX_LNG_MICRO: i32 = 180_000_000;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChartRequestV1 {
    pub protocol_version: u8,
    /// `YYYY-MM-DDTHH:MM:SS[.fff]Z`, proleptic Gregorian, UTC only.
    pub utc_iso: String,
    pub lat_micro: i32,
    pub lng_micro: i32,
}

/// A request that passed every range check. Providers never see raw input.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ValidatedRequest {
    pub year: i32,
    pub month: u32,
    pub day: u32,
    /// Decimal hours of the UTC day, `0.0 <= h < 24.0`.
    pub hour: f64,
    pub latitude_deg: f64,
    pub longitude_deg: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BodyPositionV1 {
    pub id: &'static str,
    pub longitude_deg: f64,
    pub latitude_deg: f64,
    pub distance_au: f64,
    pub longitude_speed: f64,
    pub latitude_speed: f64,
    pub distance_speed: f64,
    pub right_ascension_deg: f64,
    pub declination_deg: f64,
    /// Which data the engine actually used for this body, never the one requested.
    pub ephemeris_source: &'static str,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HouseSystemV1 {
    pub id: &'static str,
    pub cusps_deg: [f64; 12],
    pub ascendant_deg: f64,
    pub mc_deg: f64,
    pub armc_deg: f64,
    pub vertex_deg: f64,
}

/// Astronomical inputs for shared house methods. UTC is approximated as UT1 by the provider.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HouseAngleFactsV1 {
    pub model: &'static str,
    pub time_source: &'static str,
    pub tt_julian_day: f64,
    pub latitude_deg: f64,
    pub longitude_deg_east: f64,
    pub armc_deg: f64,
    pub true_obliquity_deg: f64,
    pub ascendant_deg: f64,
    pub mc_deg: f64,
    pub vertex_deg: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChartSnapshotV1 {
    pub julian_day_ut: f64,
    pub bodies: Vec<BodyPositionV1>,
    pub houses: Vec<HouseSystemV1>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub house_angle_facts: Option<HouseAngleFactsV1>,
    /// Requested but not computable with the available data. Never substituted.
    pub unavailable_bodies: Vec<&'static str>,
    pub unavailable_house_systems: Vec<&'static str>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfoV1 {
    pub id: &'static str,
    pub engine_version: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChartResponseV1 {
    pub protocol_version: u8,
    /// `ok`, `provider_unavailable`, `invalid_request` or `calculation_failed`.
    pub status: &'static str,
    pub provider: Option<ProviderInfoV1>,
    pub chart: Option<ChartSnapshotV1>,
}

/// Deliberately opaque: provider diagnostics may echo paths or inputs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ProviderError;

/// The two bodies whose returns are searched.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Luminary {
    Sun,
    Moon,
}

pub trait EphemerisProvider: Send + Sync {
    fn info(&self) -> ProviderInfoV1;
    fn covers(&self, _request: &ValidatedRequest) -> bool { true }
    fn chart(&self, request: &ValidatedRequest) -> Result<ChartSnapshotV1, ProviderError>;
    /// Apparent geocentric ecliptic longitude of a luminary, degrees in `[0, 360)`.
    /// Providers that cannot answer keep this default and searches report a failure.
    fn luminary_longitude(&self, _body: Luminary, _julian_day_ut: f64) -> Result<f64, ProviderError> {
        Err(ProviderError)
    }
}

fn digits(text: &str) -> Option<u32> {
    if text.is_empty() || !text.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    text.parse().ok()
}

fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 => 29,
        2 => 28,
        _ => 0,
    }
}

/// Strict parser: no offsets, no leap seconds, no lenient separators.
pub fn validate(request: &ChartRequestV1) -> Option<ValidatedRequest> {
    if request.protocol_version != PROTOCOL_VERSION
        || request.lat_micro.unsigned_abs() > MAX_LAT_MICRO as u32
        || request.lng_micro.unsigned_abs() > MAX_LNG_MICRO as u32
    {
        return None;
    }
    let text = request.utc_iso.as_str();
    if !text.is_ascii() || text.len() < 20 || text.len() > 24 || !text.ends_with('Z') {
        return None;
    }
    let bytes = text.as_bytes();
    if bytes[4] != b'-' || bytes[7] != b'-' || bytes[10] != b'T' || bytes[13] != b':' || bytes[16] != b':' {
        return None;
    }
    let year = digits(&text[0..4])? as i32;
    let month = digits(&text[5..7])?;
    let day = digits(&text[8..10])?;
    let hour = digits(&text[11..13])?;
    let minute = digits(&text[14..16])?;
    let second = digits(&text[17..19])?;
    let fraction = &text[19..text.len() - 1];
    let millis = if fraction.is_empty() {
        0
    } else {
        let value = fraction.strip_prefix('.')?;
        if value.len() != 3 {
            return None;
        }
        digits(value)?
    };
    if !(MIN_YEAR..=MAX_YEAR).contains(&year)
        || day == 0
        || day > days_in_month(year, month)
        || hour > 23
        || minute > 59
        || second > 59
    {
        return None;
    }
    Some(ValidatedRequest {
        year,
        month,
        day,
        hour: f64::from(hour) + f64::from(minute) / 60.0 + (f64::from(second) + f64::from(millis) / 1000.0) / 3600.0,
        latitude_deg: f64::from(request.lat_micro) / 1e6,
        longitude_deg: f64::from(request.lng_micro) / 1e6,
    })
}

fn failure(status: &'static str) -> ChartResponseV1 {
    ChartResponseV1 { protocol_version: PROTOCOL_VERSION, status, provider: None, chart: None }
}

/// Pure decision logic, separated from Tauri so it can be unit tested.
pub fn respond(provider: Option<&dyn EphemerisProvider>, request: &ChartRequestV1) -> ChartResponseV1 {
    let Some(valid) = validate(request) else {
        return failure("invalid_request");
    };
    let Some(provider) = provider else {
        return failure("provider_unavailable");
    };
    if !provider.covers(&valid) {
        return failure("out_of_range");
    }
    match provider.chart(&valid) {
        Ok(chart) => ChartResponseV1 {
            protocol_version: PROTOCOL_VERSION,
            status: "ok",
            provider: Some(provider.info()),
            chart: Some(chart),
        },
        Err(ProviderError) => failure("calculation_failed"),
    }
}

#[cfg(all(feature = "virgostars-ephemeris", not(feature = "swiss-ephemeris")))]
pub(crate) fn active_provider() -> Option<&'static dyn EphemerisProvider> {
    crate::virgostars_provider::data_available().then_some(&crate::virgostars_provider::VirgoStarsEphemeris)
}

#[cfg(feature = "swiss-ephemeris")]
pub(crate) fn active_provider() -> Option<&'static dyn EphemerisProvider> {
    Some(&crate::swiss_provider::SwissEphemeris)
}

#[cfg(not(any(feature = "swiss-ephemeris", feature = "virgostars-ephemeris")))]
pub(crate) fn active_provider() -> Option<&'static dyn EphemerisProvider> {
    None
}

#[tauri::command]
pub fn calculate_chart(request: ChartRequestV1) -> ChartResponseV1 {
    respond(active_provider(), &request)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(utc_iso: &str) -> ChartRequestV1 {
        ChartRequestV1 {
            protocol_version: 1,
            utc_iso: utc_iso.to_string(),
            lat_micro: 44_697_805,
            lng_micro: 11_805_778,
        }
    }

    struct FixedProvider(Result<ChartSnapshotV1, ProviderError>);
    impl EphemerisProvider for FixedProvider {
        fn info(&self) -> ProviderInfoV1 {
            ProviderInfoV1 { id: "synthetic_test", engine_version: "0".to_string() }
        }
        fn chart(&self, _request: &ValidatedRequest) -> Result<ChartSnapshotV1, ProviderError> {
            self.0.clone()
        }
    }

    fn empty_chart() -> ChartSnapshotV1 {
        ChartSnapshotV1 {
            julian_day_ut: 2_451_545.0,
            bodies: vec![],
            houses: vec![],
            house_angle_facts: None,
            unavailable_bodies: vec!["Chiron"],
            unavailable_house_systems: vec![],
        }
    }

    #[test]
    fn rejects_extreme_coordinates_without_overflow() {
        let mut value = request("2000-01-01T12:00:00Z");
        value.lat_micro = i32::MIN;
        assert!(validate(&value).is_none());
        value.lat_micro = 0;
        value.lng_micro = i32::MIN;
        assert!(validate(&value).is_none());
    }
    #[test]
    fn test_accepts_canonical_utc_with_and_without_milliseconds() {
        let plain = validate(&request("2001-02-03T04:05:06Z")).unwrap();
        assert_eq!((plain.year, plain.month, plain.day), (2001, 2, 3));
        assert!((plain.hour - (4.0 + 5.0 / 60.0 + 6.0 / 3600.0)).abs() < 1e-12);
        assert!((plain.latitude_deg - 44.697805).abs() < 1e-9);
        let millis = validate(&request("2001-02-03T04:05:06.500Z")).unwrap();
        assert!((millis.hour - plain.hour - 0.5 / 3600.0).abs() < 1e-12);
    }

    #[test]
    fn test_rejects_offsets_impossible_dates_and_loose_syntax() {
        for bad in [
            "2001-02-03T04:05:06+01:00",
            "2001-02-03 04:05:06Z",
            "2001-02-29T00:00:00Z",
            "2001-13-01T00:00:00Z",
            "2001-00-10T00:00:00Z",
            "2001-02-03T24:00:00Z",
            "2001-02-03T04:05:60Z",
            "2001-02-03T04:05:06.5Z",
            "2001-02-03T04:05:06.5000Z",
            "1599-12-31T23:59:59Z",
            "2401-01-01T00:00:00Z",
            "2001-02-03T04:05Z",
            "+001-02-03T04:05:06Z",
            "２００１-02-03T04:05:06Z",
            "",
        ] {
            assert!(validate(&request(bad)).is_none(), "accepted {bad:?}");
        }
        assert!(validate(&request("2000-02-29T00:00:00Z")).is_some());
    }

    #[test]
    fn test_rejects_wrong_protocol_and_out_of_range_coordinates() {
        let mut wrong = request("2001-02-03T04:05:06Z");
        wrong.protocol_version = 2;
        assert!(validate(&wrong).is_none());
        let mut north = request("2001-02-03T04:05:06Z");
        north.lat_micro = 90_000_001;
        assert!(validate(&north).is_none());
        let mut west = request("2001-02-03T04:05:06Z");
        west.lng_micro = -180_000_001;
        assert!(validate(&west).is_none());
        let mut pole = request("2001-02-03T04:05:06Z");
        pole.lat_micro = -90_000_000;
        pole.lng_micro = 180_000_000;
        assert!(validate(&pole).is_some());
    }

    #[test]
    fn test_no_provider_is_reported_and_never_replaced_by_made_up_positions() {
        let response = respond(None, &request("2001-02-03T04:05:06Z"));
        assert_eq!(response.status, "provider_unavailable");
        assert!(response.provider.is_none() && response.chart.is_none());
    }

    #[test]
    fn test_out_of_range_never_invokes_the_provider_chart() {
        struct OutOfRange;
        impl EphemerisProvider for OutOfRange {
            fn info(&self) -> ProviderInfoV1 { panic!("out-of-range provider must not be read") }
            fn covers(&self, _: &ValidatedRequest) -> bool { false }
            fn chart(&self, _: &ValidatedRequest) -> Result<ChartSnapshotV1, ProviderError> { panic!("out-of-range chart must not be calculated") }
        }
        let response = respond(Some(&OutOfRange), &request("2000-01-01T12:00:00Z"));
        assert_eq!(response.status, "out_of_range");
        assert!(response.provider.is_none() && response.chart.is_none());
    }

    #[test]
    fn test_invalid_input_is_rejected_before_reaching_a_provider() {
        let provider = FixedProvider(Ok(empty_chart()));
        let response = respond(Some(&provider), &request("not a date"));
        assert_eq!(response.status, "invalid_request");
        assert!(response.chart.is_none());
    }

    #[test]
    fn test_provider_failure_stays_opaque() {
        let provider = FixedProvider(Err(ProviderError));
        let response = respond(Some(&provider), &request("2001-02-03T04:05:06Z"));
        assert_eq!(response.status, "calculation_failed");
        assert!(response.provider.is_none() && response.chart.is_none());
    }

    #[test]
    fn test_serialized_keys_match_the_typescript_contract() {
        let provider = FixedProvider(Ok(ChartSnapshotV1 {
            bodies: vec![BodyPositionV1 {
                id: "Sun",
                longitude_deg: 1.0,
                latitude_deg: 2.0,
                distance_au: 3.0,
                longitude_speed: 4.0,
                latitude_speed: 5.0,
                distance_speed: 6.0,
                right_ascension_deg: 7.0,
                declination_deg: 8.0,
                ephemeris_source: "moshier",
            }],
            houses: vec![HouseSystemV1 {
                id: "egizia",
                cusps_deg: [0.0; 12],
                ascendant_deg: 15.0,
                mc_deg: 285.0,
                armc_deg: 286.0,
                vertex_deg: 200.0,
            }],
            ..empty_chart()
        }));
        let raw = serde_json::to_value(respond(Some(&provider), &request("2001-02-03T04:05:06Z"))).unwrap();
        assert_eq!(raw["protocolVersion"], 1);
        assert_eq!(raw["status"], "ok");
        assert_eq!(raw["provider"]["id"], "synthetic_test");
        assert_eq!(raw["provider"]["engineVersion"], "0");
        assert_eq!(raw["chart"]["julianDayUt"], 2_451_545.0);
        assert_eq!(raw["chart"]["unavailableBodies"][0], "Chiron");
        assert_eq!(raw["chart"]["unavailableHouseSystems"].as_array().unwrap().len(), 0);
        let body = &raw["chart"]["bodies"][0];
        for key in [
            "id", "longitudeDeg", "latitudeDeg", "distanceAu", "longitudeSpeed", "latitudeSpeed",
            "distanceSpeed", "rightAscensionDeg", "declinationDeg", "ephemerisSource",
        ] {
            assert!(!body[key].is_null(), "missing body key {key}");
        }
        let house = &raw["chart"]["houses"][0];
        for key in ["id", "cuspsDeg", "ascendantDeg", "mcDeg", "armcDeg", "vertexDeg"] {
            assert!(!house[key].is_null(), "missing house key {key}");
        }
        assert_eq!(house["cuspsDeg"].as_array().unwrap().len(), 12);
    }

    #[test]
    fn test_request_rejects_unknown_fields() {
        let extra = r#"{"protocolVersion":1,"utcIso":"2001-02-03T04:05:06Z","latMicro":0,"lngMicro":0,"ephePath":"x"}"#;
        assert!(serde_json::from_str::<ChartRequestV1>(extra).is_err());
        let exact = r#"{"protocolVersion":1,"utcIso":"2001-02-03T04:05:06Z","latMicro":0,"lngMicro":0}"#;
        assert!(serde_json::from_str::<ChartRequestV1>(exact).is_ok());
    }
}
