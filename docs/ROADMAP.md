# VirgoStars Mobile — roadmap

Milestones represent intended work, not completed functionality.

## M0 — Bootstrap
- [x] Android-first Tauri 2 + Angular 20 + Rust source layout
- [x] Responsive mobile shell, Italian/English, attribution
- [x] Non-sensitive read-only native runtime probe

## M1 — Live-sky Android MVP
- [x] App opens directly on the live chart screen
- [x] Local calculation of Sun, Moon and eight planets in tropical geocentric ecliptic-of-date coordinates using a temporary MIT provider
- [x] Zodiac wheel and per-body longitude/sign list
- [x] Refresh every 30 seconds; no account, backend, personal data or network
- [x] Replaceable provider boundary for VirgoStars-Ephemeris migration
- [ ] Lockfile and independently recorded local npm run check
- [ ] Android toolchain initialization and APK/AAB build on configured machine
- [ ] Physical device/emulator smoke test and low-memory/WebView lifecycle check

## M2 — Canonical astronomy migration
- [ ] Stable VirgoStars-Ephemeris Rust API and Android-compatible packaging
- [ ] Independently validate real kernel vectors and app-facing coordinate conventions
- [ ] Replace temporary provider with the Rust canonical adapter
- [ ] Regression vectors for Sun/Moon/planets, UTC boundaries and DST
- [ ] Consider location, Ascendant and houses only after explicit permission UX and tested house contracts

## M3 — Android release gate
- [ ] Accuracy/reproducibility review, accessibility and performance QA
- [ ] Security, dependency/license and Play Store data-safety review
- [ ] Signed Android build, recovery and staged distribution (maintainer-only decision)

## M4 — iOS adaptation
- [ ] Generate iOS native target on macOS with Xcode
- [ ] Validate WKWebView rendering and lifecycle separately
- [ ] Review iOS privacy prompts and distribution signing
