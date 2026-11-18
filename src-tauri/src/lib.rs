//! Minimal read-only Tauri runtime bridge. No accounts, birth data or network operations.
use serde::Serialize;
mod chart_calculation;
mod de441_packs;
mod de441_probe;
mod de441_positions;
#[cfg(feature = "swiss-ephemeris")]
mod swiss_provider;

#[derive(Serialize)]
struct RuntimeInfo {
    platform: &'static str,
    mode: &'static str,
    schema_version: u8,
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(de441_packs::UploadState::default())
        .invoke_handler(tauri::generate_handler![
            runtime_info,
            chart_calculation::calculate_chart,
            de441_packs::ephemeris_pack_inventory,
            de441_packs::ephemeris_pack_verify,
            de441_packs::ephemeris_pack_begin,
            de441_packs::ephemeris_pack_write,
            de441_packs::ephemeris_pack_finish,
            de441_packs::ephemeris_pack_cancel,
            de441_packs::ephemeris_pack_remove,
            de441_probe::de441_probe,
            de441_probe::de441_probe_civil,
            de441_positions::de441_apparent_positions,
        ])
        .run(tauri::generate_context!())
        .expect("failed to start VirgoStars Mobile");
}

#[cfg(test)]
mod tests {
    #[test]
    fn runtime_contract_is_non_privileged() {
        let info = super::runtime_info();
        assert_eq!(info.mode, "prototype");
        assert_eq!(info.schema_version, 1);
    }
}
