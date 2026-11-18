//! Explicit experimental DE441 apparent planetary positions, not a natal chart.
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    protocol_version: u8,
    utc_iso: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Position {
    id: &'static str,
    longitude_deg: f64,
    latitude_deg: f64,
    distance_au: f64,
    longitude_speed_deg_day: f64,
    latitude_speed_deg_day: f64,
    distance_speed_au_day: f64,
    right_ascension_deg: f64,
    declination_deg: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    protocol_version: u8,
    status: &'static str,
    pack_id: Option<String>,
    jd_tdb: Option<f64>,
    positions: Vec<Position>,
}

impl Response {
    fn error(status: &'static str, pack_id: Option<String>) -> Self {
        Self {
            protocol_version: 1,
            status,
            pack_id,
            jd_tdb: None,
            positions: Vec::new(),
        }
    }
}

#[tauri::command]
pub async fn de441_apparent_positions(app: AppHandle, request: Request) -> Response {
    if request.protocol_version != 1
        || request.utc_iso.len() > 32
        || !request.utc_iso.ends_with('Z')
    {
        return Response::error("invalid_request", None);
    }
    #[cfg(feature = "de441-engine")]
    {
        let directory = match crate::de441_packs::pack_dir(&app) {
            Ok(path) => path,
            Err(_) => return Response::error("storage_unavailable", None),
        };
        match tauri::async_runtime::spawn_blocking(move || calculate(&directory, &request.utc_iso))
            .await
        {
            Ok(response) => response,
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
fn calculate(directory: &std::path::Path, utc: &str) -> Response {
    use std::collections::HashSet;
    use virgostars_ephemeris_core::apparent_ecliptic_of_date::{
        apparent_to_degrees_au, experimental_long_term_apparent_with_provider,
        geocentric_apparent_ecliptic_of_date_with_options, ApparentFrame, ApparentOptions,
        ExperimentalLongTermStateProvider, ExperimentalProviderApparentError,
    };
    use virgostars_ephemeris_core::de441::{
        Body, De441, JulianDateTdb, StateVector, StateVectorWithAcceleration,
    };
    use virgostars_ephemeris_core::de441_pack_manager::{De441PackError, De441PackManager};
    use virgostars_ephemeris_core::first_sky::{CivilTimestamp, SkyError};

    #[derive(Debug)]
    enum Failure {
        Pack(De441PackError),
        Missing(String),
        Invalid(String),
    }
    struct Verified<'a> {
        directory: &'a std::path::Path,
        manager: De441PackManager,
        verified: HashSet<String>,
    }
    impl Verified<'_> {
        fn verify(&mut self, epoch: JulianDateTdb) -> Result<(), Failure> {
            let id = self
                .manager
                .select_pack(epoch)
                .map_err(Failure::Pack)?
                .id
                .clone();
            if !self.verified.contains(&id) {
                match crate::de441_packs::verify_pack_in_directory(self.directory, &id) {
                    Ok("verified") => {
                        self.verified.insert(id);
                    }
                    Ok("missing") => return Err(Failure::Missing(id)),
                    _ => return Err(Failure::Invalid(id)),
                }
            }
            Ok(())
        }
    }
    impl ExperimentalLongTermStateProvider for Verified<'_> {
        type Error = Failure;
        fn state(&mut self, body: Body, epoch: JulianDateTdb) -> Result<StateVector, Failure> {
            self.verify(epoch)?;
            self.manager
                .state(body, Body::SolarSystemBarycenter, epoch)
                .map_err(Failure::Pack)
        }
        fn state_with_acceleration(
            &mut self,
            body: Body,
            epoch: JulianDateTdb,
        ) -> Result<StateVectorWithAcceleration, Failure> {
            self.verify(epoch)?;
            self.manager
                .state_with_acceleration(body, Body::SolarSystemBarycenter, epoch)
                .map_err(Failure::Pack)
        }
        fn logical_coverage(
            &mut self,
            epoch: JulianDateTdb,
        ) -> Result<(JulianDateTdb, JulianDateTdb), Failure> {
            self.verify(epoch)?;
            let pack = self.manager.select_pack(epoch).map_err(Failure::Pack)?;
            Ok((pack.start_tdb, pack.end_tdb))
        }
    }
    let civil = match CivilTimestamp::parse(utc) {
        Ok(value) => value,
        Err(_) => return Response::error("invalid_request", None),
    };
    let epoch = match civil.to_approximate_tdb_julian_date() {
        Ok(value) => value,
        Err(SkyError::UnsupportedUtc) => return Response::error("unsupported_utc", None),
        Err(_) => return Response::error("invalid_request", None),
    };
    let manager = match De441PackManager::from_mobile_directory(directory) {
        Ok(manager) => manager,
        Err(_) => return Response::error("calculation_failed", None),
    };
    let mut provider = Verified {
        directory,
        manager,
        verified: HashSet::new(),
    };
    if let Err(error) = provider.verify(epoch) {
        return match error {
            Failure::Missing(id) => Response::error("missing_pack", Some(id)),
            Failure::Invalid(id) => Response::error("invalid_pack", Some(id)),
            _ => Response::error("outside_coverage", None),
        };
    }
    let selected = match provider.manager.select_pack(epoch) {
        Ok(pack) => pack,
        Err(_) => return Response::error("outside_coverage", None),
    };
    if selected.id != "core"
        || epoch.0 <= selected.start_tdb.0 + 1.0
        || epoch.0 >= selected.end_tdb.0 - 1.0
    {
        return Response::error("outside_coverage", None);
    }
    let mut equatorial_reader = match De441::open(&selected.file_path) {
        Ok(reader) => reader,
        Err(_) => return Response::error("invalid_pack", Some(selected.id.clone())),
    };
    let equatorial_options = ApparentOptions {
        frame: ApparentFrame::TrueEquatorOfDate,
        ..ApparentOptions::default()
    };
    let bodies = [
        ("Sun", Body::Sun),
        ("Moon", Body::Moon),
        ("Mercury", Body::Mercury),
        ("Venus", Body::Venus),
        ("Mars barycenter", Body::MarsBarycenter),
        ("Jupiter barycenter", Body::JupiterBarycenter),
        ("Saturn barycenter", Body::SaturnBarycenter),
        ("Uranus barycenter", Body::UranusBarycenter),
        ("Neptune barycenter", Body::NeptuneBarycenter),
        ("Pluto barycenter", Body::PlutoBarycenter),
    ];
    let mut positions = Vec::new();
    for (id, body) in bodies {
        let value = match experimental_long_term_apparent_with_provider(&mut provider, body, epoch)
        {
            Ok(value) => value,
            Err(ExperimentalProviderApparentError::Provider(Failure::Missing(id))) => {
                return Response::error("missing_pack", Some(id))
            }
            Err(ExperimentalProviderApparentError::Provider(Failure::Invalid(id))) => {
                return Response::error("invalid_pack", Some(id))
            }
            Err(ExperimentalProviderApparentError::Provider(Failure::Pack(
                De441PackError::MissingPack { id, .. },
            ))) => return Response::error("missing_pack", Some(id)),
            Err(ExperimentalProviderApparentError::Provider(Failure::Pack(
                De441PackError::NoPackForEpoch(_),
            ))) => return Response::error("outside_coverage", None),
            Err(ExperimentalProviderApparentError::UnsafeRefinementBoundary) => {
                return Response::error("refinement_boundary", None)
            }
            Err(_) => return Response::error("calculation_failed", None),
        };
        let equatorial = match geocentric_apparent_ecliptic_of_date_with_options(
            &mut equatorial_reader,
            body,
            epoch,
            equatorial_options,
        )
        .and_then(|v| apparent_to_degrees_au(&v))
        {
            Ok(v) => v.fields,
            Err(_) => return Response::error("calculation_failed", None),
        };
        positions.push(Position {
            id,
            longitude_deg: value.longitude_deg,
            latitude_deg: value.latitude_deg,
            distance_au: value.distance_au,
            longitude_speed_deg_day: value.longitude_speed_deg_per_tdb_day,
            latitude_speed_deg_day: value.latitude_speed_deg_per_tdb_day,
            distance_speed_au_day: value.distance_speed_au_per_tdb_day,
            right_ascension_deg: equatorial.longitude_deg,
            declination_deg: equatorial.latitude_deg,
        });
    }
    Response {
        protocol_version: 1,
        status: "ok",
        pack_id: None,
        jd_tdb: Some(epoch.0),
        positions,
    }
}

#[cfg(all(test, feature = "de441-engine"))]
mod tests {
    use super::calculate;
    #[test]
    fn missing_pack_and_unsupported_time_fail_without_positions() {
        let dir = std::env::temp_dir().join(format!("de441-unavailable-{}", std::process::id()));
        let missing = calculate(&dir, "2000-01-01T12:00:00Z");
        assert_eq!(missing.status, "missing_pack");
        assert_eq!(missing.pack_id.as_deref(), Some("core"));
        assert!(missing.positions.is_empty());
        assert_eq!(
            calculate(&dir, "1960-01-01T12:00:00Z").status,
            "unsupported_utc"
        );
    }
    #[test]
    fn corrupt_file_is_rejected_before_calculation() {
        let dir =
            std::env::temp_dir().join(format!("de441-positions-corrupt-{}", std::process::id()));
        std::fs::create_dir(&dir).unwrap();
        let path = dir.join("de441-core.eph");
        std::fs::write(&path, b"not an ephemeris").unwrap();
        let response = calculate(&dir, "2000-01-01T12:00:00Z");
        assert_eq!(response.status, "invalid_pack");
        assert_eq!(response.pack_id.as_deref(), Some("core"));
        assert!(response.positions.is_empty());
        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }
    #[test]
    #[ignore = "requires DE441_PACKS_DIR"]
    fn real_core_returns_apparent_positions() {
        let dir = std::path::PathBuf::from(std::env::var_os("DE441_PACKS_DIR").unwrap());
        let result = calculate(&dir, "2000-01-01T12:00:00Z");
        assert_eq!(result.status, "ok");
        assert_eq!(result.positions.len(), 10);
        assert!(result
            .positions
            .iter()
            .all(|p| (0.0..360.0).contains(&p.longitude_deg) && p.distance_au > 0.0));
        assert!((result.positions[0].longitude_deg - 280.37).abs() < 0.03);
        assert!((result.positions[0].declination_deg + 23.03243).abs() < 0.0001);
        assert!(result
            .positions
            .iter()
            .all(|p| (0.0..360.0).contains(&p.right_ascension_deg)
                && (-90.0..=90.0).contains(&p.declination_deg)));
        for date in ["1972-01-01T00:00:00Z", "2027-06-27T23:59:59Z"] {
            let response = calculate(&dir, date);
            assert_eq!(response.status, "ok", "{date}");
            assert_eq!(response.positions.len(), 10);
        }
    }
}
