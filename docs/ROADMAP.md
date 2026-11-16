# VirgoStars Mobile — roadmap

Milestones represent intended work, not completed functionality.

## M0 — Android current-sky MVP foundation (in progress)
- [x] Android-first Tauri 2 + Angular 20 + Rust source layout
- [x] Single-screen current-sky experience
- [x] Versioned TypeScript current-sky input/snapshot contract
- [x] Runtime permission flow and one-shot foreground GPS bridge
- [x] GPS fix validation, timestamp, timezone, offset and observer metadata
- [x] Foreground refresh policy: GPS poll every 15 seconds, calculation at most once/minute, 250 m movement trigger and immediate refresh on resume
- [x] Typed native snapshot DTO and fail-closed command when no provider is linked
- [x] Contract and refresh-policy tests added (execution pending)
- [ ] Link a legally distributable, offline-capable astronomical provider behind the native interface
- [ ] Integrate verified astrological-functions semantics for zodiac, angles, house cusps and aspects
- [ ] Integrate the shared astrological-charts renderer after rights and mobile validation
- [ ] Add controlled reference vectors, dependency lockfile and independently run `npm run check`
- [ ] Build/install/test on Android emulator and physical device

## M1 — Verified chart calculation and rendering
- [ ] Provider implementation for current UTC instant + WGS84 observer
- [ ] Document and surface time scale, coordinate frame, zodiac/ayanamsa, house system, provider version and known approximations
- [ ] Verify planet positions, retrograde state, Ascendant/MC, 12 cusps and aspects against controlled reference vectors
- [ ] Validate renderer touch gestures, DPI, memory and WebView/WebGL restoration on Android
- [ ] Test multiple times/locations and timezone/DST boundaries
- [ ] Fail closed on unsupported dates, missing kernels, unsupported frames and invalid results

## Explicitly out of scope
- Login, accounts, server synchronization and profile storage
- Birth-chart entry, archive/history, interpretations, AI, transits, notifications and widgets
- iOS native setup or distribution

The Android MVP is accepted only when an actual current-sky chart is calculated locally and rendered by the shared renderer. A successful UI build, synthetic fixture or native probe alone is not acceptance.
