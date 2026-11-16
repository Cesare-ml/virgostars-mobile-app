# Current-sky MVP — implementation and release gates

## User experience

The Android app opens directly on one screen: the astrological chart for the current instant and the phone's current location. The screen is not a dashboard. A sample, geometric placeholder or cached previous chart must never be presented as the current sky.

## Implemented in this branch

- One-screen current-sky UI replaces the tabbed demonstration shell.
- The app requests a single fresh location fix while foregrounded, after checking/requesting the Android location permission.
- Coordinates, reported location accuracy, UTC observation time and IANA timezone are validated and passed to native Rust IPC.
- Fixes older than 45 seconds are rejected.
- Rust exposes a versioned request/response contract and a `CurrentSkyProvider` adapter seam.
- Provider provenance must include provider/version, time scale, coordinate frame, center and geometric/apparent mode.
- Missing engine, denied permission, unavailable location, calculation failure and missing renderer have explicit UI states. No dummy chart is created.
- Returning to foreground triggers a fresh location/calculation request. A 60-second refresh loop is present for the successful-provider/renderable-chart path; it does not run an unnecessary background poll.
- No background location permission, GPS history, account, backend call or personal data archive is included.
- The GUI preserves the required `Powered by VirgoStars` attribution.

## Current limitation

The Rust command presently returns `ephemeris_provider_not_configured`. This branch is therefore an integration shell, **not yet the accepted functional MVP**: it cannot display planetary positions, houses, axes or aspects yet.

Three upstream dependencies remain:

1. **Astronomy provider.** `VirgoStars-Ephemeris` is still marked experimental and has no ready validated mobile API/WASM binding. Its current Rust crate is not a drop-in chart provider.
2. **Temporary Swiss fallback.** Issue #14 explicitly permits it as a temporary path only after the precise distribution terms are checked and the required AGPL or commercial authorization is obtained. The Android NDK/ABI packaging and offline use must then be tested. No Swiss code or binary is currently bundled.
3. **Chart renderer and semantics.** `astrological-functions` owns zodiac/house/aspect semantics and DTOs. `astrological-charts` is the intended renderer, but its repository currently states that redistribution rights are not cleared. Do not copy or bundle it until rights and third-party asset provenance are approved.

## Files

- `src/app/app.component.ts`: current-screen state, location-to-instant binding, foreground refresh.
- `src/app/app.component.html` and `.css`: the single mobile screen, loading and failure states.
- `src/app/current-sky/current-sky.models.ts`: versioned frontend contract.
- `src/app/current-sky/native-current-sky.ts`: foreground geolocation and typed IPC call.
- `src-tauri/src/current_sky.rs`: provider trait, DTOs, input validation and fail-closed command.
- `src-tauri/src/lib.rs`: registers the geolocation plugin and current-sky command.
- `src-tauri/capabilities/default.json`: only check/request/current-position permissions; no watch permission.
- `tests/current-sky-contract.test.mjs` and `tests/bootstrap.test.mjs`: static source-contract checks.

## Verification status

Not run in this execution: npm installation, contract tests, Angular build, Cargo tests, Android initialization, APK build, emulator smoke or physical-device smoke. The repository has no genuine npm lockfile on the base branch. Generate it using the supported Node/npm toolchain; do not hand-author a lockfile.

Required local checks when the branch is checked out:

```bash
npm install
npm run check
cd src-tauri
cargo fmt --all -- --check
cargo test
cd ..
npm run android:init
npm run android:dev
npm run android:build
```

Then test permission allow/deny/revoke, location services disabled, GPS timeout/stale fix, foreground resume, one-minute refresh, offline operation and app restart. Record actual SDK/JDK/NDK and emulator/device versions. An APK is not considered validated merely because the Angular app builds.

## Acceptance sequence

1. Decide and document Swiss fallback rights before adding a Swiss dependency or binary.
2. Implement the selected astronomy provider behind `CurrentSkyProvider`, with provenance and independently traceable reference vectors for multiple instants and locations.
3. Wire the canonical astrological-functions DTO contract and its tests.
4. Obtain astrological-charts source/asset redistribution clearance; integrate and validate the shared renderer on Android.
5. Run the clean install, contract, Angular, Rust and Android test sequence above.
6. Only then mark the MVP functionally complete. Do not add accounts, archive, interpretations, widgets, notifications or other product features to this MVP.
