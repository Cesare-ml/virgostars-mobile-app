//! Native-only bridge to the Activity's one-use App Link queue. It never
//! exposes an authorization URL or code to the WebView. The generated Android
//! Activity must be prepared separately with prepare-android-app-link.mjs.
use crate::android_connected_session::SessionTransport;
use crate::android_login_coordinator::{CoordinatorError, LoginCoordinator};
use crate::android_token_exchange::TokenTransport;
use jni::objects::JString;
use std::time::Instant;
use zeroize::Zeroizing;

/// Call from a native worker after the Activity has resumed. A callback is
/// consumed at most once and validated again by the PKCE coordinator. Android
/// domain verification, backend allowlisting and device QA remain mandatory.
pub(crate) fn process<T: TokenTransport + SessionTransport>(
    coordinator: &LoginCoordinator,
    transport: &T,
    now: impl Fn() -> Instant,
) -> Result<bool, CoordinatorError> {
    let callback = take()?;
    let Some(callback) = callback else {
        return Ok(false);
    };
    coordinator.accept(&callback, transport, now)?;
    Ok(true)
}

/// Ensure the prepared Activity is installed and discard any old callback
/// before creating a fresh PKCE attempt.
pub(crate) fn discard_stale() -> Result<(), CoordinatorError> {
    drop(take()?);
    Ok(())
}

fn take() -> Result<Option<Zeroizing<String>>, CoordinatorError> {
    crate::android_activity::with_activity(|env, activity| {
        let value = env
            .call_method(&activity, "takeVirgoCallback", "()Ljava/lang/String;", &[])?
            .l()?;
        if value.is_null() {
            return Ok(None);
        }
        let java = JString::from(value);
        let rust: String = env.get_string(&java)?.into();
        Ok(Some(Zeroizing::new(rust)))
    })
    .map_err(|_| CoordinatorError::Unavailable)
}
