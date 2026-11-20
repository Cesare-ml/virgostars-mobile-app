//! Isolated token exchange contract. The optional native HTTP transport is not
//! invoked by the app; there is no Tauri command or session persistence. Do not use a grant until the
//! native client verifies the server-side session and its account binding.
use crate::android_login_attempt::LoginDecision;
use std::time::{Duration, Instant};
use url::form_urlencoded;
use zeroize::{Zeroize, Zeroizing};

pub(crate) const TOKEN_ENDPOINT: &str = "https://api.virgostars.it/chart-sync/v1/token";
const MAX_RESPONSE: usize = 8192;
const MAX_FORM: usize = 2048;
const TIMEOUT: Duration = Duration::from_secs(10);

/// Implementations must enforce TLS hostname/certificate validation, no HTTP
/// redirects, the given timeout and response limit, and must not log secrets.
/// This trait does not itself provide those protections.
pub(crate) trait TokenTransport {
    fn post_form(
        &self,
        endpoint: &str,
        body: &str,
        timeout: Duration,
        max_bytes: usize,
    ) -> Result<TokenResponse, ()>;
}
pub(crate) struct TokenResponse {
    pub(crate) status: u16,
    pub(crate) content_type: String,
    pub(crate) body: Vec<u8>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum TokenScope {
    Read,
    ReadAndChartWrite,
}
impl TokenScope {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Read => "chart_sync:read",
            Self::ReadAndChartWrite => "chart_sync:read chart_sync:charts:write",
        }
    }
}

/// This is an unverified grant, not proof of a connected account. It has no
/// serialization, debug, or clone implementation and may be used only by Rust.
pub(crate) struct UnverifiedGrant {
    bearer: Zeroizing<String>,
    scope: TokenScope,
    expires: Instant,
}
impl UnverifiedGrant {
    pub(crate) fn bearer(&self) -> &str {
        &self.bearer
    }
    pub(crate) fn scope(&self) -> TokenScope {
        self.scope
    }
    pub(crate) fn remaining_seconds(&self, now: Instant) -> u64 {
        self.expires.saturating_duration_since(now).as_secs()
    }
    pub(crate) fn into_parts(self) -> (Zeroizing<String>, TokenScope, Instant) {
        (self.bearer, self.scope, self.expires)
    }
    #[cfg(test)]
    pub(crate) fn synthetic(scope: TokenScope, expires: Instant) -> Self {
        Self {
            bearer: Zeroizing::new("synthetic.bearer.token".to_owned()),
            scope,
            expires,
        }
    }
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct Payload {
    token_type: String,
    access_token: String,
    expires_in: u64,
    scope: String,
}
impl Drop for Payload {
    fn drop(&mut self) {
        self.access_token.zeroize();
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum ExchangeError {
    Denied,
    Invalid,
    Network,
    Rejected,
}

fn valid_secret(value: &str) -> bool {
    value.len() == 43
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}
pub(crate) fn plausible_bearer(value: &str) -> bool {
    (100..=4096).contains(&value.len())
        && value.split('.').count() == 3
        && value.split('.').all(|part| {
            !part.is_empty()
                && part
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
        })
}

/// Consumes the approved code exactly once. Never retries an uncertain POST.
/// The current Android server contract does not issue a persistent credential.
pub(crate) fn exchange<T: TokenTransport>(
    transport: &T,
    decision: LoginDecision,
    now: Instant,
) -> Result<UnverifiedGrant, ExchangeError> {
    let LoginDecision::Approved(approved) = decision else {
        return Err(ExchangeError::Denied);
    };
    let (code, verifier, redirect) = approved.into_parts();
    if !valid_secret(&code) || !valid_secret(&verifier) {
        return Err(ExchangeError::Invalid);
    }
    let mut fields = form_urlencoded::Serializer::new(String::new());
    fields
        .append_pair("grant_type", "authorization_code")
        .append_pair("client_id", "virgostars-android")
        .append_pair("redirect_uri", &redirect)
        .append_pair("code", &code)
        .append_pair("code_verifier", &verifier);
    let body = Zeroizing::new(fields.finish());
    if body.len() > MAX_FORM {
        return Err(ExchangeError::Invalid);
    }
    let response = transport
        .post_form(TOKEN_ENDPOINT, &body, TIMEOUT, MAX_RESPONSE)
        .map_err(|_| ExchangeError::Network)?;
    let bytes = Zeroizing::new(response.body);
    if response.status != 200 {
        return Err(ExchangeError::Rejected);
    }
    if bytes.is_empty() || bytes.len() > MAX_RESPONSE {
        return Err(ExchangeError::Invalid);
    }
    let content_type = response.content_type.to_ascii_lowercase();
    if content_type != "application/json" && content_type != "application/json; charset=utf-8" {
        return Err(ExchangeError::Invalid);
    }
    let mut payload: Payload =
        serde_json::from_slice(&bytes).map_err(|_| ExchangeError::Invalid)?;
    let bearer = Zeroizing::new(std::mem::take(&mut payload.access_token));
    if payload.token_type != "Bearer"
        || !plausible_bearer(&bearer)
        || payload.expires_in == 0
        || payload.expires_in > 900
    {
        return Err(ExchangeError::Invalid);
    }
    let scope = match payload.scope.as_str() {
        "chart_sync:read" => TokenScope::Read,
        "chart_sync:read chart_sync:charts:write" => TokenScope::ReadAndChartWrite,
        _ => return Err(ExchangeError::Invalid),
    };
    let expires = now
        .checked_add(Duration::from_secs(payload.expires_in))
        .ok_or(ExchangeError::Invalid)?;
    Ok(UnverifiedGrant {
        bearer,
        scope,
        expires,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::android_login_attempt::AndroidLoginAttempt;
    use std::cell::Cell;
    use std::collections::HashMap;
    struct Fake {
        calls: Cell<usize>,
        status: u16,
        content_type: &'static str,
        response: Vec<u8>,
        fail: bool,
    }
    impl TokenTransport for Fake {
        fn post_form(
            &self,
            endpoint: &str,
            body: &str,
            timeout: Duration,
            max: usize,
        ) -> Result<TokenResponse, ()> {
            self.calls.set(self.calls.get() + 1);
            assert_eq!(endpoint, TOKEN_ENDPOINT);
            assert_eq!(timeout, TIMEOUT);
            assert_eq!(max, MAX_RESPONSE);
            let fields: HashMap<_, _> = form_urlencoded::parse(body.as_bytes())
                .into_owned()
                .collect();
            assert_eq!(fields.len(), 5);
            assert_eq!(fields["grant_type"], "authorization_code");
            assert_eq!(fields["client_id"], "virgostars-android");
            assert_eq!(fields["redirect_uri"], "https://example.test/callback");
            assert_eq!(fields["code"], "c".repeat(43));
            assert!(valid_secret(&fields["code_verifier"]));
            if self.fail {
                return Err(());
            }
            Ok(TokenResponse {
                status: self.status,
                content_type: self.content_type.into(),
                body: self.response.clone(),
            })
        }
    }
    fn approved() -> LoginDecision {
        let now = Instant::now();
        let mut attempt = AndroidLoginAttempt::new(
            "https://example.test/consent",
            "https://example.test/callback",
            now,
        )
        .unwrap();
        let url = attempt.take_browser_url(now).unwrap();
        let fields: HashMap<_, _> =
            form_urlencoded::parse(url.split_once('#').unwrap().1.as_bytes())
                .into_owned()
                .collect();
        let callback = format!(
            "https://example.test/callback?code={}&state={}",
            "c".repeat(43),
            fields["state"]
        );
        attempt
            .accept(&callback, now)
            .unwrap_or_else(|_| panic!("valid callback rejected"))
    }
    fn body(scope: &str) -> Vec<u8> {
        let jwt = format!("{}.{}.{}", "A".repeat(40), "B".repeat(40), "C".repeat(40));
        format!(
            r#"{{"token_type":"Bearer","access_token":"{jwt}","expires_in":900,"scope":"{scope}"}}"#
        )
        .into_bytes()
    }
    fn fake(scope: &str) -> Fake {
        Fake {
            calls: Cell::new(0),
            status: 200,
            content_type: "application/json",
            response: body(scope),
            fail: false,
        }
    }

    #[test]
    fn exact_android_form_returns_only_an_unverified_native_grant() {
        let now = Instant::now();
        let client = fake("chart_sync:read chart_sync:charts:write");
        let grant = exchange(&client, approved(), now)
            .unwrap_or_else(|_| panic!("valid exchange rejected"));
        assert!(grant.scope() == TokenScope::ReadAndChartWrite);
        assert_eq!(grant.remaining_seconds(now), 900);
        assert!(plausible_bearer(grant.bearer()));
        assert_eq!(client.calls.get(), 1);
    }
    #[test]
    fn denial_never_dispatches() {
        let client = fake("chart_sync:read");
        assert!(matches!(
            exchange(&client, LoginDecision::Denied, Instant::now()),
            Err(ExchangeError::Denied)
        ));
        assert_eq!(client.calls.get(), 0);
    }
    #[test]
    fn transport_failure_is_not_retried_and_bad_responses_fail_closed() {
        let now = Instant::now();
        let mut client = fake("chart_sync:read");
        client.fail = true;
        assert!(matches!(
            exchange(&client, approved(), now),
            Err(ExchangeError::Network)
        ));
        assert_eq!(client.calls.get(), 1);
        client.fail = false;
        client.status = 302;
        assert!(matches!(
            exchange(&client, approved(), now),
            Err(ExchangeError::Rejected)
        ));
        client.status = 200;
        client.content_type = "text/html";
        assert!(matches!(
            exchange(&client, approved(), now),
            Err(ExchangeError::Invalid)
        ));
        client.content_type = "application/json";
        for scope in [
            "chart_sync:read chart_sync:notes",
            "chart_sync:read chart_sync:groups:write",
            "admin",
        ] {
            client.response = body(scope);
            assert!(matches!(
                exchange(&client, approved(), now),
                Err(ExchangeError::Invalid)
            ));
        }
        client.response=br#"{"token_type":"Bearer","token_type":"Bearer","access_token":"x","expires_in":900,"scope":"chart_sync:read"}"#.to_vec();
        assert!(matches!(
            exchange(&client, approved(), now),
            Err(ExchangeError::Invalid)
        ));
        client.response = body("chart_sync:read");
        let valid = String::from_utf8(client.response.clone()).unwrap();
        for invalid in [
            valid.replace("\"expires_in\":900", "\"expires_in\":0"),
            valid.replace("\"expires_in\":900", "\"expires_in\":901"),
            valid.replace("\"token_type\":\"Bearer\"", "\"token_type\":\"Other\""),
            valid.replace("\"scope\":", "\"unexpected\":1,\"scope\":"),
        ] {
            client.response = invalid.into_bytes();
            assert!(matches!(
                exchange(&client, approved(), now),
                Err(ExchangeError::Invalid)
            ));
        }
        client.response = vec![b'x'; MAX_RESPONSE + 1];
        assert!(matches!(
            exchange(&client, approved(), now),
            Err(ExchangeError::Invalid)
        ));
    }
}
