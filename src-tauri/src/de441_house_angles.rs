//! Experimental house-angle source; house geometry remains in astrological-functions.
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    protocol_version: u8,
    utc_iso: String,
    lat_micro: i32,
    lng_micro: i32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Angles {
    ut1_julian_day: f64,
    tt_julian_day: f64,
    latitude_deg: f64,
    longitude_deg_east: f64,
    armc_deg: f64,
    ascendant_deg: f64,
    midheaven_deg: f64,
    true_obliquity_deg: f64,
    vertex_deg: f64,
    sun_declination_deg: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    protocol_version: u8,
    status: &'static str,
    angles: Option<Angles>,
    pack_id: Option<String>,
}
impl Response {
    fn error(status: &'static str, pack_id: Option<String>) -> Self {
        Self {
            protocol_version: 1,
            status,
            angles: None,
            pack_id,
        }
    }
}

#[tauri::command]
pub async fn de441_house_angles(app: AppHandle, request: Request) -> Response {
    if request.protocol_version != 1
        || request.utc_iso.len() > 32
        || !request.utc_iso.ends_with('Z')
        || request.lat_micro.unsigned_abs() >= 90_000_000
        || request.lng_micro.unsigned_abs() > 180_000_000
    {
        return Response::error("invalid_request", None);
    }
    #[cfg(feature = "de441-engine")]
    {
        let dir = match crate::de441_packs::pack_dir(&app) {
            Ok(dir) => dir,
            Err(_) => return Response::error("storage_unavailable", None),
        };
        match tauri::async_runtime::spawn_blocking(move || {
            calculate(&dir, &request.utc_iso, request.lat_micro, request.lng_micro)
        })
        .await
        {
            Ok(value) => value,
            Err(_) => Response::error("calculation_failed", None),
        }
    }
    #[cfg(not(feature = "de441-engine"))]
    {
        let _ = app;
        Response::error("provider_unavailable", None)
    }
}

#[cfg(feature = "de441-engine")]
fn calculate(dir: &std::path::Path, utc: &str, lat: i32, lng: i32) -> Response {
    use virgostars_ephemeris_core::apparent_ecliptic_of_date::{
        apparent_to_degrees_au, geocentric_apparent_ecliptic_of_date_with_options, tdb_to_tt_jd,
        ApparentFrame, ApparentOptions,
    };
    use virgostars_ephemeris_core::calendar::{Calendar, CalendarDateTime, TimeScale};
    use virgostars_ephemeris_core::de441::{Body, De441};
    use virgostars_ephemeris_core::de441_pack_manager::De441PackManager;
    use virgostars_ephemeris_core::first_sky::{CivilTimestamp, SkyError};
    use virgostars_ephemeris_core::house_angles::house_angles;

    let civil = match CivilTimestamp::parse(utc) {
        Ok(v) => v,
        Err(_) => return Response::error("invalid_request", None),
    };
    if civil.utc_offset_minutes != 0 {
        return Response::error("invalid_request", None);
    }
    let epoch = match civil.to_approximate_tdb_julian_date() {
        Ok(v) => v,
        Err(SkyError::UnsupportedUtc) => return Response::error("unsupported_utc", None),
        Err(_) => return Response::error("invalid_request", None),
    };
    // Explicit approximation UT1=UTC; no measured Earth-orientation parameters.
    let ut1 = CalendarDateTime {
        year: civil.year,
        month: civil.month,
        day: civil.day,
        hour: civil.hour,
        minute: civil.minute,
        second: civil.second,
        scale: TimeScale::Ut1,
    };
    let ut1 = match ut1
        .to_julian_date(Calendar::ProlepticGregorian)
        .and_then(|x| x.parts())
    {
        Ok((a, b)) => a + b,
        Err(_) => return Response::error("invalid_request", None),
    };
    let tt = match tdb_to_tt_jd(epoch.0) {
        Ok(v) => v,
        Err(_) => return Response::error("calculation_failed", None),
    };
    let angles = match house_angles(ut1, tt, f64::from(lat) / 1e6, f64::from(lng) / 1e6) {
        Ok(v) => v,
        Err(_) => return Response::error("invalid_site", None),
    };
    // The current UTC conversion window lies decades inside the core pack.
    // A >1-day margin ensures Sun light-time cannot cross its logical edge.
    let manager = match De441PackManager::from_mobile_directory(dir) {
        Ok(v) => v,
        Err(_) => return Response::error("calculation_failed", None),
    };
    let pack = match manager.select_pack(epoch) {
        Ok(v) => v,
        Err(_) => return Response::error("outside_coverage", None),
    };
    if pack.id != "core" || epoch.0 <= pack.start_tdb.0 + 1.0 || epoch.0 >= pack.end_tdb.0 - 1.0 {
        return Response::error("outside_coverage", None);
    }
    match crate::de441_packs::verify_pack_in_directory(dir, &pack.id) {
        Ok("verified") => {}
        Ok("missing") => return Response::error("missing_pack", Some(pack.id.clone())),
        _ => return Response::error("invalid_pack", Some(pack.id.clone())),
    }
    let mut eph = match De441::open(&pack.file_path) {
        Ok(v) => v,
        Err(_) => return Response::error("invalid_pack", Some(pack.id.clone())),
    };
    let options = ApparentOptions {
        frame: ApparentFrame::TrueEquatorOfDate,
        ..ApparentOptions::default()
    };
    let sun = match geocentric_apparent_ecliptic_of_date_with_options(
        &mut eph,
        Body::Sun,
        epoch,
        options,
    )
    .and_then(|v| apparent_to_degrees_au(&v))
    {
        Ok(v) => v.fields.latitude_deg,
        Err(_) => return Response::error("calculation_failed", None),
    };
    Response {
        protocol_version: 1,
        status: "ok",
        pack_id: None,
        angles: Some(Angles {
            ut1_julian_day: ut1,
            tt_julian_day: tt,
            latitude_deg: angles.latitude_deg,
            longitude_deg_east: angles.longitude_deg_east,
            armc_deg: angles.armc_deg,
            ascendant_deg: angles.ascendant_deg,
            midheaven_deg: angles.midheaven_deg,
            true_obliquity_deg: angles.true_obliquity_deg,
            vertex_deg: angles.extra.vertex_deg,
            sun_declination_deg: sun,
        }),
    }
}

#[cfg(all(test, feature = "de441-engine"))]
mod tests {
    use super::calculate;
    #[test]
    fn missing_and_unsupported_dates_fail_closed() {
        let dir = std::env::temp_dir().join(format!("de441-houses-missing-{}", std::process::id()));
        assert_eq!(
            calculate(&dir, "2000-01-01T12:00:00Z", 44_000_000, 11_000_000).status,
            "missing_pack"
        );
        assert_eq!(
            calculate(&dir, "1960-01-01T12:00:00Z", 44_000_000, 11_000_000).status,
            "unsupported_utc"
        );
    }
    #[test]
    #[ignore = "requires DE441_PACKS_DIR"]
    fn real_core_produces_house_angles_and_sun_declination() {
        let dir = std::path::PathBuf::from(std::env::var_os("DE441_PACKS_DIR").unwrap());
        let result = calculate(&dir, "2000-01-01T12:00:00Z", 44_697_805, 11_805_778);
        assert_eq!(result.status, "ok");
        let a = result.angles.unwrap();
        assert!((0.0..360.0).contains(&a.ascendant_deg));
        assert!((-24.0..-22.0).contains(&a.sun_declination_deg));
        println!(
            "synthetic-site-j2000 {}",
            serde_json::to_string(&a).unwrap()
        );
        let polar = calculate(&dir, "2000-01-01T12:00:00Z", 89_999_000, 11_805_778);
        assert_eq!(polar.status, "ok");
        println!(
            "synthetic-polar-j2000 {}",
            serde_json::to_string(&polar.angles.unwrap()).unwrap()
        );
    }
}
