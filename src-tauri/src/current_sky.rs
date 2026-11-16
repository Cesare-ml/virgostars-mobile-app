// The contents of this file are subject to the Common Public Attribution License Version 1.0.
// See https://opensource.org/license/CPAL-1.0 and the repository LICENSE / NOTICE.
// Original VirgoStars Mobile source code, Copyright (c) 2026 Cesare-ml (VirgoStars project).

//! Versioned boundary for the one-screen live current-sky experience.
//! The provider is intentionally not faked: until a distributable, validated
//! ephemeris adapter is registered, the command returns an explicit unavailable state.

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

/// Shared provider adapter entry point. A future Swiss or VirgoStars provider
/// must implement the same contract and provide explicit scientific provenance.
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
        || request.instant_utc.trim().is_empty()
        || request.timezone_id.trim().is_empty()
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
        Ok(chart) => CurrentSkyResponse {
            schema_version: 1,
            status: "ready",
            calculated_at_utc: Some(request.instant_utc.clone()),
            engine: Some(provider.provenance()),
            chart: Some(chart),
            error_code: None,
            message: None,
        },
        Err(_) => unavailable(
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
        let result = calculate_with_provider(&input, None);
        assert_eq!(result.error_code, Some("invalid_input"));
        assert!(result.chart.is_none());
    }
}
