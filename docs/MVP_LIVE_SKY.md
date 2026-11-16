# MVP — live sky

Implementation status: **partial, stacked draft branch `feature/mvp-live-sky-screen`**. No real astrological chart is claimed yet.

## Implemented on this branch

- The app opens directly on one live-sky screen; Home / Chart / Archive / Settings navigation and the illustrative wheel are removed from the MVP entry point.
- On startup, the Android foreground geolocation flow requests location permission and takes a one-shot GPS fix. No background location permission or watcher is used.
- After the GPS fix resolves, the app takes the current device time, IANA timezone and UTC offset. GPS fix time and reported accuracy are retained separately.
- Coordinates and time exist only in component memory. No account, backend, local database or analytics are used.
- The observation refreshes every 60 seconds while visible and immediately when the WebView becomes visible or regains focus. Only one refresh is in flight; a foreground return during an active request queues a fresh observation.
- Permission denial, browser preview, unavailable/stale fixes and invalid coordinates are explicit states. A failed refresh clears the previous observation so stale values cannot be mistaken for current sky.
- The user sees a clear calculation-unavailable state until a validated provider and shared renderer can be used. No synthetic chart is displayed.

## Deliberate integration gates

### Astronomy provider

VirgoStars-Ephemeris main is still an experimental numerical foundation, not a shipping chart provider. Its own source documents incomplete UTC/leap-second conversion, apparent/topocentric positions and date-frame pipeline. The classic DE441 reader is not a complete mobile chart engine and requires a separately obtained kernel. The app must not turn geometric vectors into apparent zodiac longitudes or claim complete chart results.

### Astrological methods and chart renderer

astrological-functions currently identifies itself as private, pre-release, without a granted outbound license or stable consumer API. astrological-charts identifies its package as private and public source as pending rights audit; its asset provenance and mobile WebGL behavior need approval and validation. Neither is added as a package dependency by this change.

### Swiss Ephemeris fallback

Swiss Ephemeris remains a possible temporary provider behind the future Rust provider interface. Astrodienst publishes Swiss Ephemeris under a dual-licensing choice: AGPL or a Swiss Ephemeris Professional License; the choice must be made before distribution or public-service activation, and the AGPL route requires the whole software project to be AGPL or compatibly licensed ([official licensing page](https://www.astro.com/swisseph/sweph_p.htm?lang=z)). The inspected Rust package `rust-swisseph-bindings` 1.0.0 declares `AGPL-3.0-only` in its Cargo manifest ([published manifest](https://docs.rs/crate/rust-swisseph-bindings/1.0.0/source/Cargo.toml.orig)); this does not by itself establish that this specific binding/port is also available under Astrodienst's Professional License. No Swiss code, binary or data file is bundled until the owner confirms a binding with an applicable license or obtains written professional-license coverage for the exact distribution. The fallback must not bypass this gate.

## Required next work before the MVP can be called functional

1. Choose and document the permitted astronomy provider: validated VirgoStars Rust adapter, or an explicitly authorized Swiss Ephemeris distribution.
2. Define and contract-test the Rust `CurrentSkyChart` DTO (time scale, coordinate frame, center/observer, topocentric flag, correction set, bodies, houses/axes, aspects, warnings and provenance).
3. Integrate approved astrological-functions methods and astrological-charts package/assets through stable supported APIs, not source copies.
4. Add independent reference-vector tests for multiple instants and locations, timezone/DST transitions, permission denial, stale GPS and provider failures.
5. Generate a genuine npm lockfile on a registry-connected machine; run `npm ci`, `npm run check`, `cargo test`, Tauri Android init/build, emulator smoke and physical-device smoke. Record exact toolchain/device evidence. No build/APK/device result is claimed by this change.

## Privacy and refresh semantics

A chart epoch represents the current device instant **after** a fresh GPS fix is acquired. This differs from moment capture, which intentionally freezes a button-press instant before GPS acquisition. GPS acquisition is one-shot and foreground-only; periodic refresh performs another one-shot fix rather than using a background watcher. No raw coordinates are logged or transmitted.
