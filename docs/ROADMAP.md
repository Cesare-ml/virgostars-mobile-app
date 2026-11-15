# VirgoStars Mobile — roadmap

Milestones represent intended work, not completed functionality.

## M0 — Bootstrap (this repository state)
- [x] Android-first Tauri 2 + Angular 20 + Rust source layout
- [x] Mobile-first responsive navigation, Italian/English, attribution notice
- [x] Non-sensitive read-only native `runtime_info` contract
- [x] Explicit synthetic/illustrative state (no fake natal calculations)
- [x] Minimal security configuration and source contract tests
- [ ] Dependency lockfile and independently verified `npm run check` build
- [ ] Android toolchain initialized, physical/emulator smoke test

## Native toolkit priorities (cross-milestone)
- [x] Define opt-in UTC reminder and user-confirmed calendar draft contracts (pure planning, no OS scheduling)
- [ ] Integrate actual native notification scheduling (best-effort) with permission prompts and Android 14+ exact-alarm fallback
- [ ] Add Android lunar/next-event/planetary-hour home widget from **verified** cached data
- [ ] Android calendar ACTION_INSERT flow with explicit user confirmation; no automatic calendar modification
- [ ] Validate native biometric key-unlock and encrypted profile archive
- [ ] Export redacted chart PNG/PDF to native share sheet and printer
- [ ] Add consent-based chart-attached consultation voice notes; avoid background microphone
- [ ] Research validated compass sensor/celestial direction with calibration warnings
- [ ] Consider wearable, NFC and haptics only after Android native build and core validation
- [ ] iOS WidgetKit/App Intents parity after Android baseline

See [Native Astrologer Toolkit](NATIVE_ASTROLOGER_TOOLKIT.md). Features are **planned**, not production integrations.

## M1 — Android demo with legitimate computed charts
- [ ] Validate `astrological-charts` touch gestures, DPI, memory and WebGL restoration
- [ ] Share `astrological-functions` typed DTOs and contract vectors
- [ ] Integrate independently validated Rust ephemeris adapter; preserve astronomy provenance and tests
- [ ] Use only permitted synthetic/sample assets and accurately report method limits
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
