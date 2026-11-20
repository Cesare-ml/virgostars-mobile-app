//! Native-only bridge to the Activity's one-use App Link queue. It never
//! exposes an authorization URL or code to the WebView. The generated Android
//! Activity must be prepared separately with prepare-android-app-link.mjs.
use crate::android_connected_session::SessionTransport;
use crate::android_login_coordinator::{CoordinatorError, LoginCoordinator};
use crate::android_token_exchange::TokenTransport;
use jni::objects::{JObject, JString};
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
    let callback = crate::android_archive::with_jni(|env| {
        // Android owns this Activity global reference for its lifetime.
        let activity =
            unsafe { JObject::from_raw(ndk_context::android_context().context().cast()) };
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
    .map_err(|_| CoordinatorError::Unavailable)?;
    let Some(callback) = callback else {
        return Ok(false);
    };
    coordinator.accept(&callback, transport, now)?;
    Ok(true)
}
