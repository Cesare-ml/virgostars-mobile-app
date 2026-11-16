# VirgoStars Mobile — roadmap

The target MVP is a single Android screen showing the real current-sky chart for the device location and current instant.

## M0 — Current-sky app shell

- [x] Android-first Tauri 2 + Angular 20 + Rust source layout
- [x] Single-purpose current-sky screen at app launch; remove demo chart and unrelated navigation
- [x] Foreground-only location request with explicit permission and failure states
- [x] Versioned typed Rust IPC request/response and provider interface
- [x] UTC instant, IANA timezone, coordinates and GPS accuracy carried through the request
- [x] Fail-closed behavior when the ephemeris provider is missing
- [x] Foreground-resume refresh and bounded refresh path for a renderable chart
- [ ] Genuine package lockfile, clean npm ci, contract tests and Angular production build
- [ ] Android initialization, emulator build and physical-device smoke test

## M1 — Real current-sky chart (MVP acceptance)

- [ ] Clear temporary Swiss Ephemeris distribution/licensing, or wait for a legally distributable VirgoStars provider
- [ ] Implement and register the Rust CurrentSkyProvider; no Swiss code/binary before rights approval
- [ ] Define typed DTOs from astrological-functions for positions, houses, axes and aspects; add contract vectors
- [ ] Clear redistribution rights for astrological-charts and its third-party assets
- [ ] Render the real computed chart full-screen with touch-friendly glyphs, houses, axes and supported aspects
- [ ] Verify reference vectors across multiple instants/locations, UTC/DST boundaries and coordinate modes
- [ ] Verify foreground refresh and immediate resume refresh without stale chart display
- [ ] Test denied/revoked permission, unavailable GPS, stale fixes and engine/renderer failures
- [ ] Run on Android emulator and physical device; record SDK/JDK/NDK/device versions and evidence

## M2 — Release gate (outside this MVP)

- [ ] Privacy, accessibility, low-memory and offline QA
- [ ] Decide whether Swiss fallback remains development-only or is removed from release
- [ ] Reproducible signed Android release and Google Play review, only with separate maintainer approval

## Explicitly out of scope

Login, server sync, personal profiles, archive/history, personal birth charts, interpretations, transits, notifications, widgets, calendar, AI, social, payments and iOS until Android MVP is validated.
