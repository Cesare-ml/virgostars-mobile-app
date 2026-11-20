# Android v1 — scope and implementation checkpoint

Status: **Prototype / incomplete**, 20 November 2026. The requested first
version keeps the existing features, adds account sign-in and chart sync and
dodecatemoria, improves the interface, then proceeds to Android publication
after the application and release gates are ready.

## Implemented in this working tree

- Elementi can show the available traditional planets' dodecatemoria using the
  existing shared calculation and selected house system. This is a local view;
  browser and unit tests do not constitute a physical-device or scientific test.
- The `android-login-experimental` Rust feature compiles isolated PKCE attempt,
  callback, token-exchange and session-verification primitives; it is off by default and registers no
  IPC or permissions. They generate random state/verifier and S256 challenge,
  check a one-use HTTPS callback and expiry, and validate a bounded token
  response using a fake transport. A returned grant is unverified until an authenticated session
  response matches the permitted scope and supplies a valid profile reference;
  the session check also uses a fake transport.
  The callback helper does not itself verify the app's domain. Rust harness
  tests and Android ARM64/x86_64 `cargo check` with both the normal app features
  and the experimental feature enabled passed;
  this is not an APK, device test, login or working synchronization.
- The separate, default-off `android-login-https-experimental` feature adds a
  native blocking HTTPS transport for the fixed token and session endpoints.
  It is not registered with Tauri, invoked by the app or exposed to the WebView;
  no real service request has been made. It limits response sizes and timeouts,
  checks certificates and hostnames, and disables redirects and automatic
  retries. A local synthetic TLS test checks rejection of untrusted certificates
  and mismatched hostnames as well as redirect handling.
  It currently embeds a pinned Mozilla root certificate snapshot: Android's
  platform verifier requires [additional initialization](https://docs.rs/rustls-platform-verifier/latest/rustls_platform_verifier/android/index.html).
  Platform trust behavior, revocation and certificate updates require a release
  decision and security review before activation. HTTP/TLS libraries may keep
  transient copies of sensitive values despite wiping owned request buffers.
- An experimental native snapshot reader, also off by default, uses only a
  verified session and checks that the snapshot cursor epoch matches that
  session's profile. It reads the fixed HTTPS snapshot endpoint with an 8 MiB
  cap, rejects duplicate IDs, unknown fields and unexpected notes, and keeps
  the accepted JSON unchanged, including unknown birth times or locations.
  Invalid, oversized or incompatible responses fail as a whole. It does not
  calculate UTC instants, write the local archive, synchronize changes or expose
  data through IPC. JSON parsing and HTTP/TLS may retain temporary copies in
  native memory. Semantic validation and lossless transactional conversion
  remain necessary before any future import. Tests use synthetic data only;
  no real account or service request has been exercised.
- The `android-snapshot-cache-experimental` feature adds a separate encrypted
  snapshot cache prototype. It checks the verified profile on read and write,
  rejects stale responses using a baseline captured before network I/O and a
  single-process lock, and
  preserves the previous ciphertext on failed or interrupted replacement. It
  does not create a key: the trusted native caller must supply an existing
  Keystore-backed archive key. Its per-profile hashed filenames are pseudonymous,
  and the same supplied device key can encrypt multiple profiles; this is not
  independent per-account key isolation. The module is not connected to app
  startup, IPC or Android Keystore. Possession of an unexpired in-memory
  session alone cannot establish that authorization remains active.
  An explicit offline access/revocation policy, safe key provisioning and
  device-level interrupted-write testing also remain open. The existing local
  chart archive is neither migrated nor changed by this prototype.
- The default-off `android-login-coordinator-experimental` feature connects the
  native PKCE attempt, token exchange, verified session, snapshot reader and
  encrypted cache. The coordinator rechecks the server session after download,
  verifies the same in-memory session is still current before committing and
  allows local sign-out during network I/O. A native Android browser launcher
  uses an ACTION_VIEW intent with a browser selector; this follows the
  [Android Intent selector contract](https://developer.android.com/reference/android/content/Intent#setSelector(android.content.Intent)).
  It has compiled for ARM64 and x86_64 but has not been run on a device. An
  integrated Rust test uses a synthetic browser and server to cover PKCE,
  profile binding, revocation, cache encryption and switching accounts during
  download. Local sign-out does not revoke the server grant. A revocation may
  still occur after the last server check, and the coordinator must be called
  on a native worker. This remains unregistered in the application: Android
  App Link configuration, the callback receiver, backend authorization, key
  provisioning and UI are not implemented by this checkpoint.
- The opt-in `npm run android:app-link:prepare` command patches only a compatible
  local Tauri-generated Android project with the candidate callback
  `https://virgostars.it/android/oauth/callback`. The Activity takes matching
  callbacks out of cold-start and warm-start intents before handing them to
  Tauri plugins, and exposes a one-use native queue for the Rust coordinator.
  It refuses unfamiliar generated Activity customizations. A local x86_64
  debug APK compiled with this Activity and its manifest contains the exact
  auto-verified filter; no emulator or physical-device callback test was run.
  The generated project is ignored, and running the preparation command neither
  configures the website's Digital Asset Links nor enables a backend redirect.
  Android/Java may retain transient String copies of the callback. The native
  queue bridge is not yet called by app commands or a user interface.

## Login and sync: remaining implementation

The currently deployed Desktop path is not sufficient to claim Android support.
The inspected backend candidate recognizes an Android client in its PKCE policy,
but bootstrap supplies no Android redirect; session, persistent refresh and
some write paths are restricted to Desktop. The Desktop candidate itself still
needs a real-account end-to-end check. Do not use its desktop client identity or
loopback redirect to bypass the Android restrictions.

The server also has an isolated, default-off Android session-handler candidate
on `codex/mobile-chart-sync-20261120`; its unit tests use synthetic actor
contexts and do not establish live authentication or account isolation. The
inspected chart-sync service provides snapshot/delta and chart-creation paths;
equivalent versioned update/delete paths for existing charts have not been
identified. Bidirectional editing or deletion must not be claimed until their
owner checks, conflict rules and end-to-end behavior are implemented and tested.

Before enabling the Android path:

1. Define the exact HTTPS App Link, Android package and release/debug signing
   certificate fingerprints. Configure and verify Android App Links and the
   site's Digital Asset Links on actual target devices; never put tokens in URLs.
2. Add server-side Android consent, session, refresh/revocation and the required
   owner-scoped chart operations with explicit authorization and tests. The
   candidate must remain off until staging, migration and rollout gates pass.
3. Implement native system-browser PKCE, cryptographically random one-use
   state/verifier, verified callback, integrate and review the HTTPS transport
   with a staging endpoint, Keystore-protected
   refresh credential and explicit revocation. No token, verifier or code crosses
   the WebView IPC boundary or enters logs.
4. Add encrypted per-account local isolation and transactional synchronization,
   including lossless existing-local-archive handling, pending operations,
   idempotent retries, remote changes, deletion semantics and conflict UI.
   Unknown or unsupported input must be surfaced without inventing birth data.
5. Test two accounts, account switching, offline and revoked sessions, failed
   writes, network ambiguity, conflict, restart, migration, DST and real-device
   App Link verification before calling the integration complete.

## Android release gate

The current local build uses privately approved glyphs not cleared for public
redistribution, while required ephemeris files are separately supplied. Resolve
asset and data distribution rights and provide a usable data-provisioning path;
perform Android accessibility, device, privacy and security checks; then prepare
the signed Play artifact and store listing with the maintainer. No publication
or signing is performed by this checkpoint.

Android's official guides describe [configuring App Links](https://developer.android.com/training/app-links/add-applinks)
and [verifying their domain association](https://developer.android.com/training/app-links/verify-applinks).
