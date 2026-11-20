//! Experimental native read of a full server snapshot. It neither modifies nor
//! persists the local archive. Only a previously verified session can read it.
use crate::android_connected_session::{profile_id, VerifiedSession};
use serde::Deserialize;
use std::collections::HashSet;
use std::time::{Duration, Instant};
use zeroize::Zeroizing;

pub(crate) const SNAPSHOT_ENDPOINT: &str = "https://api.virgostars.it/chart-sync/v1/snapshot";
pub(crate) const MAX_SNAPSHOT_BYTES: usize = 8 * 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(10);
const MAX_CHARTS: usize = 500;

pub(crate) trait SnapshotTransport {
    fn get_snapshot(
        &self,
        endpoint: &str,
        bearer: &str,
        timeout: Duration,
        max: usize,
    ) -> Result<SnapshotResponse, ()>;
}
pub(crate) struct SnapshotResponse {
    pub(crate) status: u16,
    pub(crate) content_type: String,
    pub(crate) body: Vec<u8>,
}

// Missing nullable fields must not be treated as explicit nulls.
fn required_option<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Snapshot {
    contract_version: u8,
    cursor: Cursor,
    charts: Vec<Chart>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Cursor {
    epoch: String,
    change_seq: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Chart {
    contract_version: u8,
    sync_id: String,
    name: String,
    kind: String,
    birth: Birth,
    place: Place,
    #[serde(deserialize_with = "required_option")]
    sex: Option<String>,
    groups: Vec<String>,
    #[serde(deserialize_with = "required_option")]
    notes: Option<String>,
    is_account_chart: bool,
    revision: u64,
    updated_at: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Birth {
    local_date: String,
    #[serde(deserialize_with = "required_option")]
    local_time: Option<String>,
    time_unknown: bool,
    #[serde(deserialize_with = "required_option")]
    time_zone_iana: Option<String>,
    #[serde(deserialize_with = "required_option")]
    resolved_instant_utc: Option<String>,
    #[serde(deserialize_with = "required_option")]
    utc_offset_seconds: Option<i32>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Place {
    mode: String,
    label: String,
    #[serde(deserialize_with = "required_option")]
    city_ref: Option<String>,
    #[serde(deserialize_with = "required_option")]
    latitude_microdegrees: Option<i32>,
    #[serde(deserialize_with = "required_option")]
    longitude_microdegrees: Option<i32>,
}

// Keep the original JSON intact for a future lossless, transactional importer.
// Nothing here converts civil time, invents coordinates, or edits local data.
pub(crate) struct VerifiedSnapshot {
    profile_ref: String,
    bytes: Zeroizing<Vec<u8>>,
}
impl VerifiedSnapshot {
    pub(crate) fn profile_ref(&self) -> &str {
        &self.profile_ref
    }
    pub(crate) fn json(&self) -> &[u8] {
        &self.bytes
    }
    // Revalidate decrypted bytes before they can be used as a snapshot.
    pub(crate) fn from_cached(
        profile_ref: &str,
        bytes: Zeroizing<Vec<u8>>,
    ) -> Result<Self, SnapshotError> {
        if !profile_id(profile_ref) || bytes.is_empty() || bytes.len() > MAX_SNAPSHOT_BYTES {
            return Err(SnapshotError::Invalid);
        }
        let payload: Snapshot =
            serde_json::from_slice(&bytes).map_err(|_| SnapshotError::Invalid)?;
        if !valid_snapshot(&payload, profile_ref) {
            return Err(SnapshotError::Invalid);
        }
        Ok(Self {
            profile_ref: profile_ref.to_owned(),
            bytes,
        })
    }
}
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum SnapshotError {
    Expired,
    Network,
    Rejected,
    Invalid,
}

fn safe_text(text: &str, max: usize) -> bool {
    text.chars().count() <= max
        && !text.chars().any(|c| {
            c.is_control() || matches!(c, '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}')
        })
}
fn valid_snapshot(payload: &Snapshot, profile: &str) -> bool {
    let seq = &payload.cursor.change_seq;
    if payload.contract_version != 1
        || payload.cursor.epoch != profile
        || !profile_id(&payload.cursor.epoch)
        || seq.is_empty()
        || seq.len() > 19
        || (seq.len() > 1 && seq.starts_with('0'))
        || !seq.bytes().all(|c| c.is_ascii_digit())
        || seq.parse::<i64>().is_err()
        || payload.charts.len() > MAX_CHARTS
    {
        return false;
    }
    let mut ids = HashSet::new();
    let mut account_charts = 0;
    for chart in &payload.charts {
        let b = &chart.birth;
        let p = &chart.place;
        if chart.is_account_chart {
            account_charts += 1;
        }
        if chart.contract_version != 1
            || !profile_id(&chart.sync_id)
            || !ids.insert(&chart.sync_id)
            || chart.name.trim().is_empty()
            || !safe_text(&chart.name, 255)
            || !matches!(
                chart.kind.as_str(),
                "unclassified" | "self" | "person" | "event" | "public_subject"
            )
            || chart.revision == 0
            || chart.revision > 9_007_199_254_740_991
            || chart.updated_at.len() > 40
            || !chart.updated_at.ends_with('Z')
            || b.local_date.len() != 10
            || b.time_unknown != b.local_time.is_none()
            || b.local_time.as_ref().is_some_and(|s| s.len() != 8)
            || b.time_zone_iana
                .as_ref()
                .is_some_and(|s| s.is_empty() || !safe_text(s, 80))
            || b.resolved_instant_utc.is_some()
            || b.utc_offset_seconds.is_some()
            || !matches!(p.mode.as_str(), "unknown" | "manual" | "city")
            || !safe_text(&p.label, 160)
            || p.city_ref.as_ref().is_some_and(|s| !safe_text(s, 80))
            || p.latitude_microdegrees.is_some() != p.longitude_microdegrees.is_some()
            || p.latitude_microdegrees
                .is_some_and(|v| !(-90_000_000..=90_000_000).contains(&v))
            || p.longitude_microdegrees
                .is_some_and(|v| !(-180_000_000..=180_000_000).contains(&v))
            || chart.sex.as_ref().is_some_and(|s| !safe_text(s, 80))
            || chart.groups.len() > 500
            || chart
                .groups
                .iter()
                .any(|s| s.trim().is_empty() || !safe_text(s, 160))
            || chart.notes.is_some()
        {
            return false;
        }
    }
    account_charts <= 1
}

pub(crate) fn fetch<T: SnapshotTransport>(
    transport: &T,
    session: &VerifiedSession,
    now: impl Fn() -> Instant,
) -> Result<VerifiedSnapshot, SnapshotError> {
    if session.remaining_seconds(now()) == 0 {
        return Err(SnapshotError::Expired);
    }
    let response = transport
        .get_snapshot(
            SNAPSHOT_ENDPOINT,
            session.bearer(),
            TIMEOUT,
            MAX_SNAPSHOT_BYTES,
        )
        .map_err(|_| SnapshotError::Network)?;
    let bytes = Zeroizing::new(response.body);
    if session.remaining_seconds(now()) == 0 {
        return Err(SnapshotError::Expired);
    }
    if response.status != 200 {
        return Err(SnapshotError::Rejected);
    }
    if bytes.is_empty() || bytes.len() > MAX_SNAPSHOT_BYTES {
        return Err(SnapshotError::Invalid);
    }
    let content_type = response.content_type.to_ascii_lowercase();
    if content_type != "application/json" && content_type != "application/json; charset=utf-8" {
        return Err(SnapshotError::Invalid);
    }
    VerifiedSnapshot::from_cached(session.profile_ref(), bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::android_connected_session::{self, SessionResponse, SessionTransport};
    use crate::android_token_exchange::{TokenScope, UnverifiedGrant};
    use std::cell::Cell;

    const PROFILE: &str = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    struct SessionFake;
    impl SessionTransport for SessionFake {
        fn get_session(
            &self,
            _: &str,
            _: &str,
            _: Duration,
            _: usize,
        ) -> Result<SessionResponse, ()> {
            Ok(SessionResponse { status: 200, content_type: "application/json".into(),
                body: format!(r#"{{"contractVersion":1,"status":"active","scope":"chart_sync:read","profileRef":"{PROFILE}"}}"#).into_bytes() })
        }
    }
    fn session(now: Instant) -> VerifiedSession {
        android_connected_session::verify(
            &SessionFake,
            UnverifiedGrant::synthetic(TokenScope::Read, now + Duration::from_secs(60)),
            || now,
        )
        .unwrap_or_else(|_| panic!("synthetic session rejected"))
    }
    struct Fake {
        body: Vec<u8>,
        status: u16,
        content_type: &'static str,
        fail: bool,
        calls: Cell<u32>,
    }
    impl SnapshotTransport for Fake {
        fn get_snapshot(
            &self,
            endpoint: &str,
            bearer: &str,
            timeout: Duration,
            max: usize,
        ) -> Result<SnapshotResponse, ()> {
            self.calls.set(self.calls.get() + 1);
            assert_eq!(endpoint, SNAPSHOT_ENDPOINT);
            assert_eq!(bearer, "synthetic.bearer.token");
            assert_eq!(timeout, TIMEOUT);
            assert_eq!(max, MAX_SNAPSHOT_BYTES);
            if self.fail {
                return Err(());
            }
            Ok(SnapshotResponse {
                status: self.status,
                content_type: self.content_type.into(),
                body: self.body.clone(),
            })
        }
    }
    fn sample() -> serde_json::Value {
        serde_json::json!({"contractVersion":1,"cursor":{"epoch":PROFILE,"changeSeq":"42"},"charts":[{
            "contractVersion":1,"syncId":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            "name":"Synthetic \"example\"", "kind":"unclassified",
            "birth":{"localDate":"2000-01-01","localTime":null,"timeUnknown":true,
                "timeZoneIana":null,"resolvedInstantUtc":null,"utcOffsetSeconds":null},
            "place":{"mode":"unknown","label":"","cityRef":null,"latitudeMicrodegrees":null,"longitudeMicrodegrees":null},
            "sex":null,"groups":["Synthetic"],"notes":null,"isAccountChart":false,
            "revision":1,"updatedAt":"2026-11-20T12:00:00.000Z"
        }]})
    }
    fn fake(value: &serde_json::Value) -> Fake {
        Fake {
            body: serde_json::to_vec(value).unwrap(),
            status: 200,
            content_type: "application/json",
            fail: false,
            calls: Cell::new(0),
        }
    }
    #[test]
    fn accepts_only_verified_profile_and_preserves_unknown_civil_inputs() {
        let now = Instant::now();
        let value = sample();
        let client = fake(&value);
        let result =
            fetch(&client, &session(now), || now).unwrap_or_else(|_| panic!("snapshot rejected"));
        assert_eq!(result.profile_ref(), PROFILE);
        assert_eq!(result.json(), client.body); // byte-for-byte, no lossy conversion
        let mut wrong = value.clone();
        wrong["cursor"]["epoch"] = "cccccccc-cccc-4ccc-8ccc-cccccccccccc".into();
        assert!(matches!(
            fetch(&fake(&wrong), &session(now), || now),
            Err(SnapshotError::Invalid)
        ));
    }
    #[test]
    fn rejects_duplicates_missing_fields_unsupported_notes_and_bad_bounds() {
        let now = Instant::now();
        let verified = session(now);
        let original = sample();
        let mut cases = Vec::new();
        let mut v = original.clone();
        v["charts"]
            .as_array_mut()
            .unwrap()
            .push(original["charts"][0].clone());
        cases.push(v);
        let mut v = original.clone();
        v["charts"][0].as_object_mut().unwrap().remove("notes");
        cases.push(v);
        let mut v = original.clone();
        v["charts"][0]["notes"] = "not consented".into();
        cases.push(v);
        let mut v = original.clone();
        v["charts"][0]["birth"]["timeUnknown"] = false.into();
        cases.push(v);
        let mut v = original.clone();
        v["charts"][0]["place"]["latitudeMicrodegrees"] = 42.into();
        cases.push(v);
        let mut v = original.clone();
        v["cursor"]["changeSeq"] = "9223372036854775808".into();
        cases.push(v);
        let mut v = original.clone();
        v["charts"][0]["newField"] = true.into();
        cases.push(v);
        let mut v = original.clone();
        v["charts"] = vec![original["charts"][0].clone(); 501].into();
        cases.push(v);
        for value in cases {
            assert!(matches!(
                fetch(&fake(&value), &verified, || now),
                Err(SnapshotError::Invalid)
            ));
        }
    }
    #[test]
    fn expiry_and_network_failures_never_return_a_snapshot() {
        let now = Instant::now();
        let verified = session(now);
        let mut client = fake(&sample());
        assert!(matches!(
            fetch(&client, &verified, || now + Duration::from_secs(60)),
            Err(SnapshotError::Expired)
        ));
        assert_eq!(client.calls.get(), 0);
        let n = Cell::new(0);
        assert!(matches!(
            fetch(&client, &verified, || {
                let i = n.get();
                n.set(i + 1);
                if i == 0 {
                    now
                } else {
                    now + Duration::from_secs(60)
                }
            }),
            Err(SnapshotError::Expired)
        ));
        client.fail = true;
        assert!(matches!(
            fetch(&client, &verified, || now),
            Err(SnapshotError::Network)
        ));
        client.fail = false;
        client.status = 401;
        assert!(matches!(
            fetch(&client, &verified, || now),
            Err(SnapshotError::Rejected)
        ));
        client.status = 200;
        client.content_type = "text/html";
        assert!(matches!(
            fetch(&client, &verified, || now),
            Err(SnapshotError::Invalid)
        ));
        client.content_type = "application/json";
        client.body = vec![b' '; MAX_SNAPSHOT_BYTES + 1];
        assert!(matches!(
            fetch(&client, &verified, || now),
            Err(SnapshotError::Invalid)
        ));
    }
}
