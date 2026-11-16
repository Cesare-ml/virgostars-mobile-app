# VirgoStars Mobile — roadmap

Milestones reflect repository source status, not release status.

## M0 — Live current-sky prototype (feature branch)
- [x] Android-first Tauri 2 + Angular 20 + Rust source layout
- [x] Responsive live zodiac wheel opens on launch
- [x] Geocentric tropical ecliptic longitudes for Sun, Moon and eight planets
- [x] Refresh current instant and positions every 30 seconds while the app is open
- [x] Explicit calculation engine/frame metadata and no synthetic chart fallback
- [x] Minimal Tauri permissions and required Powered by VirgoStars attribution
- [x] Third-party MIT license notice for temporary Astronomy Engine provider
- [ ] Generate a genuine npm lockfile and run npm ci && npm run check
- [ ] Configure Android SDK/NDK/JDK, initialize Tauri Android project and run npm run android:build
- [ ] Smoke-test Android emulator and physical device

## M1 — Validated VirgoStars astronomy integration
- [ ] Validate the documented VirgoStars-Ephemeris Rust capabilities against independent JPL/NAIF references
- [ ] Agree on typed Rust/Tauri or WASM contract for UTC instant, geocentric body vectors, frame, corrections, units and provenance
- [ ] Parallel-run the temporary provider against approved reference vectors; publish documented error results
- [ ] Swap provider behind CurrentSkyService without changing the mobile UI
- [ ] Confirm permitted kernel/data packaging and license/provenance

## M2 — Location-aware chart
- [ ] Add explicit, foreground-only location consent and a manual location alternative
- [ ] Use astrological-functions contracts for Ascendant, MC and supported house systems
- [ ] Add topocentric/horizon presentation only after validated location/time/frame semantics and device QA

## M3 — Android beta and release gate
- [ ] Security, accessibility, performance and Google Play data-safety review
- [ ] Signed Android build, recovery and staged distribution (maintainer-only decision)
- [ ] Test offline startup, WebView recovery and representative devices

## M4 — iOS adaptation
- [ ] Generate iOS native target on macOS with Xcode
- [ ] Validate WKWebView rendering, lifecycle, secure storage and privacy prompts
- [ ] Signed iOS beta/release after explicit owner approval
