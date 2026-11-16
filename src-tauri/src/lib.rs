//! VirgoStars Mobile native bridge and current-sky calculation.
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};

const TT_MINUS_UTC_SECONDS: f64 = 69.184; // TAI−UTC 37 s + TT−TAI 32.184 s; review after leap-second updates.

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PlanetPosition {
    body: &'static str,
    symbol: &'static str,
    longitude_deg: f64,
    latitude_deg: f64,
    sign_index: u8,
    sign_degree: f64,
    retrograde: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SkyChart {
    schema_version: u8,
    calculated_at_unix_ms: u128,
    source: &'static str,
    method: &'static str,
    reference_frame: &'static str,
    limitations: Vec<&'static str>,
    positions: Vec<PlanetPosition>,
}

#[derive(Serialize)]
struct RuntimeInfo {
    platform: &'static str,
    mode: &'static str,
    schema_version: u8,
}

#[derive(Clone, Copy)]
enum Body { Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune }

impl Body {
    fn name(self) -> &'static str {
        match self {
            Self::Sun => "Sun", Self::Moon => "Moon", Self::Mercury => "Mercury",
            Self::Venus => "Venus", Self::Mars => "Mars", Self::Jupiter => "Jupiter",
            Self::Saturn => "Saturn", Self::Uranus => "Uranus", Self::Neptune => "Neptune",
        }
    }
    fn symbol(self) -> &'static str {
        match self {
            Self::Sun => "☉", Self::Moon => "☽", Self::Mercury => "☿",
            Self::Venus => "♀", Self::Mars => "♂", Self::Jupiter => "♃",
            Self::Saturn => "♄", Self::Uranus => "♅", Self::Neptune => "♆",
        }
    }
}

/// Geocentric ecliptic longitude/latitude in radians from the temporary provider.
fn position(body: Body, julian_day_tt: f64) -> (f64, f64) {
    let (longitude, latitude) = match body {
        Body::Sun => {
            let (point, _distance_au) = astro::sun::geocent_ecl_pos(julian_day_tt);
            (point.long, point.lat)
        }
        Body::Moon => {
            let (point, _distance_km) = astro::lunar::geocent_ecl_pos(julian_day_tt);
            (point.long, point.lat)
        }
        _ => {
            let planet = match body {
                Body::Mercury => astro::planet::Planet::Mercury,
                Body::Venus => astro::planet::Planet::Venus,
                Body::Mars => astro::planet::Planet::Mars,
                Body::Jupiter => astro::planet::Planet::Jupiter,
                Body::Saturn => astro::planet::Planet::Saturn,
                Body::Uranus => astro::planet::Planet::Uranus,
                Body::Neptune => astro::planet::Planet::Neptune,
                Body::Sun | Body::Moon => unreachable!(),
            };
            let (point, _distance_au) =
                astro::planet::geocent_apprnt_ecl_coords(&planet, julian_day_tt);
            (point.long, point.lat)
        }
    };
    (longitude.to_degrees().rem_euclid(360.0), latitude.to_degrees())
}

fn signed_longitude_delta(start: f64, end: f64) -> f64 {
    (end - start + 540.0).rem_euclid(360.0) - 180.0
}

#[tauri::command]
fn current_sky_chart() -> Result<SkyChart, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "System clock is before Unix epoch".to_string())?;
    let unix_seconds = now.as_secs_f64();
    // Unix epoch 1970-01-01T00:00:00 UTC = JD 2440587.5.
    let jd_utc = 2_440_587.5 + unix_seconds / 86_400.0;
    // The provider expects an ephemeris/dynamical day; keep conversion explicit.
    let jd_tt = jd_utc + TT_MINUS_UTC_SECONDS / 86_400.0;
    let bodies = [
        Body::Sun, Body::Moon, Body::Mercury, Body::Venus, Body::Mars,
        Body::Jupiter, Body::Saturn, Body::Uranus, Body::Neptune,
    ];

    let positions = bodies.iter().map(|body| {
        let (longitude, latitude) = position(*body, jd_tt);
        let (before, _) = position(*body, jd_tt - 0.5);
        let (after, _) = position(*body, jd_tt + 0.5);
        let daily_motion = signed_longitude_delta(before, after);
        let sign_index = (longitude / 30.0).floor() as u8;
        PlanetPosition {
            body: body.name(),
            symbol: body.symbol(),
            longitude_deg: longitude,
            latitude_deg: latitude,
            sign_index,
            sign_degree: longitude.rem_euclid(30.0),
            retrograde: daily_motion < 0.0,
        }
    }).collect();

    Ok(SkyChart {
        schema_version: 1,
        calculated_at_unix_ms: now.as_millis(),
        source: "astro 2.0.0 — MIT (temporary provider)",
        method: "VSOP87 planetary theory for planets; ELP-2000/82 lunar theory; geocentric ecliptic coordinates.",
        reference_frame: "Geocentric ecliptic output from the temporary provider; UTC converted to approximate TT.",
        limitations: vec![
            "Temporary provider, not the VirgoStars-Ephemeris engine.",
            "Astronomical results have not yet passed VirgoStars reference-vector validation.",
            "No Ascendant, houses, observer coordinates, or location permission.",
            "Approximate retrograde flag from a one-day longitude difference.",
            "TT conversion assumes TAI−UTC = 37 seconds; review if IERS announces a leap second.",
        ],
        positions,
    })
}

#[tauri::command]
fn runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        platform: if cfg!(target_os = "android") { "android" }
            else if cfg!(target_os = "ios") { "ios" }
            else { "desktop-preview" },
        mode: "prototype",
        schema_version: 1,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![runtime_info, current_sky_chart])
        .run(tauri::generate_context!())
        .expect("failed to start VirgoStars Mobile");
}

#[cfg(test)]
mod tests {
    use super::{current_sky_chart, position, signed_longitude_delta, Body};

    #[test]
    fn longitude_delta_wraps_at_zero_degrees() {
        assert!(signed_longitude_delta(359.0, 1.0) > 0.0);
        assert!(signed_longitude_delta(1.0, 359.0) < 0.0);
    }

    #[test]
    fn temporary_engine_returns_finite_positions_for_all_bodies() {
        let jd_tt = 2_461_000.5;
        for body in [Body::Sun, Body::Moon, Body::Mercury, Body::Venus, Body::Mars,
            Body::Jupiter, Body::Saturn, Body::Uranus, Body::Neptune] {
            let (longitude, latitude) = position(body, jd_tt);
            assert!(longitude.is_finite() && (0.0..360.0).contains(&longitude));
            assert!(latitude.is_finite());
        }
    }

    #[test]
    fn current_chart_contract_contains_nine_bodies_and_provenance() {
        let chart = current_sky_chart().expect("system clock should be available");
        assert_eq!(chart.schema_version, 1);
        assert_eq!(chart.positions.len(), 9);
        assert!(chart.calculated_at_unix_ms > 0);
        assert!(chart.source.contains("MIT"));
        assert!(chart.method.contains("VSOP87"));
    }
}
