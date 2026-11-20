#![allow(dead_code, unexpected_cfgs)]
// Compile the exact mobile sources. The local proc-macro stub only passes through
// #[tauri::command]; no Tauri runtime, native key store or IPC is present.
#[path = "../../../src-tauri/src/chart_calculation.rs"]
mod chart_calculation;
#[path = "../../../src-tauri/src/archive_keys.rs"]
mod archive_keys;
#[path = "../../../src-tauri/src/archive_vault.rs"]
mod archive_vault;
#[path = "../../../src-tauri/src/chart_archive.rs"]
mod chart_archive;
#[path = "../../../src-tauri/src/android_login_callback.rs"]
mod android_login_callback;
#[path = "../../../src-tauri/src/android_login_attempt.rs"]
mod android_login_attempt;
#[path = "../../../src-tauri/src/android_token_exchange.rs"]
mod android_token_exchange;
#[path = "../../../src-tauri/src/android_connected_session.rs"]
mod android_connected_session;
#[path = "../../../src-tauri/src/android_https_transport.rs"]
mod android_https_transport;
#[path = "../../../src-tauri/src/android_chart_snapshot.rs"]
mod android_chart_snapshot;
#[path = "../../../src-tauri/src/android_snapshot_cache.rs"]
mod android_snapshot_cache;
