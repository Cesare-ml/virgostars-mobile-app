# Current-sky chart MVP

Status: **implemented in the feature branch; not yet locally built or device-tested**.

## Single launch experience

Opening the app goes straight to a live zodiac wheel. It calculates the geocentric tropical ecliptic longitudes of the Sun, Moon and eight planets for the device's current instant. The first snapshot is calculated immediately; the time and positions are refreshed every 30 seconds, with a manual refresh control.

No birth details, GPS, account, backend or network request are needed for this first slice. The current UI is a geocentric sky chart, not a personal natal chart. **Ascendant, MC and houses are intentionally not shown** because those require a location and the shared, validated house calculation contract.

## Calculation adapter

- Temporary provider: `astronomy-engine` 2.1.19, MIT licensed, consumed as an npm dependency; no upstream source is copied into this repository.
- Each body is requested through `GeoVector(body, instant, true)` and rotated from J2000 equatorial axes to the true ecliptic of date using `Rotation_EQJ_ECT` / `RotateVector`.
- Longitudes are normalized to 0°–360° and displayed in the twelve tropical signs.
- Inputs are JavaScript `Date` instants. No local UTC offset is added a second time.
- The adapter is isolated in `src/app/current-sky.service.ts`, so a later, validated VirgoStars-Ephemeris provider can replace it without rewriting the screen.

This is a temporary astronomical provider, **not a claim that VirgoStars-Ephemeris is complete**. The VirgoStars Rust ephemeris branch is still experimental and its documented independent JPL validation gates remain open. Swiss Ephemeris is not bundled; the owner allowed it as a possible temporary fallback, but this implementation uses the permissively licensed Astronomy Engine dependency instead of introducing an unreviewed dual-license/AGPL distribution dependency into the public CPAL application.

## Accuracy and display boundaries

- The chart is geocentric; it is not topocentric and does not depend on the device location.
- The first MVP omits Ascendant, houses and local horizon.
- The library is a general astronomy engine and is not claimed to be numerically identical to Swiss Ephemeris or future VirgoStars-Ephemeris.
- The wheel is a responsive original SVG presentation. It does not import the separately rights-gated `astrological-charts` repository.
- On a calculation error the previous chart is cleared and an explicit error is displayed; no sample/synthetic positions are shown as live results.
- No background worker is required. The app refreshes on the foreground screen every 30 seconds.

## Android verification still required

A configured contributor machine must run:

```bash
npm install
npm run check
npm run android:init
npm run android:dev
npm run android:build
```

Then smoke-test a real Android device/emulator, compare a sample instant against independent reference settings, verify chart update cadence, cold start, WebView resume and screen-size behavior. No APK, native build, or device test is claimed by this branch.
