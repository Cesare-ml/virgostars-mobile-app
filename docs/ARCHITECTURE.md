# Architecture — VirgoStars Mobile

Status: current-sky MVP integration prototype (2026-11-16). Android first; iOS later.

## Decision

The app opens directly on a single current-sky screen. Angular requests a one-shot foreground location fix and sends a versioned request to Tauri Rust. Astronomy stays behind a native provider boundary; the UI does not calculate celestial positions.

```text
Angular current-sky screen
  -> foreground geolocation plugin
  -> versioned CurrentSkyRequest / CurrentSkyResponse
  -> Tauri 2 IPC
  -> Rust CurrentSkyProvider
       -> temporary Swiss provider (not yet licensed/integrated)
       -> future VirgoStars-Ephemeris provider
  -> astrological-functions DTO adapter (not integrated)
  -> astrological-charts renderer (rights/mobile validation pending)
```

## Native contract

- CurrentSkyRequest carries UTC instant, IANA timezone, latitude, longitude and GPS accuracy.
- CurrentSkyResponse reports schema version, status, provider provenance and an optional chart payload.
- CurrentSkyProvider must report provider/version, time scale, coordinate frame, center and geometric/apparent position mode.
- Invalid coordinates or accuracy are rejected.
- With no configured provider, IPC returns ephemeris_provider_not_configured and no chart payload. This fail-closed behavior is deliberate.
- A successful calculation is not a visible chart until the shared renderer is integrated and validated.

## Shared project boundaries

VirgoStars-Ephemeris is the future canonical Rust astronomical core, but its current experimental state and missing validated mobile adapter mean it is not a ready drop-in provider. astrological-functions owns zodiac, houses, aspects and chart DTO semantics. astrological-charts is the intended shared renderer, but its source and asset redistribution rights are not yet cleared; do not vendor it before approval.

Issue #14 permits temporary Swiss Ephemeris use only after checking exact AGPL/commercial licensing terms, obtaining required authorization, verifying Android packaging and offline behavior, and running provider contract/reference-vector tests. No Swiss source or binary is currently included.

## Location, time and refresh

- Location is requested only while the app is foregrounded. There is no background permission, continuous location watch, location history or network transmission.
- UTC instant comes from the location fix timestamp so time and coordinates describe the same observation. Fixes older than 45 seconds are rejected.
- IANA timezone accompanies the request for display and downstream local-time semantics.
- Returning to foreground triggers a fresh request. A bounded 60-second refresh loop is enabled only after the provider returns a chart payload and rendering becomes available.
- If permission is denied, GPS is unavailable, calculation fails or rendering is missing, no old or synthetic chart is shown.

## Security and release

No login, profile archive, backend sync, signing keys, private birth records, private assets or ephemeris kernel files are included. Android SDK compilation and emulator/physical-device smoke tests remain mandatory before claiming a working Android MVP.
