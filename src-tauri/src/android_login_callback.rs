//! Isolated callback validation; not registered as IPC or wired into the app.
//! The trusted host must separately verify Android App Links and own the PKCE
//! verifier, browser launch, token exchange and secure session lifecycle.
use std::time::{Duration, Instant};
use subtle::ConstantTimeEq;
use url::Url;
use zeroize::{Zeroize, Zeroizing};

const MAX_CALLBACK_BYTES: usize = 2048;
const MAX_ATTEMPT: Duration = Duration::from_secs(300);

fn opaque_value(value: &str) -> bool {
    value.len() == 43
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}

/// No callback URL, state or authorization code is serialized or logged.
pub(crate) struct PendingAndroidCallback {
    redirect: Url,
    state: Zeroizing<String>,
    deadline: Instant,
    consumed: bool,
}

/// Native-only result: authorization codes must never be serialized or logged.
pub(crate) enum CallbackDecision {
    Approved(Zeroizing<String>),
    Denied,
}

impl PendingAndroidCallback {
    /// Both arguments come only from the native login coordinator. The redirect
    /// must be the exact HTTPS App Link configured on the authorization server.
    pub(crate) fn new(redirect: &str, state: String, now: Instant) -> Result<Self, ()> {
        let state = Zeroizing::new(state);
        let parsed = Url::parse(redirect).map_err(|_| ())?;
        if redirect.len() > 512
            || parsed.as_str() != redirect
            || parsed.scheme() != "https"
            || parsed.host_str().is_none()
            || !parsed.username().is_empty()
            || parsed.password().is_some()
            || parsed.query().is_some()
            || parsed.fragment().is_some()
            || !opaque_value(&state)
        {
            return Err(());
        }
        let deadline = now.checked_add(MAX_ATTEMPT).ok_or(())?;
        Ok(Self {
            redirect: parsed,
            state,
            deadline,
            consumed: false,
        })
    }

    pub(crate) fn cancel(&mut self) {
        self.consumed = true;
        self.state.zeroize();
    }

    /// A valid callback may succeed once. All errors are deliberately opaque.
    pub(crate) fn accept(&mut self, callback: &str, now: Instant) -> Result<CallbackDecision, ()> {
        if self.consumed {
            return Err(());
        }
        if now >= self.deadline {
            self.cancel();
            return Err(());
        }
        if callback.len() > MAX_CALLBACK_BYTES
            || !callback
                .strip_prefix(self.redirect.as_str())
                .is_some_and(|rest| rest.starts_with('?'))
        {
            return Err(());
        }
        let parsed = Url::parse(callback).map_err(|_| ())?;
        if parsed.as_str() != callback
            || parsed.scheme() != self.redirect.scheme()
            || parsed.host_str() != self.redirect.host_str()
            || parsed.port_or_known_default() != self.redirect.port_or_known_default()
            || parsed.path() != self.redirect.path()
            || !parsed.username().is_empty()
            || parsed.password().is_some()
            || parsed.fragment().is_some()
        {
            return Err(());
        }
        let mut code = None;
        let mut state = None;
        let mut denial = false;
        for (key, value) in parsed.query_pairs() {
            match key.as_ref() {
                "code" if code.is_none() => code = Some(Zeroizing::new(value.into_owned())),
                "state" if state.is_none() => state = Some(Zeroizing::new(value.into_owned())),
                "error" if !denial && value == "access_denied" => denial = true,
                _ => return Err(()),
            }
        }
        let state = state.ok_or(())?;
        if !opaque_value(&state) || !bool::from(state.as_bytes().ct_eq(self.state.as_bytes())) {
            return Err(());
        }
        let query = parsed.query().ok_or(())?;
        let decision = match (code, denial) {
            (Some(code), false) if opaque_value(&code) => {
                let a = Zeroizing::new(format!("code={}&state={}", code.as_str(), state.as_str()));
                let b = Zeroizing::new(format!("state={}&code={}", state.as_str(), code.as_str()));
                if query != a.as_str() && query != b.as_str() {
                    return Err(());
                }
                CallbackDecision::Approved(code)
            }
            (None, true) => {
                let a = Zeroizing::new(format!("error=access_denied&state={}", state.as_str()));
                let b = Zeroizing::new(format!("state={}&error=access_denied", state.as_str()));
                if query != a.as_str() && query != b.as_str() {
                    return Err(());
                }
                CallbackDecision::Denied
            }
            _ => return Err(()),
        };
        self.cancel();
        Ok(decision)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const REDIRECT: &str = "https://example.test/virgostars/oauth/callback";
    fn value(c: char) -> String {
        std::iter::repeat_n(c, 43).collect()
    }
    fn callback(code: &str, state: &str) -> String {
        format!("{REDIRECT}?code={code}&state={state}")
    }

    #[test]
    fn accepts_only_the_matching_attempt_once() {
        let now = Instant::now();
        let mut pending = PendingAndroidCallback::new(REDIRECT, value('s'), now).unwrap();
        assert!(pending
            .accept(&callback(&value('c'), &value('x')), now)
            .is_err());
        let Ok(CallbackDecision::Approved(code)) =
            pending.accept(&callback(&value('c'), &value('s')), now)
        else {
            panic!("expected approval");
        };
        assert_eq!(code.as_str(), value('c'));
        assert!(pending
            .accept(&callback(&value('c'), &value('s')), now)
            .is_err());
    }

    #[test]
    fn denial_and_cancellation_consume_only_the_matching_attempt() {
        let now = Instant::now();
        let mut pending = PendingAndroidCallback::new(REDIRECT, value('s'), now).unwrap();
        let denied = format!("{REDIRECT}?error=access_denied&state={}", value('s'));
        assert!(pending
            .accept(&format!("{denied}&code={}", value('c')), now)
            .is_err());
        assert!(matches!(
            pending.accept(&denied, now),
            Ok(CallbackDecision::Denied)
        ));
        assert!(pending.accept(&denied, now).is_err());
        let mut cancelled = PendingAndroidCallback::new(REDIRECT, value('s'), now).unwrap();
        cancelled.cancel();
        assert!(cancelled
            .accept(&callback(&value('c'), &value('s')), now)
            .is_err());
    }

    #[test]
    fn rejects_inexact_targets_duplicate_fields_and_expired_attempts() {
        let now = Instant::now();
        let mut pending = PendingAndroidCallback::new(REDIRECT, value('s'), now).unwrap();
        let good = callback(&value('c'), &value('s'));
        for bad in [
            good.replace("example.test", "evil.test"),
            good.replace("https:", "http:"),
            good.replace("example.test", "user@example.test"),
            good.replace("/callback?", "/other?"),
            good.replace("/callback?", "/x/../callback?"),
            format!("{good}&state={}", value('s')),
            good.replacen("state=s", "state=%73", 1),
            good.replacen("code=c", "code=%63", 1),
            format!("{good}&extra=x"),
            format!("{good}#fragment"),
            callback("short", &value('s')),
            format!("{good}&{}", "x".repeat(MAX_CALLBACK_BYTES)),
        ] {
            assert!(pending.accept(&bad, now).is_err());
        }
        assert!(pending.accept(&good, now + MAX_ATTEMPT).is_err());
    }

    #[test]
    fn requires_an_exact_clean_https_redirect_and_bounded_state() {
        let now = Instant::now();
        for redirect in [
            "http://example.test/cb",
            "https://user@example.test/cb",
            "https://example.test/cb?x=1",
            "https://example.test/cb#x",
            "https://EXAMPLE.test/cb",
        ] {
            assert!(PendingAndroidCallback::new(redirect, value('s'), now).is_err());
        }
        assert!(PendingAndroidCallback::new(REDIRECT, "short".into(), now).is_err());
    }
}
