# Architecture — VirgoStars Mobile

Status: **current-sky MVP source implementation** (2026-11-16); build and Android-device validation pending. Android first, iOS later.

## Current execution path

```text
Angular 20 mobile UI
  |  current-sky-engine.mjs
  |  astronomy-engine 2.1.19 (temporary MIT adapter)
  |  geocentric apparent ecliptic-of-date positions, tropical zodiac
  |  UI update every 60 seconds
  v
Tauri 2 WebView on Android / browser preview

Future validated path:
VirgoStars-Ephemeris Rust core
  |-- explicit UTC -> TT/TDB time-scale conversion
  |-- validated apparent geocentric ecliptic-of-date positions
  |-- numerical reference vectors and parity tests
  v
Typed mobile adapter -> same current-sky view model
```

The UI does not contain astronomy formula implementations. All planet positions come from the replaceable provider adapter. The current MVP calculates Sun, Moon and the eight planets locally from the device clock and requires no location permission or network connection.

## Scope boundaries

- Coordinates are geocentric apparent positions in the true ecliptic of date and tropical zodiac.
- The Moon is calculated with the provider's dedicated geocentric ecliptic routine.
- The first screen opens directly on the current sky chart; it refreshes positions every 60 seconds and the displayed clock every second.
- No Ascendant or houses: observer location and a validated local-angle pipeline are not yet available. Do not infer or default location.
- No accounts, birth records, profile archive, local persistent user data, remote service or synchronization.
- The inline SVG renderer is a temporary mobile chart view. Integrating `astrological-charts` requires separate touch, DPI, GPU-memory and WebView context-loss validation.

## Canonical ephemeris migration gate

The public `VirgoStars-Ephemeris` Rust crate is still an experimental kernel reader, not a complete shipping ephemeris. Its current API explicitly lacks UTC/TT/TDB conversion and validated apparent ecliptic-of-date output; it cannot meet the existing `astrological-functions` provider gate without additional implementation. Never label geometric J2000 vectors as apparent zodiac positions.

Swap the temporary provider only after:
1. UTC/TT/TDB transformations and leap-second handling are explicit and tested.
2. Earth-centered apparent ecliptic-of-date position contracts are met for all displayed bodies.
3. Published numerical reference vectors and parity tests pass over dates including retrograde stations and sign boundaries.
4. Engine version, method and data/kernel provenance are surfaced in the UI.

## Licensing

The mobile source remains CPAL-1.0. The temporary `astronomy-engine` npm dependency is MIT and is documented in [NOTICE](../NOTICE). Swiss Ephemeris is not bundled: its AGPL or commercial licensing route requires an explicit project licensing decision before integration into this CPAL-licensed app.

## Native boundary and release

Tauri exposes only the non-privileged `runtime_info` command. There is no new IPC, location permission, native plugin or network grant. Generated IDE trees remain under ignored `src-tauri/gen/`. No signing, publication, GitHub Actions or unattended deployment is performed.

A configured contributor must run `npm run check`, initialize the Android target, compile an unsigned local build and test the app on an emulator and physical device before marking the MVP Locally tested.
