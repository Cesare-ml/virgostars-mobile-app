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
  response using a fake transport. The token endpoint in this isolated contract
  is the existing production URL; there is no actual HTTP implementation and no
  request is made. A returned grant is unverified until an authenticated session
  response matches the permitted scope and supplies a valid profile reference;
  the session check also uses a fake transport.
  The callback helper does not itself verify the app's domain. Rust harness
  tests and Android ARM64/x86_64 `cargo check` with both the normal app features
  and the experimental feature enabled passed;
  this is not an APK, device test, login or working synchronization.

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
   state/verifier, verified callback, a real bounded HTTPS transport with a
   staging endpoint, Keystore-protected
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
