# Architecture — VirgoStars Mobile

Status: **live-sky MVP implementation in source; build/device verification pending** (2026-11-16). Android first, iOS later.

## Current vertical slice
```text
Angular mobile UI
  └── LiveSkyService (single replaceable provider boundary)
        └── Astronomy Engine 2.1.19 (temporary MIT provider)
Tauri 2 IPC
  └── read-only runtime_info probe
Rust mobile host
Future: VirgoStars-Ephemeris stable Rust/mobile adapter
```

The app opens directly on a real-time geocentric tropical zodiac chart. A snapshot contains apparent geocentric true-ecliptic-of-date longitude for Sun, Moon and planets. It refreshes every 30 seconds. All calculation is local and sends no data.

## Astronomy provider boundary
src/app/live-sky.service.ts owns the temporary provider integration and a small app DTO. The view must not import Astronomy Engine or perform astronomy itself. The current source uses GeoVector followed by Ecliptic; it does not use heliocentric longitude for the Sun. The provider and coordinate frame are identified in the DTO so migration can be audited.

Astronomy Engine is a temporary compromise because VirgoStars-Ephemeris does not yet expose a validated mobile binding. It is MIT licensed and declares an accuracy goal of 1 arcminute against NOVAS. This is not a claim of parity with Swiss Ephemeris or the final VirgoStars engine.

Do not add Swiss Ephemeris C/Rust bindings casually: its dual AGPL/professional licensing requires a deliberate project-wide license decision before distribution. Do not introduce a dependency without rights and compatibility review.

## Current chart limitations
- Geocentric tropical longitudes only; no Ascendant, MC, houses or topocentric Moon.
- No retrograde indicators or astrological aspects.
- No personal natal data, profiles, storage, authentication or sync.
- No network calls, location permission or sensitive Android permissions.
- The chart is a live sky view, not a saved personal birth chart.

## Boundaries and future work
- VirgoStars-Ephemeris is the canonical future numerical astronomy source; do not duplicate astronomy in Angular.
- astrological-functions supplies astrology-specific methods only after its API and source licensing are cleared.
- astrological-charts may be considered later only after its source/assets licensing is resolved.
- Keep native IPC minimal, typed, explicitly permissioned and platform neutral.
- Never commit real birth records, keys, kernels, proprietary assets or service credentials.
- Android remains the first device QA target. iOS requires separate macOS/Xcode review.
