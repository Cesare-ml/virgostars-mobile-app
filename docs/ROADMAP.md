# VirgoStars Mobile — roadmap

Milestones represent intended work, not completed functionality.

Le proposte relative alle API e ai sensori nativi sono raccolte in [Native Astrologer Toolkit](NATIVE_ASTROLOGER_TOOLKIT.md); il documento distingue le funzioni progettate dalle integrazioni già realizzate.

## M0 — Bootstrap (this repository state)
- [x] Android-first Tauri 2 + Angular 20 + Rust source layout
- [x] Mobile-first responsive navigation, Italian/English, attribution notice
- [x] Non-sensitive read-only native `runtime_info` contract
- [x] Explicit synthetic/illustrative state (no fake natal calculations)
- [x] Minimal security configuration and source contract tests
- [ ] Dependency lockfile and independently verified `npm run check` build
- [ ] Android toolchain initialized, physical/emulator smoke test

## M1 — Android demo with legitimate computed charts
Prototype: local Swiss provider, Functions adapter and Charts renderer with open-font glyphs and synthetic fallback artwork integrated; browser mock smoke, ARM64 build and x86_64 Android emulator smoke completed, including offline calculation and synthetic chart rendering. Physical-device rendering and scientific validation remain open.
- [ ] Validate `astrological-charts` touch gestures, DPI, memory and WebGL restoration
  - Emulator smoke: house-system change, landscape state preservation and simulated WebGL loss/restoration passed; touch, memory and physical-device testing remain open.
  - The result list shows signs, truncated degrees, retrograde marks and houses; one emulator case confirmed synchronization after changing house systems and navigating away and back.
  - One Android emulator touch on the Sun glyph selected/deselected it; list selection persisted across navigation, house redraw and simulated WebGL recovery. Full touch and accessibility coverage remains open.
- [ ] Share `astrological-functions` typed DTOs and contract vectors
- [ ] Integrate independently validated Rust ephemeris adapter; preserve astronomy provenance and tests
  - [x] Source/contract prototype: local DE441 pack inventory, chunked import, SHA-256 verification and removal in app-private storage
  - [ ] Compile and device-test native pack import on Android; interrupted file picker/transfer/storage rollback
  - [ ] Review redistribution rights and independent JPL/NASA reference vectors before enabling download hosting
  - [ ] Connect the canonical VirgoStars-Ephemeris pack reader to `calculate_chart` with validated mobile bindings
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
