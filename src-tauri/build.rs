fn main() {
    if std::env::var_os("CARGO_FEATURE_ANDROID_ACCOUNT_UI_EXPERIMENTAL").is_some()
        && std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android")
    {
        const COMMANDS: &[&str] = &[
            "runtime_info",
            "calculate_chart",
            "ephemeris_status",
            "ephemeris_import_begin",
            "ephemeris_import_chunk",
            "ephemeris_import_finish",
            "ephemeris_import_cancel",
            "chart_archive",
            "startup_preference",
            "device_preferences",
            "search_offline_places",
            "account_control",
        ];
        tauri_build::try_build(
            tauri_build::Attributes::new()
                .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
        )
        .expect("failed to build Android account permissions");
    } else {
        tauri_build::build()
    }
}
