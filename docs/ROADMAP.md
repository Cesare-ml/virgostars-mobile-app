# VirgoStars Mobile — roadmap

Milestones represent intended work, not completed functionality.

Desktop Lab 0.0.1 is the functional parity target; see [DESKTOP_PARITY.md](DESKTOP_PARITY.md) for the current comparison and dependencies. Parity is not complete.

The agreed first Android release scope and current sign-in/sync blockers are tracked in [Android v1 checkpoint](ANDROID_V1_CHECKPOINT.md).

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
Prototype: VirgoStars-Ephemeris provider, manual DE441/USNO/Chiron import and update, shared Functions adapter and Charts renderer with open-font glyphs and synthetic fallback artwork integrated. Automated data delivery, independent scientific validation and physical-device rendering remain open.
- [ ] Validate `astrological-charts` touch gestures, DPI, memory and WebGL restoration
  - Emulator smoke: house-system change, landscape state preservation and simulated WebGL loss/restoration passed; touch, memory and physical-device testing remain open.
  - The result list shows signs, truncated degrees, retrograde marks and houses; one emulator case confirmed synchronization after changing house systems and navigating away and back.
  - One Android emulator touch on the Sun glyph selected/deselected it; list selection persisted across navigation, house redraw and simulated WebGL recovery. Full touch and accessibility coverage remains open.
- [ ] Share `astrological-functions` typed DTOs and contract vectors
- [ ] Independently validate the integrated Rust ephemeris adapter and data provisioning; preserve astronomy provenance and tests
- [ ] Use only permitted synthetic/sample assets and accurately report method limits
- [ ] Low-memory, dark-mode, portrait/landscape device tests

## M2 — Local-first private archive
- [x] Implement experimental Android device-only encrypted chart archive and OS-backed wrapped key; desktop legacy import is disabled
- [ ] Validate physical devices, interrupted writes, upgrades, key loss and any future migration/recovery policy before release
- [ ] OAuth2 Authorization Code + PKCE via system browser, account-aware device binding
- [ ] Verified offline unlock policy and explicit revocation limitations
- [ ] Transactional outbox, idempotency, cursor sync and conflict UI with server-owned authorization
- [ ] Tests for account isolation, crash recovery, DST and exact time/location preservation

## M3 — Android beta and release gate
- [ ] Security, accessibility, performance and Play Store/data-safety review
- [ ] Signed Android build, recovery and staged distribution (maintainer-only decision)
- [ ] Offline and network-failure QA on real low-end and high-end phones

## M4 — iOS adaptation
- [x] Configure an opt-in GitHub Actions macOS iOS build with synthetic/open-font preview assets (configuration only, not a passing native build)
- [x] Generate an iOS native target and compile an unsigned simulator `.app` in GitHub Actions macOS/Xcode; first run [44795768102](https://github.com/Cesare-ml/virgostars-mobile-app/actions/runs/44795768102) passed on 2026-11-20
- [ ] Install/launch the generated app in an Apple Simulator and perform a functional smoke test
- [ ] Validate WKWebView rendering, gestures, secure keychain, background restrictions and offline persistence
- [ ] Review iOS-specific privacy entitlements, Apple sign-in rules and distribution signing
- [ ] Signed iOS beta/release after explicit owner approval
