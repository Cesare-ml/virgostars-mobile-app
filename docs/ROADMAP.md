# VirgoStars Mobile — roadmap

Milestones represent intended work, not completed functionality.

## M0 — Bootstrap (this repository state)
- [x] Android-first Tauri 2 + Angular 20 + Rust source layout
- [x] Mobile-first responsive navigation, Italian/English, attribution notice
- [x] Non-sensitive read-only native `runtime_info` contract
- [x] Explicit synthetic/illustrative state (no fake natal calculations)
- [x] Minimal security configuration and source contract tests
- [x] Read-only prerequisite doctor with mock-based unit coverage
- [ ] Dependency lockfile and independently verified `npm run check` build
- [ ] Android toolchain initialized, physical/emulator smoke test

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
