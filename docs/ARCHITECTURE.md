# Architecture — VirgoStars Mobile

Status: **live geocentric sky-chart prototype** (2026-11-16). Android first, iOS later.

## Current MVP

Angular 20 mobile UI
  -> CurrentSkyService (typed provider boundary)
  -> Astronomy Engine 2.1.19 (temporary MIT astronomy provider)
  -> geocentric vectors -> true ecliptic of date -> tropical longitudes

Tauri 2 native host
  -> minimal read-only runtime_info IPC

The app launches directly into the chart. It calculates the Sun, Moon and eight planets for the current absolute device instant, and refreshes the snapshot every 30 seconds while the screen is active. Calculations run locally; this MVP does not request location or send chart data to a server.

**Scope boundary:** the result is a geocentric zodiac chart. It does not include Ascendant, MC, local horizon or houses. Those require a location source and approved shared astrology-function contracts; the app does not invent them.

## Calculation ownership and replacement path

- Current temporary provider: astronomy-engine@2.1.19, an external MIT-licensed astronomy library consumed as a package. No source is copied or vendored.
- Adapter location: src/app/current-sky.service.ts. UI components consume only a typed CurrentSkySnapshot; no zodiac placement arithmetic is implemented in the template.
- Future canonical provider: validated Rust VirgoStars-Ephemeris through a thin Tauri/WASM adapter, followed by astrological-functions for astrology-specific semantics.
- Future renderer: astrological-charts only after the repository's separate licensing and asset gates are cleared. The current wheel is original SVG and CSS.
- Do not claim parity with Swiss Ephemeris, VirgoStars production outputs or NASA/JPL until matched reference vectors and a reviewed error budget exist.

The VirgoStars Rust ephemeris remains experimental. Its documented real-kernel independent JPL validation, frames and correction gates are still open. Swiss Ephemeris is not bundled: the temporary library used here avoids adding an unreviewed AGPL/professional-license dependency to this public CPAL application.

## Android and iOS

Generated Tauri Android/iOS IDE trees live under ignored src-tauri/gen/; no signing material is committed. Android (SDK 24+) is the first device test target. iOS requires a Mac, Xcode, iOS Rust targets, entitlements and separate validation.

## Local-first and privacy boundaries

The current MVP has no login, persistence, GPS, personal birth records, network API, account cache or sync. It stores no user chart. A future personal archive requires OS-backed secure key storage, encrypted profile-owned SQLite, OAuth2 Authorization Code + PKCE via the system browser, versioned HTTPS API, transactional outbox and explicit revocation/conflict semantics. See SECURITY.md.

## Release gate

A configured machine must run npm checks, initialize the Android project, build and smoke-test an emulator and physical device. Check cold start, 30-second refresh, WebView resume, screen sizes, timezone correctness and astronomical reference vectors. Builds do not publish; signing, Play Store and iOS release decisions are maintainer-only.
