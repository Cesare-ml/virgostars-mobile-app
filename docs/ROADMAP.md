# VirgoStars Mobile — roadmap

Milestones represent intended work, not completed functionality.

## M0 — Android current-sky MVP foundation (in progress)
- [x] Android-first Tauri 2 + Angular 20 + Rust source layout
- [x] Single-screen product shell: current sky as the initial experience
- [x] Versioned TypeScript current-sky input/snapshot contracts
- [x] Runtime permission flow and one-shot foreground GPS bridge
- [x] GPS fix validation, timestamp/timezone/offset and observer metadata
- [x] Foreground refresh policy: 15-second location polling, calculation at most once/minute, 250 m movement trigger, immediate refresh on resume
- [x] Fail-closed native calculation command: no synthetic result when provider is absent
- [x] Contract and refresh-policy tests
- [ ] Integrate a legally distributable, offline-capable astronomical provider behind the native provider interface
- [ ] Integrate tested astrological-functions semantics for zodiac, angles, house cusps and aspects
- [ ] Integrate the shared astrological-charts renderer after permission/provenance review
- [ ] Real vectors, build lockfile, npm run check and Android APK/device verification

## M1 — Verified chart calculation and rendering
- [ ] Provider implementation for current UTC instant + WGS84 observer
- [ ] Document and surface time scale, coordinate frame, zodiac/ayanamsa, house system, provider version and known approximations
- [ ] Verify planet positions, retrograde state, Ascendant/MC, 12 cusps and aspects against controlled reference vectors
- [ ] Validate renderer touch gestures, DPI, memory and WebView/WebGL restoration on Android
- [ ] Test multiple times/locations and timezone/DST boundaries
- [ ] Fail closed on unsupported dates, missing kernels, unsupported frames and invalid results

## M2 — Android build and device acceptance
- [ ] Reproducible dependency lockfile and clean-checkout npm run check
- [ ] Initialize Tauri Android project using documented SDK/JDK/NDK versions
- [ ] Build/install/launch on emulator and physical Android device
- [ ] Verify denied/revoked/approximate location, no-fix, timeout, foreground/resume and movement
- [ ] Record actual build logs and device/toolchain versions; do not claim an APK until verified

## Explicitly out of scope for this MVP
- Login, accounts, server synchronization and profile storage
- Birth-chart entry, archive/history, interpretations, AI, transits, notifications and widgets
- iOS native setup or distribution

The Android MVP is accepted only when the actual current-sky chart is computed locally and rendered by the shared renderer. A successful UI build, synthetic fixture or native probe alone is not acceptance.
