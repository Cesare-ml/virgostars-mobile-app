// The contents of this file are subject to the Common Public Attribution License Version 1.0.
// See https://opensource.org/license/CPAL-1.0 and the repository LICENSE / NOTICE.
// Original VirgoStars Mobile source code, Copyright (c) 2026 Cesare-ml (VirgoStars project).

//! Versioned boundary for the one-screen live current-sky experience.
//! Until a legally distributable, validated ephemeris adapter is registered,
//! the command returns an explicit unavailable state instead of fake data.

use chrono::{DateTime, FixedOffset};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentSkyRequest {
    pub instant_utc: String,
    pub timezone_id: String,
    pub latitude: f64,
    pub longitude: f64,
    pub location_accuracy_meters: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineProvenance {
    pub provider: String,
    pub version: String,
    pub time_scale: String,
    pub coordinate_frame: String,
    pub center: String,
    pub position_mode: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentSkyResponse {
    pub schema_version: u8,
    pub status: &'static str,
    pub calculated_at_utc: Option<String>,
    pub engine: Option<EngineProvenance>,
    pub chart: Option<Value>,
    pub error_code: Option<&'static str>,
    pub message: Option<&'static str>,
}

pub trait CurrentSkyProvider: Send + Sync {
    fn provenance(&self) -> EngineProvenance;
    fn calculate(&self, request: &CurrentSkyRequest) -> Result<Value, String>;
}

fn valid_utc_instant(value: &str) -> bool {
    // Reject local/offset timestamps; the mobile contract requires a UTC instant.
    if !value.ends_with('Z') {
        return false;
    }
    DateTime::<FixedOffset>::parse_from_rfc3339(value).is_ok()
}

fn valid_iana_timezone(value: &str) -> bool {
    value.parse::<Tz>().is_ok()
}

fn valid_chart(chart: &Value) -> bool {
    let Some(object) = chart.as_object() else { return false };
    if object.get("zodiac").and_then(Value::as_str) != Some("tropical") {
        return false;
    }
    let Some(bodies) = object.get("bodies").and_then(Value::as_array) else {
        return false;
    };
    const IDS: [&str; 10] = [
        "sun", "moon", "mercury", "venus", "mars", "jupiter",
        "saturn", "uranus", "neptune", "pluto",
    ];
    if bodies.len() != IDS.len() { return false; }
    let mut seen = std::collections::HashSet::new();
    bodies.iter().all(|body| {
        let Some(id) = body.get("id").and_then(Value::as_str) else { return false };
        let Some(longitude) = body.get("longitude").and_then(Value::as_f64) else { return false };
        IDS.contains(&id)
            && seen.insert(id)
            && longitude.is_finite()
            && (0.0..360.0).contains(&longitude)
    })
}

fn unavailable(code: &'static str, message: &'static str) -> CurrentSkyResponse {
    CurrentSkyResponse {
        schema_version: 1,
        status: "unavailable",
        calculated_at_utc: None,
        engine: None,
        chart: None,
        error_code: Some(code),
        message: Some(message),
    }
}

/// Stable provider seam: Swiss and VirgoStars implementations must both satisfy
/// this contract, including an explicit time scale, frame, center and position mode.
pub fn calculate_with_provider(
    request: &CurrentSkyRequest,
    provider: Option<&dyn CurrentSkyProvider>,
) -> CurrentSkyResponse {
    if !request.latitude.is_finite()
        || !(-90.0..=90.0).contains(&request.latitude)
        || !request.longitude.is_finite()
        || !(-180.0..=180.0).contains(&request.longitude)
        || !request.location_accuracy_meters.is_finite()
        || request.location_accuracy_meters < 0.0
        || !valid_utc_instant(&request.instant_utc)
        || !valid_iana_timezone(&request.timezone_id)
    {
        return unavailable("invalid_input", "La posizione o l'istante non sono validi.");
    }

    let Some(provider) = provider else {
        return unavailable(
            "ephemeris_provider_not_configured",
            "Il motore effemeridico non è ancora integrato in questa build.",
        );
    };

    match provider.calculate(request) {
        Ok(chart) if valid_chart(&chart) => CurrentSkyResponse {
            schema_version: 1,
            status: "ready",
            calculated_at_utc: Some(request.instant_utc.clone()),
            engine: Some(provider.provenance()),
            chart: Some(chart),
            error_code: None,
            message: None,
        },
        Ok(_) | Err(_) => unavailable(
            "ephemeris_calculation_failed",
            "Il calcolo del cielo non è riuscito. Nessun grafico è stato mostrato.",
        ),
    }
}

#[tauri::command]
pub fn calculate_current_sky(request: CurrentSkyRequest) -> CurrentSkyResponse {
    // Fail closed. Do not substitute synthetic coordinates or a stale chart.
    calculate_with_provider(&request, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestProvider;

    impl CurrentSkyProvider for TestProvider {
        fn provenance(&self) -> EngineProvenance {
            EngineProvenance {
                provider: "test-fixture".into(),
                version: "0".into(),
                time_scale: "UTC".into(),
                coordinate_frame: "fixture-only".into(),
                center: "Earth".into(),
                position_mode: "fixture".into(),
            }
        }

        fn calculate(&self, _request: &CurrentSkyRequest) -> Result<Value, String> {
            Ok(serde_json::json!({
                "zodiac": "tropical",
                "bodies": [
                    {"id":"sun","longitude":0.0},
                    {"id":"moon","longitude":1.0},
                    {"id":"mercury","longitude":2.0},
                    {"id":"venus","longitude":3.0},
                    {"id":"mars","longitude":4.0},
                    {"id":"jupiter","longitude":5.0},
                    {"id":"saturn","longitude":6.0},
                    {"id":"uranus","longitude":7.0},
                    {"id":"neptune","longitude":8.0},
                    {"id":"pluto","longitude":9.0}
                ]
            }))
        }
    }

    fn request() -> CurrentSkyRequest {
        CurrentSkyRequest {
            instant_utc: "2026-11-16T11:00:00.000Z".into(),
            timezone_id: "Europe/Rome".into(),
            latitude: 44.5,
            longitude: 11.8,
            location_accuracy_meters: 12.0,
        }
    }

    #[test]
    fn missing_provider_never_returns_a_chart() {
        let result = calculate_with_provider(&request(), None);
        assert_eq!(result.status, "unavailable");
        assert_eq!(result.error_code, Some("ephemeris_provider_not_configured"));
        assert!(result.chart.is_none());
        assert!(result.engine.is_none());
    }

    #[test]
    fn invalid_location_is_rejected_before_provider_access() {
        let mut input = request();
        input.latitude = 91.0;
        let result = calculate_with_provider(&input, Some(&TestProvider));
        assert_eq!(result.error_code, Some("invalid_input"));
        assert!(result.chart.is_none());
    }

    #[test]
    fn malformed_and_offset_instants_are_rejected() {
        for instant in ["", "yesterday", "2026-11-16T12:00:00+01:00", "2026-13-16T11:00:00Z"] {
            let mut input = request();
            input.instant_utc = instant.into();
            let result = calculate_with_provider(&input, Some(&TestProvider));
            assert_eq!(result.error_code, Some("invalid_input"), "{instant}");
        }
    }

    #[test]
    fn invalid_timezone_is_rejected() {
        let mut input = request();
        input.timezone_id = "Europe/Imaginary".into();
        let result = calculate_with_provider(&input, Some(&TestProvider));
        assert_eq!(result.error_code, Some("invalid_input"));
    }

    #[test]
    fn incomplete_or_invalid_planetary_payload_is_rejected() {
        for chart in [
            serde_json::json!({"fixture": true}),
            serde_json::json!({"zodiac": "tropical", "bodies": []}),
            serde_json::json!({"zodiac": "sidereal", "bodies": []}),
        ] {
            assert!(!valid_chart(&chart));
        }
        let mut valid = TestProvider.calculate(&request()).unwrap();
        assert!(valid_chart(&valid));
        valid["bodies"][1]["id"] = serde_json::json!("sun");
        assert!(!valid_chart(&valid));
    }

    #[test]
    fn provider_response_preserves_provenance_and_chart_payload() {
        let result = calculate_with_provider(&request(), Some(&TestProvider));
        assert_eq!(result.status, "ready");
        assert_eq!(result.engine.unwrap().provider, "test-fixture");
        assert_eq!(result.chart.unwrap()["bodies"][0]["id"], "sun");
    }
}
