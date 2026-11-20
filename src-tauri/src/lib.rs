//! Minimal Tauri bridge; Android archive data is encrypted locally.
use serde::Serialize;
mod chart_calculation;
#[cfg(feature = "android-login-experimental")]
#[allow(dead_code)]
mod android_login_attempt;
#[cfg(feature = "android-login-experimental")]
#[allow(dead_code)]
mod android_login_callback;
#[cfg(feature = "android-login-experimental")]
#[allow(dead_code)]
mod android_connected_session;
#[cfg(feature = "android-login-experimental")]
#[allow(dead_code)]
mod android_token_exchange;
#[cfg(feature = "android-login-experimental")]
#[allow(dead_code)]
mod android_chart_snapshot;
#[cfg(all(target_os = "android", feature = "android-snapshot-cache-experimental"))]
#[allow(dead_code)]
mod android_snapshot_cache;
#[cfg(all(target_os = "android", feature = "android-login-coordinator-experimental"))]
#[allow(dead_code)]
mod android_login_coordinator;
#[cfg(all(target_os = "android", feature = "android-login-coordinator-experimental"))]
#[allow(dead_code)]
mod android_system_browser;
#[cfg(all(target_os = "android", feature = "android-login-coordinator-experimental"))]
#[allow(dead_code)]
mod android_app_link;
#[cfg(all(target_os = "android", feature = "android-login-coordinator-experimental"))]
mod android_activity;
#[cfg(all(target_os = "android", feature = "android-account-ui-experimental"))]
mod android_account_ipc;
#[cfg(feature = "android-login-https-experimental")]
#[allow(dead_code)]
mod android_https_transport;
#[cfg(any(all(test, feature = "archive-experimental"), all(target_os = "android", feature = "archive-mobile")))]
mod archive_keys;
#[cfg(any(all(test, feature = "archive-experimental"), all(target_os = "android", feature = "archive-mobile")))]
mod archive_vault;
#[cfg(any(all(test, feature = "archive-experimental"), all(target_os = "android", feature = "archive-mobile")))]
mod chart_archive;
#[cfg(all(target_os = "android", feature = "archive-mobile"))]
mod android_archive;
#[cfg(any(all(test, feature = "archive-mobile"), all(target_os = "android", feature = "archive-mobile")))]
mod offline_places;
#[cfg(any(test, all(target_os = "android", feature = "archive-mobile")))]
mod startup_preference;
#[cfg(any(test, all(target_os = "android", feature = "archive-mobile")))]
mod device_preferences;
#[cfg(feature = "swiss-ephemeris")]
mod swiss_provider;
#[cfg(all(feature = "virgostars-ephemeris", not(feature = "swiss-ephemeris")))]
mod virgostars_provider;
#[cfg(all(feature = "virgostars-ephemeris", not(feature = "swiss-ephemeris")))]
mod ephemeris_import;

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
    let builder = tauri::Builder::default()
        .setup(|app| {
            #[cfg(all(feature = "virgostars-ephemeris", not(feature = "swiss-ephemeris")))]
            {
                use tauri::Manager;
                if let Ok(folder) = app.path().app_local_data_dir() {
                    virgostars_provider::configure(folder, app.path().resource_dir().ok());
                }
            }
            #[cfg(any(not(feature = "virgostars-ephemeris"), feature = "swiss-ephemeris"))]
            let _ = app;
            Ok(())
        });
    #[cfg(all(feature = "virgostars-ephemeris", not(feature = "swiss-ephemeris"), target_os = "android", feature = "archive-mobile", not(feature = "android-account-ui-experimental")))]
    let builder = builder.invoke_handler(tauri::generate_handler![runtime_info, chart_calculation::calculate_chart,
        ephemeris_import::ephemeris_status, ephemeris_import::ephemeris_import_begin,
        ephemeris_import::ephemeris_import_chunk, ephemeris_import::ephemeris_import_finish,
        ephemeris_import::ephemeris_import_cancel, android_archive::chart_archive, android_archive::startup_preference, android_archive::device_preferences, offline_places::android::search_offline_places]);
    #[cfg(all(feature = "virgostars-ephemeris", not(feature = "swiss-ephemeris"), target_os = "android", feature = "android-account-ui-experimental"))]
    let builder = builder.invoke_handler(tauri::generate_handler![runtime_info, chart_calculation::calculate_chart,
        ephemeris_import::ephemeris_status, ephemeris_import::ephemeris_import_begin,
        ephemeris_import::ephemeris_import_chunk, ephemeris_import::ephemeris_import_finish,
        ephemeris_import::ephemeris_import_cancel, android_archive::chart_archive, android_archive::startup_preference,
        android_archive::device_preferences, offline_places::android::search_offline_places, android_account_ipc::account_control]);
    #[cfg(all(feature = "virgostars-ephemeris", not(feature = "swiss-ephemeris"), not(all(target_os = "android", feature = "archive-mobile"))))]
    let builder = builder.invoke_handler(tauri::generate_handler![runtime_info, chart_calculation::calculate_chart,
        ephemeris_import::ephemeris_status, ephemeris_import::ephemeris_import_begin,
        ephemeris_import::ephemeris_import_chunk, ephemeris_import::ephemeris_import_finish,
        ephemeris_import::ephemeris_import_cancel]);
    #[cfg(all(any(not(feature = "virgostars-ephemeris"), feature = "swiss-ephemeris"), target_os = "android", feature = "archive-mobile", not(feature = "android-account-ui-experimental")))]
    let builder = builder.invoke_handler(tauri::generate_handler![runtime_info, chart_calculation::calculate_chart, android_archive::chart_archive, android_archive::startup_preference, android_archive::device_preferences, offline_places::android::search_offline_places]);
    #[cfg(all(any(not(feature = "virgostars-ephemeris"), feature = "swiss-ephemeris"), target_os = "android", feature = "android-account-ui-experimental"))]
    let builder = builder.invoke_handler(tauri::generate_handler![runtime_info, chart_calculation::calculate_chart, android_archive::chart_archive,
        android_archive::startup_preference, android_archive::device_preferences, offline_places::android::search_offline_places, android_account_ipc::account_control]);
    #[cfg(all(any(not(feature = "virgostars-ephemeris"), feature = "swiss-ephemeris"), not(all(target_os = "android", feature = "archive-mobile"))))]
    let builder = builder.invoke_handler(tauri::generate_handler![runtime_info, chart_calculation::calculate_chart]);
    builder
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
