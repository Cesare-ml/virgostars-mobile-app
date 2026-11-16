# MVP — live sky chart

Status: **implemented on feature branch; build and Android device smoke pending**.

## User-facing behavior

On launch, the application calculates and displays the current sky immediately. It shows the Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune and Pluto in a tropical zodiac wheel with sign, degree and minute. The displayed local clock refreshes every second; planetary positions are recalculated every 60 seconds.

The MVP is one screen and one function. There is no login, saved chart archive, notifications, calendar, capture workflow, settings screen or user-entered birth data.

## Calculation contract

- Input: the device's current instant, converted to UTC by the astronomy provider.
- Output: geocentric ecliptic longitude for each supported body, normalized to [0, 360), plus tropical sign and display coordinates.
- Frame: apparent/true ecliptic of date where the provider exposes it; geocentric and tropical.
- Provider: Astronomy Engine 2.1.19, temporary MIT-licensed local provider.
- Update: 60 seconds for positions; one second for the on-screen clock.
- No internet API is used for calculations.

The DTO is provider-neutral. Once VirgoStars-Ephemeris and astrological-functions pass scientific and integration gates, replace this adapter without changing the screen.

## Explicit exclusions

The chart has no Ascendant, Midheaven or house cusps because this version does not acquire observer coordinates and does not claim a house system. A future location flow must request foreground permission just-in-time, explain precision, and verify the selected house method. No device location is requested in this MVP.

## Acceptance gates

- [x] No synthetic longitude values or static placeholder chart.
- [x] Deterministic date-injected calculation function and regression tests.
- [x] Visible provider/source disclosure and no claim this temporary provider is the VirgoStars engine.
- [x] One primary screen with IT/EN labels and responsive zodiac wheel.
- [ ] npm ci and npm run check on Node 22+ with registry access.
- [ ] npm run android:init and npm run android:dev on a configured SDK/JDK/Rust machine.
- [ ] Verify Android WebView symbols/font rendering, safe areas, 60-second refresh, background/foreground and device clock changes.
- [ ] Validate reference vectors against JPL Horizons / approved astronomy source before release claims.
