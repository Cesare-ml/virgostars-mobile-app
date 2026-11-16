# Architecture — VirgoStars Mobile

Status: **current-sky MVP implementation in progress** (2026-11-16). Android first, iOS later.

## MVP boundary

The only product function in the first MVP is a real-time chart of the current sky. Angular renders a typed response from the native Rust command current_sky_chart. The command calculates the Sun, Moon and seven planets locally and returns their geocentric ecliptic coordinates, zodiac placement, approximate retrograde state, calculation timestamp and provider provenance. The UI refreshes at launch, on demand and every 60 seconds.

    Angular current-sky screen (TypeScript; touch-first UI)
          | typed SkyChart DTO
          | Tauri IPC: current_sky_chart
    Rust mobile host
          | temporary provider adapter
          +-- astro 2.0.0 (MIT; VSOP87 planetary / ELP-2000/82 lunar)
          |
          +-- planned canonical VirgoStars-Ephemeris Rust adapter

The astronomy crate is pinned and isolated behind one native command so it can be replaced without changing the screen contract. Its outputs have not yet been validated against VirgoStars reference vectors. It is not Swiss Ephemeris and is not the VirgoStars-Ephemeris engine. UTC-to-TT currently assumes TAI−UTC = 37 seconds (TT−UTC = 69.184 seconds); revalidate after any IERS leap-second announcement.

## Explicit non-goals

- No Ascendant, houses, observer/horizon, or topocentric chart: the app does not request device location.
- No personal natal chart, birth data, account, OAuth, encrypted profile, archive or server sync.
- No network calls or ephemeris downloads at runtime.
- No custom astronomy algorithm in TypeScript. Angular only formats and renders native results.
- No claims of numerical parity with Swiss Ephemeris or NASA/JPL.

## Replacement gate for VirgoStars-Ephemeris

The current VirgoStars-Ephemeris Rust branch contains experimental astronomy modules and no stable app-facing integration contract yet. Replace the temporary provider only after all of these gates pass:

1. A supported mobile-compatible library interface exists (workspace dependency or a small, reviewed FFI/adapter).
2. The supported input epoch/time scale, body IDs, reference frame, center/observer and corrections are documented.
3. Contract vectors cover every MVP body and representative dates, including retrograde direction and wrap-around near 0°.
4. Results are compared to independent reference data with tolerances approved by the astronomy maintainers.
5. License, notices, attribution and device performance are reviewed.

## Android and iOS

Generated Tauri Android/iOS IDE trees are local artifacts under src-tauri/gen/; no signing secrets are committed. Android (SDK 24+) is the first device test target. iOS requires a Mac, Xcode, app entitlements and separate validation; it is not currently supported or released.

## Platform / release boundary

This code does not publish builds. Play and App Store distribution require review, reproducible dependencies, signing, screenshots/permissions and store disclosure. No automatic deployment is used.