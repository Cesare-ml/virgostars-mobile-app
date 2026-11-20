//! Opt-in, native-only HTTPS transport for the experimental account flow.
//! It is not registered with Tauri or called by the application. Blocking
//! methods must run on a dedicated native worker, never the UI/async runtime.
use crate::android_chart_snapshot::{
    SnapshotResponse, SnapshotTransport, MAX_SNAPSHOT_BYTES, SNAPSHOT_ENDPOINT,
};
use crate::android_connected_session::{SessionResponse, SessionTransport, SESSION_ENDPOINT};
use crate::android_token_exchange::{
    plausible_bearer, TokenResponse, TokenTransport, TOKEN_ENDPOINT,
};
use reqwest::blocking::{Body, Client, Response};
use reqwest::header::{HeaderValue, ACCEPT, AUTHORIZATION, CONTENT_TYPE};
use reqwest::redirect::Policy;
use std::io::{self, Read};
use std::sync::Arc;
use std::time::Duration;
use zeroize::Zeroizing;

const MAX_FORM: usize = 2048;
const MAX_TOKEN_RESPONSE: usize = 8192;
const MAX_SESSION_RESPONSE: usize = 4096;
const MAX_CONTENT_TYPE: usize = 64;
const MAX_TIMEOUT: Duration = Duration::from_secs(10);

fn client(timeout: Duration) -> Result<Client, ()> {
    if timeout.is_zero() || timeout > MAX_TIMEOUT {
        return Err(());
    }
    // This experimental client uses a pinned Mozilla root snapshot. Android's
    // platform verifier requires separate native initialization and packaging;
    // evaluate that path and root updates before any release activation.
    let mut roots = rustls::RootCertStore::empty();
    let (added, rejected) =
        roots.add_parsable_certificates(webpki_root_certs::TLS_SERVER_ROOT_CERTS.iter().cloned());
    if added == 0 || rejected != 0 {
        return Err(());
    }
    client_with_roots(timeout, roots)
}

fn client_with_roots(timeout: Duration, roots: rustls::RootCertStore) -> Result<Client, ()> {
    if timeout.is_zero() || timeout > MAX_TIMEOUT {
        return Err(());
    }
    let tls = rustls::ClientConfig::builder_with_provider(Arc::new(
        rustls::crypto::ring::default_provider(),
    ))
    .with_safe_default_protocol_versions()
    .map_err(|_| ())?
    .with_root_certificates(roots)
    .with_no_client_auth();
    Client::builder()
        .https_only(true)
        .tls_backend_preconfigured(tls)
        .redirect(Policy::none())
        .retry(reqwest::retry::never())
        .no_proxy()
        .referer(false)
        .no_gzip()
        .no_brotli()
        .no_deflate()
        .no_zstd()
        .timeout(timeout)
        .connect_timeout(timeout)
        .build()
        .map_err(|_| ())
}

/// This owned request buffer is wiped when dropped. HTTP/TLS libraries may
/// make transient internal copies that cannot be guaranteed to be zeroized.
struct SecretReader {
    bytes: Zeroizing<Vec<u8>>,
    offset: usize,
}
impl SecretReader {
    fn new(body: &str) -> Self {
        Self {
            bytes: Zeroizing::new(body.as_bytes().to_vec()),
            offset: 0,
        }
    }
}
impl Read for SecretReader {
    fn read(&mut self, out: &mut [u8]) -> io::Result<usize> {
        let count = out.len().min(self.bytes.len() - self.offset);
        out[..count].copy_from_slice(&self.bytes[self.offset..self.offset + count]);
        self.offset += count;
        Ok(count)
    }
}

fn bounded_read(reader: impl Read, max: usize) -> Result<Vec<u8>, ()> {
    let mut bytes = Zeroizing::new(Vec::with_capacity(max.min(4096)));
    reader
        .take((max + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| ())?;
    if bytes.len() > max {
        return Err(());
    }
    Ok(std::mem::take(&mut *bytes))
}

/// A non-200 response is returned without reading its potentially sensitive
/// body. Success responses are bounded by both header and actual stream size.
fn response_parts(response: Response, max: usize) -> Result<(u16, String, Vec<u8>), ()> {
    let status = response.status().as_u16();
    if status != 200 {
        return Ok((status, String::new(), Vec::new()));
    }
    if response.content_length().is_some_and(|n| n > max as u64) {
        return Err(());
    }
    let content_type = response.headers().get(CONTENT_TYPE).ok_or(())?.as_bytes();
    if content_type.len() > MAX_CONTENT_TYPE {
        return Err(());
    }
    let content_type = std::str::from_utf8(content_type)
        .map_err(|_| ())?
        .to_owned();
    Ok((status, content_type, bounded_read(response, max)?))
}

/// Constructed by trusted native code only; no URLs or credentials are
/// accepted from a WebView. Each request receives a fresh restricted client.
pub(crate) struct AndroidHttpsTransport;
impl TokenTransport for AndroidHttpsTransport {
    fn post_form(
        &self,
        endpoint: &str,
        body: &str,
        timeout: Duration,
        max_bytes: usize,
    ) -> Result<TokenResponse, ()> {
        if endpoint != TOKEN_ENDPOINT
            || body.is_empty()
            || body.len() > MAX_FORM
            || max_bytes == 0
            || max_bytes > MAX_TOKEN_RESPONSE
        {
            return Err(());
        }
        let response = client(timeout)?
            .post(TOKEN_ENDPOINT)
            .header(ACCEPT, "application/json")
            .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
            .body(Body::sized(SecretReader::new(body), body.len() as u64))
            .send()
            .map_err(|_| ())?;
        let (status, content_type, body) = response_parts(response, max_bytes)?;
        Ok(TokenResponse {
            status,
            content_type,
            body,
        })
    }
}
impl SessionTransport for AndroidHttpsTransport {
    fn get_session(
        &self,
        endpoint: &str,
        bearer: &str,
        timeout: Duration,
        max_bytes: usize,
    ) -> Result<SessionResponse, ()> {
        if endpoint != SESSION_ENDPOINT
            || !plausible_bearer(bearer)
            || max_bytes == 0
            || max_bytes > MAX_SESSION_RESPONSE
        {
            return Err(());
        }
        let text = Zeroizing::new(format!("Bearer {bearer}"));
        let mut auth = HeaderValue::from_str(&text).map_err(|_| ())?;
        auth.set_sensitive(true);
        let response = client(timeout)?
            .get(SESSION_ENDPOINT)
            .header(ACCEPT, "application/json")
            .header(AUTHORIZATION, auth)
            .send()
            .map_err(|_| ())?;
        let (status, content_type, body) = response_parts(response, max_bytes)?;
        Ok(SessionResponse {
            status,
            content_type,
            body,
        })
    }
}

impl SnapshotTransport for AndroidHttpsTransport {
    fn get_snapshot(
        &self,
        endpoint: &str,
        bearer: &str,
        timeout: Duration,
        max_bytes: usize,
    ) -> Result<SnapshotResponse, ()> {
        if endpoint != SNAPSHOT_ENDPOINT
            || !plausible_bearer(bearer)
            || max_bytes == 0
            || max_bytes > MAX_SNAPSHOT_BYTES
        {
            return Err(());
        }
        let text = Zeroizing::new(format!("Bearer {bearer}"));
        let mut auth = HeaderValue::from_str(&text).map_err(|_| ())?;
        auth.set_sensitive(true);
        let response = client(timeout)?
            .get(SNAPSHOT_ENDPOINT)
            .header(ACCEPT, "application/json")
            .header(AUTHORIZATION, auth)
            .send()
            .map_err(|_| ())?;
        let (status, content_type, body) = response_parts(response, max_bytes)?;
        Ok(SnapshotResponse {
            status,
            content_type,
            body,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    use std::net::TcpListener;

    #[test]
    fn rejects_untrusted_targets_and_invalid_limits_before_network() {
        let transport = AndroidHttpsTransport;
        for endpoint in [
            "http://api.virgostars.it/chart-sync/v1/token",
            "https://api.virgostars.it.evil.test/chart-sync/v1/token",
            "https://api.virgostars.it/chart-sync/v1/token?next=evil",
            SESSION_ENDPOINT,
        ] {
            assert!(transport
                .post_form(endpoint, "x", MAX_TIMEOUT, MAX_TOKEN_RESPONSE)
                .is_err());
        }
        assert!(transport
            .post_form(TOKEN_ENDPOINT, "", MAX_TIMEOUT, MAX_TOKEN_RESPONSE)
            .is_err());
        assert!(transport
            .post_form(
                TOKEN_ENDPOINT,
                &"x".repeat(MAX_FORM + 1),
                MAX_TIMEOUT,
                MAX_TOKEN_RESPONSE
            )
            .is_err());
        assert!(transport
            .post_form(TOKEN_ENDPOINT, "x", Duration::ZERO, MAX_TOKEN_RESPONSE)
            .is_err());
        assert!(transport
            .post_form(TOKEN_ENDPOINT, "x", MAX_TIMEOUT, MAX_TOKEN_RESPONSE + 1)
            .is_err());
        assert!(transport
            .get_session(TOKEN_ENDPOINT, "x", MAX_TIMEOUT, MAX_SESSION_RESPONSE)
            .is_err());
        assert!(transport
            .get_session(
                SESSION_ENDPOINT,
                "x\r\nInjected: x",
                MAX_TIMEOUT,
                MAX_SESSION_RESPONSE
            )
            .is_err());
        assert!(transport
            .get_snapshot(
                "https://evil.test/snapshot",
                "synthetic.bearer.token",
                MAX_TIMEOUT,
                MAX_SNAPSHOT_BYTES
            )
            .is_err());
        assert!(transport
            .get_snapshot(
                SNAPSHOT_ENDPOINT,
                "invalid\r\nheader",
                MAX_TIMEOUT,
                MAX_SNAPSHOT_BYTES
            )
            .is_err());
        assert!(transport
            .get_snapshot(
                SNAPSHOT_ENDPOINT,
                "synthetic.bearer.token",
                MAX_TIMEOUT,
                MAX_SNAPSHOT_BYTES + 1
            )
            .is_err());
    }

    #[test]
    fn caps_the_stream_even_without_a_content_length() {
        assert_eq!(bounded_read(Cursor::new(b"abcd"), 4).unwrap(), b"abcd");
        assert!(bounded_read(Cursor::new(b"abcde"), 4).is_err());
        let mut reader = SecretReader::new("abc");
        let mut output = [0; 2];
        assert_eq!(reader.read(&mut output).unwrap(), 2);
        assert_eq!(&output, b"ab");
        assert_eq!(reader.read(&mut output).unwrap(), 1);
        assert_eq!(output[0], b'c');
        assert_eq!(reader.read(&mut output).unwrap(), 0);
    }

    #[test]
    fn client_never_connects_to_plain_http() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let url = format!("http://{}/", listener.local_addr().unwrap());
        assert!(client(Duration::from_millis(250))
            .unwrap()
            .get(url)
            .send()
            .is_err());
        assert_eq!(
            listener.accept().err().unwrap().kind(),
            io::ErrorKind::WouldBlock
        );
    }

    /// Generates an ephemeral test certificate/key locally; nothing is stored
    /// in Git. Run explicitly on machines with OpenSSL in PATH.
    #[test]
    #[ignore = "requires local OpenSSL to generate an ephemeral TLS fixture"]
    fn local_tls_rejects_unknown_certificates_and_does_not_follow_redirects() {
        use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
        use std::fs;
        use std::io::{Read, Write};
        use std::path::PathBuf;
        use std::process::{Command, Stdio};
        use std::thread;
        use std::time::{SystemTime, UNIX_EPOCH};

        struct Fixture(PathBuf);
        impl Drop for Fixture {
            fn drop(&mut self) {
                for name in ["key.pem", "cert.pem", "key.der", "cert.der"] {
                    let _ = fs::remove_file(self.0.join(name));
                }
                let _ = fs::remove_dir(&self.0);
            }
        }
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "virgostars-tls-test-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir(&directory).unwrap();
        let fixture = Fixture(directory);
        let run = |args: &[&str]| {
            let status = Command::new("openssl")
                .args(args)
                .current_dir(&fixture.0)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .expect("OpenSSL is required for this explicit test");
            assert!(status.success(), "OpenSSL fixture generation failed");
        };
        run(&[
            "req",
            "-x509",
            "-newkey",
            "ec",
            "-pkeyopt",
            "ec_paramgen_curve:P-256",
            "-nodes",
            "-keyout",
            "key.pem",
            "-out",
            "cert.pem",
            "-subj",
            "/CN=localhost",
            "-days",
            "1",
            "-addext",
            "subjectAltName=DNS:localhost",
            "-addext",
            "basicConstraints=critical,CA:FALSE",
        ]);
        run(&[
            "x509", "-in", "cert.pem", "-outform", "DER", "-out", "cert.der",
        ]);
        run(&[
            "pkcs8", "-topk8", "-nocrypt", "-in", "key.pem", "-outform", "DER", "-out", "key.der",
        ]);
        let cert = CertificateDer::from(fs::read(fixture.0.join("cert.der")).unwrap());
        let key = PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(
            fs::read(fixture.0.join("key.der")).unwrap(),
        ));
        let server = Arc::new(
            rustls::ServerConfig::builder_with_provider(Arc::new(
                rustls::crypto::ring::default_provider(),
            ))
            .with_safe_default_protocol_versions()
            .unwrap()
            .with_no_client_auth()
            .with_single_cert(vec![cert.clone()], key)
            .unwrap(),
        );

        fn serve(
            config: Arc<rustls::ServerConfig>,
            reply: &'static [u8],
        ) -> (u16, thread::JoinHandle<()>) {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            listener.set_nonblocking(true).unwrap();
            let port = listener.local_addr().unwrap().port();
            let task = thread::spawn(move || {
                let deadline = std::time::Instant::now() + Duration::from_secs(4);
                loop {
                    match listener.accept() {
                        Ok((socket, _)) => {
                            socket.set_nonblocking(false).unwrap();
                            socket
                                .set_read_timeout(Some(Duration::from_secs(2)))
                                .unwrap();
                            socket
                                .set_write_timeout(Some(Duration::from_secs(2)))
                                .unwrap();
                            let connection = rustls::ServerConnection::new(config).unwrap();
                            let mut stream = rustls::StreamOwned::new(connection, socket);
                            let mut request = [0u8; 2048];
                            if stream.read(&mut request).is_ok() {
                                let _ = stream.write_all(reply);
                                let _ = stream.flush();
                            }
                            break;
                        }
                        Err(error)
                            if error.kind() == io::ErrorKind::WouldBlock
                                && std::time::Instant::now() < deadline =>
                        {
                            thread::sleep(Duration::from_millis(10))
                        }
                        _ => break,
                    }
                }
            });
            (port, task)
        }

        let (port, task) = serve(
            server.clone(),
            b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n",
        );
        assert!(client(Duration::from_secs(3))
            .unwrap()
            .get(format!("https://localhost:{port}/"))
            .send()
            .is_err());
        task.join().unwrap();

        let mut trusted = rustls::RootCertStore::empty();
        trusted.add(cert).unwrap();
        let client = client_with_roots(Duration::from_secs(3), trusted.clone()).unwrap();
        let (port, task) = serve(
            server.clone(),
            b"HTTP/1.1 302 Found\r\nLocation: https://127.0.0.1:9/\r\nContent-Length: 0\r\n\r\n",
        );
        assert_eq!(
            client
                .get(format!("https://localhost:{port}/"))
                .send()
                .unwrap()
                .status()
                .as_u16(),
            302
        );
        task.join().unwrap();

        let (port, task) = serve(server, b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n");
        assert!(client_with_roots(Duration::from_secs(3), trusted)
            .unwrap()
            .get(format!("https://127.0.0.1:{port}/"))
            .send()
            .is_err());
        task.join().unwrap();
    }
}
