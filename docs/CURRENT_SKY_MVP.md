# Current Sky MVP — VirgoStars Mobile

**Status: source implemented on `feature/current-sky-live-mvp`; build and Android-device verification pending.**

## User experience

The app opens directly on the current-sky chart. There is no registration, birth-data form, archive or settings section. The display shows the local device time, a zodiac wheel, ten planetary positions and calculation provenance. The clock ticks each second; positions are recalculated locally every 60 seconds while the app is visible and can be refreshed on demand. Returning from background forces a fresh calculation; timer callbacks do not intentionally poll in background. A collision-aware SVG layout separates close planetary glyphs without changing the underlying longitude or dot coordinates.

## Calculation contract

Input: an explicit JavaScript `Date` representing a real instant.

Output: schema `VirgoStarsCurrentSky/1`:
- Earth-centered (geocentric) coordinates.
- True ecliptic-of-date coordinates and tropical zodiac longitudes.
- Sign index and degree within sign.
- Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune and Pluto.
- Provider and refresh-interval metadata.

The chart refreshes after device-clock rollback as well as after a stale interval. The Moon uses `EclipticGeoMoon`; the other bodies use `GeoVector(..., aberration=true)` and `Ecliptic`. These are provider functions, not formulas implemented in the UI. The UI identifies the provider used.

## Temporary astronomy provider

`astronomy-engine@2.1.19` is a public MIT-licensed JavaScript library supporting browser execution, geocentric vectors and conversion to true ecliptic-of-date coordinates. It is used as a temporary client-side provider while the canonical VirgoStars Rust engine is not ready for this contract. Source and required MIT notice are recorded in [NOTICE](../NOTICE).

This is a legitimate initial calculation path, but it is not a formal sign-off of numerical parity with Swiss Ephemeris or JPL Horizons. A future provider replacement must first pass independent reference-vector comparisons and shared contract tests.

## Why Swiss Ephemeris is not bundled in this first slice

Swiss Ephemeris is dual-licensed: AGPL-3.0 or a paid Professional License. The mobile repository is CPAL-1.0. Adding Swiss code or dependencies therefore requires an explicit licensing route and review; no Swiss source or binaries are copied into this branch. A maintainer can decide to adopt the Professional License or change the app's licensing strategy in a separate reviewed change.

## Deliberate omissions

- Ascendant, MC, houses and other observer-dependent points: no location is silently assumed. They require observer coordinates, sidereal-time/angle calculations and independent validation.
- User birth charts: this MVP is the **chart of the current sky**, not a saved personal natal profile.
- Login, persistent personal records, network requests, sync and background polling.
- Native background updates: the 60-second interval runs while the app process is active; Android may pause timers in the background. This is not a promise of one-minute background accuracy.

## Validation required

Run on a machine with Node 22.12+ or 24+, npm, Rust and Android SDK/JDK/NDK configured:

```bash
npm install
npm run check
npm run android:init
npm run android:build
npm run android:dev
```

Then compare all body longitudes against an independent trusted source for multiple reference instants, and smoke-test launch, refresh, process background/resume, timezone and DST on both an emulator and a physical Android device. Until these gates pass, the MVP is source-implemented, not locally tested or released.

## Upstream migration

The public `VirgoStars-Ephemeris` core currently describes itself as experimental. It has a classic DE441 file reader but lacks a complete UTC/TT/TDB pipeline and validated apparent ecliptic-of-date positions. Its present geometric J2000 state vectors do not satisfy the current-sky provider contract. Migration is gated on those features, reference vectors and parity tests; see [VirgoStars-Ephemeris](https://github.com/Cesare-ml/VirgoStars-Ephemeris) and [architecture](ARCHITECTURE.md).
