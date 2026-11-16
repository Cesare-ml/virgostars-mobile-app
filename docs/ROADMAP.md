# VirgoStars Mobile — roadmap

Milestones represent intended work, not completed functionality.

## M0 — Bootstrap
- [x] Android-first Tauri 2 + Angular 20 + Rust source layout
- [x] Mobile-first UI and Italian/English
- [x] Read-only, non-sensitive native `runtime_info` contract
- [x] CPAL attribution and minimal permission surface
- [ ] Dependency lockfile and independently verified `npm run check`
- [ ] Android toolchain initialized and emulator/device smoke test

## M1 — Current-sky MVP (source implemented; validation pending)
- [x] Launch directly on the current-sky planetary chart
- [x] Calculate Sun, Moon and eight planets locally from current UTC instant
- [x] Show geocentric true-ecliptic-of-date tropical zodiac positions
- [x] Refresh planetary positions every 60 seconds and clock every second
- [x] Surface calculation method and omit unsupported houses/angles
- [ ] Run all Node contract tests and Angular production compilation
- [ ] Generate Android project and verify unsigned build
- [ ] Physical Android smoke: cold launch, 60-second refresh, timezone/DST, background/resume
- [ ] Independent numerical verification of the temporary provider against trusted reference vectors
- [ ] Replace temporary provider with validated VirgoStars-Ephemeris adapter when UTC/time-scale and apparent-position contracts are ready
- [ ] Add observer location and validated ASC/MC/house pipeline only after privacy UX and astrological-functions contracts are ready
- [ ] Validate shared `astrological-charts` renderer on Android before adoption

## M2 — Local-first private archive (out of MVP scope)
- [ ] Versioned encrypted SQLite schema, migration/rollback and OS-backed key storage
- [ ] OAuth2 Authorization Code + PKCE via system browser
- [ ] Profile-owned data, transactional outbox and conflict-safe sync
- [ ] Explicit offline unlock, revocation, device-loss and deletion semantics

## M3 — Android beta and release gate
- [ ] Security, accessibility, performance and Play Store/data-safety review
- [ ] Signed Android build and staged distribution after maintainer approval
- [ ] Network-failure, low-memory, orientation, dark-mode and accessibility QA

## M4 — iOS adaptation
- [ ] Generate iOS native target on macOS with Xcode
- [ ] Validate WKWebView, secure keychain, background restrictions and persistence
- [ ] Review iOS privacy entitlements and distribution signing
