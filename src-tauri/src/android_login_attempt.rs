//! Isolated Android PKCE attempt. No IPC, browser, App Link handler or HTTP
//! transport is registered here. URLs must be fixed by trusted native config.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use sha2::{Digest, Sha256};
use std::time::{Duration, Instant};
use url::{form_urlencoded, Url};
use zeroize::{Zeroize, Zeroizing};

use crate::android_login_callback::{CallbackDecision, PendingAndroidCallback};

const LIFETIME: Duration = Duration::from_secs(300);

/// Native-only result; neither the verifier nor code may cross IPC or be logged.
pub(crate) enum LoginDecision {
    Approved(ApprovedAuthorization),
    Denied,
}

/// Native-only one-use authorization. It is neither cloneable nor serializable.
pub(crate) struct ApprovedAuthorization {
    code: Zeroizing<String>,
    verifier: Zeroizing<String>,
    redirect: String,
}
impl ApprovedAuthorization {
    pub(crate) fn into_parts(self) -> (Zeroizing<String>, Zeroizing<String>, String) {
        (self.code, self.verifier, self.redirect)
    }
}

pub(crate) struct AndroidLoginAttempt {
    callback: PendingAndroidCallback,
    redirect: String,
    verifier: Zeroizing<String>,
    browser_url: Option<Zeroizing<String>>,
    deadline: Instant,
    dispatched: bool,
    finished: bool,
}

fn random_secret() -> Result<Zeroizing<String>, ()> {
    let mut bytes = Zeroizing::new([0u8; 32]);
    getrandom::fill(&mut bytes[..]).map_err(|_| ())?;
    Ok(Zeroizing::new(URL_SAFE_NO_PAD.encode(&bytes[..])))
}

fn challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

impl AndroidLoginAttempt {
    /// The caller must supply fixed trusted HTTPS URLs, not values from the
    /// WebView. A validated and verified App Link is still required separately.
    pub(crate) fn new(consent: &str, redirect: &str, now: Instant) -> Result<Self, ()> {
        Self::with_secrets(consent, redirect, now, random_secret()?, random_secret()?)
    }

    fn with_secrets(
        consent: &str,
        redirect: &str,
        now: Instant,
        mut state: Zeroizing<String>,
        verifier: Zeroizing<String>,
    ) -> Result<Self, ()> {
        let page = Url::parse(consent).map_err(|_| ())?;
        if consent.len() > 512
            || page.as_str() != consent
            || page.scheme() != "https"
            || page.host_str().is_none()
            || !page.username().is_empty()
            || page.password().is_some()
            || page.query().is_some()
            || page.fragment().is_some()
        {
            return Err(());
        }
        let deadline = now.checked_add(LIFETIME).ok_or(())?;
        let mut fields = form_urlencoded::Serializer::new(String::new());
        fields
            .append_pair("client_id", "virgostars-android")
            .append_pair("redirect_uri", redirect)
            .append_pair("code_challenge", &challenge(&verifier))
            .append_pair("code_challenge_method", "S256")
            .append_pair("state", &state)
            .append_pair("request_charts_write", "true");
        let fields = Zeroizing::new(fields.finish());
        let browser_url = Zeroizing::new(format!("{consent}#{}", fields.as_str()));
        let callback = PendingAndroidCallback::new(redirect, std::mem::take(&mut *state), now)?;
        Ok(Self {
            callback,
            redirect: redirect.to_owned(),
            verifier,
            browser_url: Some(browser_url),
            deadline,
            dispatched: false,
            finished: false,
        })
    }

    /// The coordinator passes this to the system browser, never to the WebView.
    /// A fresh attempt is required if launch fails; this URL is handed out once.
    pub(crate) fn take_browser_url(&mut self, now: Instant) -> Result<Zeroizing<String>, ()> {
        if self.finished || self.dispatched {
            return Err(());
        }
        if now >= self.deadline {
            self.cancel();
            return Err(());
        }
        let url = self.browser_url.take().ok_or(())?;
        self.dispatched = true;
        Ok(url)
    }

    pub(crate) fn cancel(&mut self) {
        self.finished = true;
        self.callback.cancel();
        self.verifier.zeroize();
        self.browser_url = None;
    }

    /// Malformed or foreign callbacks do not consume a valid pending attempt.
    pub(crate) fn accept(&mut self, callback: &str, now: Instant) -> Result<LoginDecision, ()> {
        if self.finished || !self.dispatched {
            return Err(());
        }
        if now >= self.deadline {
            self.cancel();
            return Err(());
        }
        match self.callback.accept(callback, now)? {
            CallbackDecision::Denied => {
                self.cancel();
                Ok(LoginDecision::Denied)
            }
            CallbackDecision::Approved(code) => {
                let verifier = Zeroizing::new(std::mem::take(&mut *self.verifier));
                self.cancel();
                Ok(LoginDecision::Approved(ApprovedAuthorization {
                    code,
                    verifier,
                    redirect: self.redirect.clone(),
                }))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    const PAGE: &str = "https://example.test/collega-dispositivo";
    const REDIRECT: &str = "https://example.test/virgostars/oauth/callback";
    fn value(c: char) -> String {
        std::iter::repeat_n(c, 43).collect()
    }

    #[test]
    fn rfc7636_s256_vector() {
        assert_eq!(
            challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn authorization_is_android_pkce_and_secret_verifier_stays_native() {
        let now = Instant::now();
        let mut attempt = AndroidLoginAttempt::with_secrets(
            PAGE,
            REDIRECT,
            now,
            Zeroizing::new(value('s')),
            Zeroizing::new(value('v')),
        )
        .unwrap();
        let callback = format!("{REDIRECT}?code={}&state={}", value('c'), value('s'));
        assert!(attempt.accept(&callback, now).is_err());
        let url = attempt.take_browser_url(now).unwrap();
        let (page, fragment) = url.split_once('#').unwrap();
        assert_eq!(page, PAGE);
        let fields: HashMap<_, _> = form_urlencoded::parse(fragment.as_bytes())
            .into_owned()
            .collect();
        assert_eq!(fields.get("client_id").unwrap(), "virgostars-android");
        assert_eq!(fields.get("redirect_uri").unwrap(), REDIRECT);
        assert_eq!(fields.get("state").unwrap(), &value('s'));
        assert_eq!(
            fields.get("code_challenge").unwrap(),
            &challenge(&value('v'))
        );
        assert_eq!(fields.get("code_challenge_method").unwrap(), "S256");
        assert_eq!(fields.get("request_charts_write").unwrap(), "true");
        assert!(!url.contains(&value('v')));
        assert!(attempt.take_browser_url(now).is_err());
        assert!(attempt
            .accept(&callback.replace(&value('s'), &value('x')), now)
            .is_err());
        let Ok(LoginDecision::Approved(approved)) = attempt.accept(&callback, now) else {
            panic!("expected approval");
        };
        assert_eq!(approved.code.as_str(), value('c'));
        assert_eq!(approved.verifier.as_str(), value('v'));
        assert_eq!(approved.redirect, REDIRECT);
        assert!(attempt.accept(&callback, now).is_err());
    }

    #[test]
    fn denial_expiry_cancellation_and_bad_configuration_fail_closed() {
        let now = Instant::now();
        for invalid in [
            "http://example.test/consent",
            "https://example.test/consent?x=1",
            "https://user@example.test/consent",
            "https://EXAMPLE.test/consent",
        ] {
            assert!(AndroidLoginAttempt::new(invalid, REDIRECT, now).is_err());
        }
        assert!(AndroidLoginAttempt::new(PAGE, "http://example.test/callback", now).is_err());
        let mut denied = AndroidLoginAttempt::with_secrets(
            PAGE,
            REDIRECT,
            now,
            Zeroizing::new(value('s')),
            Zeroizing::new(value('v')),
        )
        .unwrap();
        let _url = denied.take_browser_url(now).unwrap();
        assert!(matches!(
            denied.accept(
                &format!("{REDIRECT}?state={}&error=access_denied", value('s')),
                now
            ),
            Ok(LoginDecision::Denied)
        ));
        assert!(denied.take_browser_url(now).is_err());
        let mut expired = AndroidLoginAttempt::new(PAGE, REDIRECT, now).unwrap();
        assert!(expired.take_browser_url(now + LIFETIME).is_err());
        let mut cancelled = AndroidLoginAttempt::new(PAGE, REDIRECT, now).unwrap();
        cancelled.cancel();
        assert!(cancelled.take_browser_url(now).is_err());
    }

    #[test]
    fn fresh_attempts_use_independent_random_state_and_challenge() {
        let now = Instant::now();
        let mut first = AndroidLoginAttempt::new(PAGE, REDIRECT, now).unwrap();
        let mut second = AndroidLoginAttempt::new(PAGE, REDIRECT, now).unwrap();
        let a = first.take_browser_url(now).unwrap();
        let b = second.take_browser_url(now).unwrap();
        let fields = |url: &str| -> HashMap<String, String> {
            form_urlencoded::parse(url.split_once('#').unwrap().1.as_bytes())
                .into_owned()
                .collect()
        };
        let (a, b) = (fields(&a), fields(&b));
        assert_ne!(a["state"], b["state"]);
        assert_ne!(a["code_challenge"], b["code_challenge"]);
    }
}
