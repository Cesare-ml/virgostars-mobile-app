# VirgoStars Mobile — roadmap

Milestones represent intended work, not completed functionality.

Le proposte relative alle API e ai sensori nativi sono raccolte in [Native Astrologer Toolkit](NATIVE_ASTROLOGER_TOOLKIT.md); il documento distingue le funzioni progettate dalle integrazioni già realizzate.

## M0 — Bootstrap
- [x] Android-first Tauri 2 + Angular 20 + Rust source layout
- [x] Mobile-first navigation, accessibility and visible attribution
- [x] Minimal native runtime contract and source checks
- [x] Explicitly documented astronomy-provider boundary

## M1 — Android live-sky MVP (implementation in progress)
- [x] Single live-sky screen with current-time chart and planet-position list
- [x] Temporary MIT astronomy provider isolated behind `SkyChartService`
- [x] Official Tauri geolocation plugin with explicit Android runtime permission request
- [x] Manual coordinate fallback; no account, storage, telemetry or network calls
- [ ] Run `npm run check` and resolve compile/test issues on a configured toolchain
- [ ] Generate Android project and verify build with SDK/NDK/JDK
- [ ] Android emulator and physical-device permission/GPS smoke test
- [ ] Validate positions, Ascendant and Whole Sign houses against independent reference fixtures
- [ ] Replace temporary provider with validated VirgoStars Rust bindings once available
- [ ] Integrate the shared renderer only after source licensing and mobile runtime review
- [ ] Low-memory, dark-mode, portrait/landscape device tests

## M2 — Local-first private archive
- [ ] Design versioned SQLite schema, migration/rollback and OS-backed encryption/key storage
- [ ] OAuth2 Authorization Code + PKCE via system browser, account-aware device binding
- [ ] Verified offline unlock policy and explicit revocation limitations
- [ ] Transactional outbox, idempotency, cursor sync and conflict UI with server-owned authorization
- [ ] Tests for account isolation, crash recovery, DST and exact time/location preservation

## M3 — Android beta and release gate
- [ ] Security, accessibility, performance and Play Store/data-safety review
- [ ] Signed Android build, recovery and staged distribution (maintainer-only decision)
- [ ] Offline and network-failure QA on real low-end and high-end phones

## M4 — iOS adaptation
- [ ] Generate iOS native target on macOS with Xcode
- [ ] Validate WKWebView rendering, gestures, secure keychain, background restrictions and offline persistence
- [ ] Review iOS-specific privacy entitlements, Apple sign-in rules and distribution signing
- [ ] Signed iOS beta/release after explicit owner approval
