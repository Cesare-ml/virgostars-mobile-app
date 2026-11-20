//! Isolated native account-binding contract. No transport is invoked by the app and there is no IPC.
use crate::android_token_exchange::{TokenScope, UnverifiedGrant};
use std::time::{Duration, Instant};
use zeroize::Zeroizing;

pub(crate) const SESSION_ENDPOINT: &str = "https://api.virgostars.it/chart-sync/v1/session";
const TIMEOUT: Duration = Duration::from_secs(10);
const MAX_RESPONSE: usize = 4096;

/// Concrete implementations must enforce TLS, no redirects, bounds and no
/// secret logging. The backend must authenticate the token and active grant.
pub(crate) trait SessionTransport {
    fn get_session(
        &self,
        endpoint: &str,
        bearer: &str,
        timeout: Duration,
        max_bytes: usize,
    ) -> Result<SessionResponse, ()>;
}
pub(crate) struct SessionResponse {
    pub(crate) status: u16,
    pub(crate) content_type: String,
    pub(crate) body: Vec<u8>,
}
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Payload {
    contract_version: u8,
    status: String,
    scope: String,
    profile_ref: String,
}

/// A verified server grant and pseudonymous profile reference remain Rust-only.
/// This does not implement local profile isolation or sync.
pub(crate) struct VerifiedSession {
    bearer: Zeroizing<String>,
    scope: TokenScope,
    profile_ref: String,
    expires: Instant,
}
impl VerifiedSession {
    pub(crate) fn bearer(&self) -> &str {
        &self.bearer
    }
    pub(crate) fn scope(&self) -> TokenScope {
        self.scope
    }
    pub(crate) fn profile_ref(&self) -> &str {
        &self.profile_ref
    }
    pub(crate) fn remaining_seconds(&self, now: Instant) -> u64 {
        self.expires.saturating_duration_since(now).as_secs()
    }
}
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum SessionError {
    Expired,
    Network,
    Rejected,
    Invalid,
}

fn profile_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 36
        && bytes.iter().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => *c == b'-',
            _ => c.is_ascii_digit() || (b'a'..=b'f').contains(c),
        })
}

/// Consume an unverified grant; neither request nor returned profile reaches
/// the WebView. The injected clock is checked before and after network I/O.
pub(crate) fn verify<T: SessionTransport>(
    transport: &T,
    grant: UnverifiedGrant,
    now: impl Fn() -> Instant,
) -> Result<VerifiedSession, SessionError> {
    let (bearer, scope, expires) = grant.into_parts();
    if now() >= expires {
        return Err(SessionError::Expired);
    }
    let response = transport
        .get_session(SESSION_ENDPOINT, &bearer, TIMEOUT, MAX_RESPONSE)
        .map_err(|_| SessionError::Network)?;
    let bytes = Zeroizing::new(response.body);
    if now() >= expires {
        return Err(SessionError::Expired);
    }
    if response.status != 200 {
        return Err(SessionError::Rejected);
    }
    if bytes.is_empty() || bytes.len() > MAX_RESPONSE {
        return Err(SessionError::Invalid);
    }
    let content_type = response.content_type.to_ascii_lowercase();
    if content_type != "application/json" && content_type != "application/json; charset=utf-8" {
        return Err(SessionError::Invalid);
    }
    let payload: Payload = serde_json::from_slice(&bytes).map_err(|_| SessionError::Invalid)?;
    if payload.contract_version != 1
        || payload.status != "active"
        || payload.scope != scope.as_str()
        || !profile_id(&payload.profile_ref)
    {
        return Err(SessionError::Invalid);
    }
    Ok(VerifiedSession {
        bearer,
        scope,
        profile_ref: payload.profile_ref,
        expires,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    const PROFILE: &str = "44444444-aaaa-4444-8444-444444444444";
    struct Fake {
        calls: Cell<usize>,
        status: u16,
        body: Vec<u8>,
        content_type: &'static str,
        fail: bool,
    }
    impl SessionTransport for Fake {
        fn get_session(
            &self,
            endpoint: &str,
            bearer: &str,
            timeout: Duration,
            max: usize,
        ) -> Result<SessionResponse, ()> {
            self.calls.set(self.calls.get() + 1);
            assert_eq!(endpoint, SESSION_ENDPOINT);
            assert_eq!(bearer, "synthetic.bearer.token");
            assert_eq!(timeout, TIMEOUT);
            assert_eq!(max, MAX_RESPONSE);
            if self.fail {
                return Err(());
            }
            Ok(SessionResponse {
                status: self.status,
                content_type: self.content_type.into(),
                body: self.body.clone(),
            })
        }
    }
    fn body(scope: &str, profile: &str) -> Vec<u8> {
        format!(r#"{{"contractVersion":1,"status":"active","scope":"{scope}","profileRef":"{profile}"}}"#).into_bytes()
    }
    fn fake() -> Fake {
        Fake {
            calls: Cell::new(0),
            status: 200,
            body: body("chart_sync:read", PROFILE),
            content_type: "application/json",
            fail: false,
        }
    }
    fn grant(now: Instant) -> UnverifiedGrant {
        UnverifiedGrant::synthetic(TokenScope::Read, now + Duration::from_secs(60))
    }

    #[test]
    fn only_matching_session_becomes_verified() {
        let now = Instant::now();
        let client = fake();
        let result = verify(&client, grant(now), || now)
            .unwrap_or_else(|_| panic!("valid session rejected"));
        assert_eq!(result.profile_ref(), PROFILE);
        assert!(result.scope() == TokenScope::Read);
        assert_eq!(result.bearer(), "synthetic.bearer.token");
        assert_eq!(result.remaining_seconds(now), 60);
        assert_eq!(client.calls.get(), 1);
        let mut write_client = fake();
        write_client.body = body("chart_sync:read chart_sync:charts:write", PROFILE);
        let write_grant = UnverifiedGrant::synthetic(
            TokenScope::ReadAndChartWrite,
            now + Duration::from_secs(60),
        );
        let write = verify(&write_client, write_grant, || now)
            .unwrap_or_else(|_| panic!("write session rejected"));
        assert!(write.scope() == TokenScope::ReadAndChartWrite);
    }
    #[test]
    fn altered_scope_profile_status_or_schema_are_rejected() {
        let now = Instant::now();
        let mut client = fake();
        for bytes in [body("chart_sync:read chart_sync:charts:write",PROFILE),body("chart_sync:read","invalid"),
            body("chart_sync:read",&PROFILE.to_uppercase()),
            br#"{"contractVersion":2,"status":"active","scope":"chart_sync:read","profileRef":"44444444-4444-4444-8444-444444444444"}"#.to_vec(),
            br#"{"contractVersion":1,"status":"revoked","scope":"chart_sync:read","profileRef":"44444444-4444-4444-8444-444444444444"}"#.to_vec(),
            br#"{"contractVersion":1,"status":"active","scope":"chart_sync:read","profileRef":"44444444-4444-4444-8444-444444444444","extra":1}"#.to_vec()] {
            client.body=bytes;
            assert!(matches!(verify(&client,grant(now),||now),Err(SessionError::Invalid)));
        }
    }
    #[test]
    fn expiry_network_rejection_and_limits_are_safe() {
        let now = Instant::now();
        let mut client = fake();
        assert!(matches!(
            verify(
                &client,
                UnverifiedGrant::synthetic(TokenScope::Read, now),
                || now
            ),
            Err(SessionError::Expired)
        ));
        assert_eq!(client.calls.get(), 0);
        let count = Cell::new(0);
        assert!(matches!(
            verify(&client, grant(now), || {
                let n = count.get();
                count.set(n + 1);
                if n == 0 {
                    now
                } else {
                    now + Duration::from_secs(60)
                }
            }),
            Err(SessionError::Expired)
        ));
        client.fail = true;
        assert!(matches!(
            verify(&client, grant(now), || now),
            Err(SessionError::Network)
        ));
        client.fail = false;
        client.status = 403;
        assert!(matches!(
            verify(&client, grant(now), || now),
            Err(SessionError::Rejected)
        ));
        client.status = 200;
        client.content_type = "text/html";
        assert!(matches!(
            verify(&client, grant(now), || now),
            Err(SessionError::Invalid)
        ));
        client.content_type = "application/json";
        client.body = vec![b'x'; MAX_RESPONSE + 1];
        assert!(matches!(
            verify(&client, grant(now), || now),
            Err(SessionError::Invalid)
        ));
    }
}
