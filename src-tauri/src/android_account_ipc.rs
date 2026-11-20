//! Opt-in Android account IPC. Only typed operations and bounded chart
//! summaries cross this boundary; credentials and callback URLs stay native.
use crate::android_archive::{no_backup_folder, AndroidKeyStore};
use crate::android_chart_snapshot::ChartSummary;
use crate::android_https_transport::AndroidHttpsTransport;
use crate::android_login_coordinator::{CoordinatorError, LoginCoordinator, LoginStatus};
use crate::android_snapshot_cache::SnapshotCache;
use crate::android_system_browser::AndroidSystemBrowser;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use std::time::Instant;

const CONSENT: &str = "https://virgostars.it/collega-dispositivo";
const CALLBACK: &str = "https://virgostars.it/android/oauth/callback";
static ACCOUNT: OnceLock<LoginCoordinator> = OnceLock::new();

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccountOperation {
    Status,
    Begin,
    Sync,
    Close,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountReply {
    version: u8,
    status: &'static str,
    charts: Option<Vec<ChartSummary>>,
}
fn reply(status: &'static str, charts: Option<Vec<ChartSummary>>) -> AccountReply {
    AccountReply {
        version: 1,
        status,
        charts,
    }
}
fn safe_error(error: CoordinatorError) -> &'static str {
    match error {
        CoordinatorError::Busy => "busy",
        CoordinatorError::Denied => "denied",
        CoordinatorError::Authorization => "authorization",
        CoordinatorError::Network => "network",
        CoordinatorError::Cache => "cache",
        CoordinatorError::InvalidCallback => "invalid_callback",
        CoordinatorError::Unavailable => "unavailable",
    }
}
fn execute(operation: AccountOperation) -> AccountReply {
    let coordinator = ACCOUNT.get_or_init(|| LoginCoordinator::new(CONSENT, CALLBACK));
    let result: Result<AccountReply, CoordinatorError> = (|| match operation {
        AccountOperation::Status => {
            let mut current = coordinator.status(Instant::now())?;
            if current == LoginStatus::Pending {
                crate::android_app_link::process(
                    coordinator,
                    &AndroidHttpsTransport,
                    Instant::now,
                )?;
                current = coordinator.status(Instant::now())?;
            }
            Ok(reply(
                match current {
                    LoginStatus::Idle => "idle",
                    LoginStatus::Pending => "pending",
                    LoginStatus::Connected => "connected",
                },
                None,
            ))
        }
        AccountOperation::Begin => {
            crate::android_app_link::discard_stale()?;
            coordinator.begin(&AndroidSystemBrowser, Instant::now())?;
            Ok(reply("pending", None))
        }
        AccountOperation::Sync => {
            let folder = no_backup_folder().map_err(|_| CoordinatorError::Cache)?;
            let keys = AndroidKeyStore::new(&folder.join("account-cache-key-v1"));
            let cache = SnapshotCache::in_native_directory(&folder.join("account-snapshots-v1"));
            let charts =
                coordinator.synchronize(&AndroidHttpsTransport, &cache, &keys, Instant::now)?;
            Ok(reply("synced", Some(charts)))
        }
        AccountOperation::Close => {
            coordinator.clear_local_session()?;
            Ok(reply("idle", None))
        }
    })();
    result.unwrap_or_else(|error| reply(safe_error(error), None))
}

#[tauri::command]
pub async fn account_control(operation: AccountOperation) -> AccountReply {
    tauri::async_runtime::spawn_blocking(move || execute(operation))
        .await
        .unwrap_or_else(|_| reply("unavailable", None))
}
