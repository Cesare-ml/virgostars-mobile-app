# MVP — live sky

Implementation status: **partial, draft branch `feature/mvp-live-sky`**. The app entry screen and foreground location acquisition are implemented; a computed chart is not yet available.

## Implemented on this branch

- The app opens directly on one live-sky screen. Home / Chart / Archive / Settings navigation and the illustrative wheel are removed.
- The Android foreground geolocation plugin checks/requests location permission and takes a one-shot GPS fix. No background permission or watcher is configured.
- After the GPS fix resolves, the app takes device UTC time, IANA timezone and UTC offset. The GPS fix timestamp and reported accuracy are retained separately.
- Coordinates and time remain in component memory. No account, backend, local database or analytics are used.
- The observation refreshes every 60 seconds while visible and immediately when the WebView becomes visible or regains focus. Only one refresh is active; a foreground return while a request is still resolving queues another observation.
- Permission denial, browser preview, unavailable/stale fixes and invalid coordinates are explicit states. Previous observations are cleared before refresh.
- The screen states that calculation is unavailable until a validated provider and shared renderer can be integrated. No synthetic chart is displayed.

## Integration gates

### Astronomy provider

VirgoStars-Ephemeris main remains experimental. Its own source documents incomplete UTC/leap-second conversion, apparent/topocentric positions and date-frame pipeline. Its classic DE441 reader is not a complete mobile chart engine and requires a separately obtained kernel. The app must not turn geometric vectors into apparent zodiac longitudes or claim complete chart results.

### Astrological methods and renderer

astrological-functions identifies itself as private/pre-release, with no outbound license granted and no stable consumer API. astrological-charts identifies its package as private and its public source as pending rights audit; asset provenance and Android WebView/WebGL behavior still require approval and validation. Neither is added as a dependency by this change.

### Swiss Ephemeris fallback

Swiss Ephemeris remains a possible temporary provider behind the Rust provider interface. Astrodienst publishes it under a dual-licensing choice: AGPL or Swiss Ephemeris Professional License. The choice must be made before distribution or public-service activation; the AGPL route requires the whole software project to be AGPL or compatibly licensed ([official licensing page](https://www.astro.com/swisseph/sweph_p.htm?lang=z)). The inspected Rust package `rust-swisseph-bindings` 1.0.0 declares `AGPL-3.0-only` in its [published Cargo manifest](https://docs.rs/crate/rust-swisseph-bindings/1.0.0/source/Cargo.toml.orig); this does not establish that this specific binding is also available under Astrodienst's Professional License. No Swiss code, binary or data is bundled until the exact binding and distribution route are cleared.

## Required work before the MVP can be called functional

1. Choose the permitted astronomy provider: validated VirgoStars Rust adapter or explicitly authorized Swiss integration with written license path.
2. Define and contract-test the Rust `CurrentSkyChart` DTO (time scale, coordinate frame, center/observer, topocentric flag, corrections, bodies, houses/axes, aspects, warnings and provenance).
3. Integrate approved astrological-functions methods and astrological-charts package/assets through stable supported APIs, not source copies.
4. Add independent reference-vector tests for multiple instants and locations, timezone/DST transitions, denied permissions, stale GPS and provider failures.
5. Generate a genuine npm lockfile on a registry-connected machine; run `npm ci`, `npm run check`, `cargo test`, Tauri Android init/build, emulator smoke and physical-device smoke. Record exact versions and evidence. No build/APK/device result is claimed by this branch.

## Privacy and refresh semantics

A chart epoch represents the device instant **after** a fresh GPS fix is acquired. GPS is one-shot and foreground-only; periodic refresh performs another one-shot fix rather than a background watcher. No raw coordinates are logged or transmitted.
