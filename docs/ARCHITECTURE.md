# Architecture — VirgoStars Mobile

Status: **live-sky MVP implementation in progress** (Android first; native build still unverified).

## MVP flow

```text
Angular live-sky screen
      |
      | provider-neutral CurrentSky DTO
      v
src/app/current-sky.mjs
      |
      | temporary local provider
      v
Astronomy Engine 2.1.19 (MIT)
      +-- SunPosition: apparent true ecliptic of date
      +-- EclipticGeoMoon: geocentric Moon
      +-- GeoVector + Ecliptic: geocentric planets
```

The DTO and Angular screen are separate from the provider. When VirgoStars-Ephemeris supplies a validated Rust/mobile adapter and astrological-functions contracts pass numerical gates, replace only the provider boundary.

## MVP calculation semantics

- Current device instant, interpreted as an absolute instant and passed to the astronomy provider.
- Geocentric tropical ecliptic longitudes of date.
- Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune and Pluto.
- Planetary positions recalculated once per minute; clock shown in the device locale/timezone and refreshed every second.
- No Ascendant/houses: no observer location or house system is inferred.

## Reuse policy

- **VirgoStars-Ephemeris:** canonical numerical astronomy when validated. Its current DE441/classic reader is experimental; no production package/bindings exist yet.
- **astrological-functions:** shared zodiac/house/aspect methods via typed adapter; no duplicated house calculations in the app.
- **astrological-charts:** preferred full chart renderer after mobile WebView/WebGL validation. MVP uses a lightweight local SVG wheel as temporary presentation.
- **virgostars-desktop:** share verified DTOs and security principles; do not copy desktop UI wholesale.

## Privacy and release

The MVP makes no account, personal birth-data, location, network or local-persistence requests. It calculates the current geocentric sky locally. Generated Tauri Android/iOS IDE trees stay under src-tauri/gen and no signing secrets are committed. Never claim an Android APK or verified device behavior until a configured native toolchain has been executed.
