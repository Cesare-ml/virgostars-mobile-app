# Live sky MVP — functional contract

Status: **implemented in source; build/device verification pending** (2026-11-16).

## User-visible behavior
1. Starting Android opens directly on the current-sky chart.
2. The chart renders the Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune and Pluto.
3. A list shows each body's tropical sign and longitude within that sign, plus absolute ecliptic longitude.
4. The timestamp uses the device's local timezone.
5. The snapshot is recalculated every 30 seconds. It is not a continuously streamed sensor feed.
6. The interface is available in Italian and English.

## Astronomical contract
- Epoch input: current device instant as a JavaScript Date.
- Origin: geocentric (Earth center).
- Frame: true ecliptic of date.
- Zodiac: tropical.
- Pipeline: provider geocentric vector with light-time/aberration enabled, followed by provider ecliptic-of-date transform.
- Provider identity: ASTRONOMY_ENGINE_TEMPORARY.
- No heliocentric longitudes are used for the Sun.

## Explicit exclusions
No observer location, Ascendant, MC, house cusps, topocentric lunar parallax, aspects, retrograde labels, saved charts, login, network services or personal birth data. This is the current sky as a geocentric chart, not a chart for a user's birth.

## Provider migration
Replace LiveSkyService after VirgoStars-Ephemeris exposes a stable Android-compatible API and its numerical output passes independent reference tests. Preserve the DTO and coordinate metadata; do not silently mix coordinate frames.

## Verification required
Run npm install, npm run check, initialize Android with npm run android:init, then run npm run android:build on a machine with Node 22.12+, Rust 1.90+, Android SDK/NDK and a compatible JDK. Install and smoke-test on an emulator and physical ARM64 phone. This source update alone does not establish a successful Android build.
