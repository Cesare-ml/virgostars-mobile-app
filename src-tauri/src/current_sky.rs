// The contents of this file are subject to the Common Public Attribution License Version 1.0.
// See https://opensource.org/license/CPAL-1.0 and the repository LICENSE / NOTICE.
// Original VirgoStars Mobile source code, Copyright (c) 2026 Cesare-ml (VirgoStars project).

//! Versioned boundary for the one-screen live current-sky experience.
//! Until a legally distributable, validated ephemeris adapter is registered,
//! the command returns an explicit unavailable state instead of fake data.

use chrono::{DateTime, FixedOffset};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};


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

impl EngineProvenance {
    fn is_valid(&self) -> bool {
        [
            &self.provider,
            &self.version,
            &self.time_scale,
            &self.coordinate_frame,
            &self.center,
            &self.position_mode,
        ]
        .iter()
        .all(|field| !field.trim().is_empty())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartBody {
    pub id: String,
    /// Tropical geocentric ecliptic longitude in degrees [0, 360).
    pub longitude_deg: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartPayload {
    pub schema_version: u8,
    pub bodies: Vec<ChartBody>,
}

impl ChartPayload {
    fn is_valid(&self) -> bool {
        self.schema_version == 1
            && self.bodies.len() >= 2
            && self.bodies.iter().all(|body| {
                !body.id.trim().is_empty()
                    && body.longitude_deg.is_finite()
                    && (0.0..360.0).contains(&body.longitude_deg)
            })
            && self.bodies.iter().any(|body| body.id == "sun")
            && self.bodies.iter().any(|body| body.id == "moon")
            && self.bodies.iter().enumerate().all(|(index, body)| {
                self.bodies[..index].iter().all(|other| other.id != body.id)
            })
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentSkyResponse {
    pub schema_version: u8,
    pub status: &'static str,
    pub calculated_at_utc: Option<String>,
    pub engine: Option<EngineProvenance>,
    pub chart: Option<ChartPayload>,
    pub error_code: Option<&'static str>,
    pub message: Option<&'static str>,
}

pub trait CurrentSkyProvider: Send + Sync {
    fn provenance(&self) -> EngineProvenance;
    fn calculate(&self, request: &CurrentSkyRequest) -> Result<ChartPayload, String>;
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

    let provenance = provider.provenance();
    if !provenance.is_valid() {
        return unavailable(
            "ephemeris_provenance_invalid",
            "Il motore astronomico non ha dichiarato una provenienza valida.",
        );
    }

    match provider.calculate(request) {
        Ok(chart) if chart.is_valid() => CurrentSkyResponse {
            schema_version: 1,
            status: "ready",
            calculated_at_utc: Some(request.instant_utc.clone()),
            engine: Some(provenance),
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

        fn calculate(&self, _request: &CurrentSkyRequest) -> Result<ChartPayload, String> {
            Ok(ChartPayload { schema_version: 1, bodies: vec![
                ChartBody { id: "sun".into(), longitude_deg: 42.0 },
                ChartBody { id: "moon".into(), longitude_deg: 123.0 },
            ] })
        }
    }

    struct InvalidProvider;

    impl CurrentSkyProvider for InvalidProvider {
        fn provenance(&self) -> EngineProvenance {
            TestProvider.provenance()
        }

        fn calculate(&self, _request: &CurrentSkyRequest) -> Result<ChartPayload, String> {
            Ok(ChartPayload { schema_version: 1, bodies: vec![
                ChartBody { id: "sun".into(), longitude_deg: f64::NAN },
                ChartBody { id: "moon".into(), longitude_deg: 42.0 },
            ] })
        }
    }

    #[test]
    fn malformed_provider_chart_is_rejected() {
        let result = calculate_with_provider(&request(), Some(&InvalidProvider));
        assert_eq!(result.status, "unavailable");
        assert_eq!(result.error_code, Some("ephemeris_calculation_failed"));
        assert!(result.chart.is_none());
    }

    struct MissingProvenanceProvider;

    impl CurrentSkyProvider for MissingProvenanceProvider {
        fn provenance(&self) -> EngineProvenance {
            let mut provenance = TestProvider.provenance();
            provenance.coordinate_frame = " ".into();
            provenance
        }

        fn calculate(&self, _request: &CurrentSkyRequest) -> Result<ChartPayload, String> {
            panic!("invalid provenance must be rejected before ephemeris calculation");
        }
    }

    #[test]
    fn missing_engine_provenance_fails_closed() {
        let result = calculate_with_provider(&request(), Some(&MissingProvenanceProvider));
        assert_eq!(result.status, "unavailable");
        assert_eq!(result.error_code, Some("ephemeris_provenance_invalid"));
        assert!(result.chart.is_none());
        assert!(result.engine.is_none());
    }

    fn chart(bodies: &[(&str, f64)]) -> ChartPayload {
        ChartPayload {
            schema_version: 1,
            bodies: bodies.iter().map(|(id, longitude_deg)| ChartBody {
                id: (*id).into(),
                longitude_deg: *longitude_deg,
            }).collect(),
        }
    }

    #[test]
    fn chart_validation_rejects_missing_or_duplicate_bodies() {
        assert!(!chart(&[("sun", 10.0)]).is_valid());
        assert!(!chart(&[("sun", 10.0), ("mars", 20.0)]).is_valid());
        assert!(!chart(&[("moon", 10.0), ("mars", 20.0)]).is_valid());
        assert!(!chart(&[("sun", 10.0), ("moon", 20.0), ("sun", 30.0)]).is_valid());
        assert!(!chart(&[("sun", 10.0), ("moon", 20.0), (" ", 30.0)]).is_valid());
    }

    #[test]
    fn chart_validation_rejects_invalid_longitudes_and_schema() {
        for longitude in [-0.001, 360.0, f64::INFINITY, f64::NEG_INFINITY, f64::NAN] {
            assert!(!chart(&[("sun", longitude), ("moon", 20.0)]).is_valid());
        }
        let mut wrong_version = chart(&[("sun", 0.0), ("moon", 359.999)]);
        wrong_version.schema_version = 2;
        assert!(!wrong_version.is_valid());
        assert!(chart(&[("sun", 0.0), ("moon", 359.999)]).is_valid());
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
    fn provider_response_preserves_provenance_and_chart_payload() {
        let result = calculate_with_provider(&request(), Some(&TestProvider));
        assert_eq!(result.status, "ready");
        assert_eq!(result.engine.unwrap().provider, "test-fixture");
        assert_eq!(result.chart.unwrap().bodies.len(), 2);
    }
}
