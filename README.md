# VirgoStars Mobile

Android-first companion to VirgoStars Desktop, built with Angular 20, TypeScript, Tauri 2 and Rust.

## Current-sky MVP

The target MVP is deliberately narrow: open the Android app and display the astrological chart for the current instant and device location. The feature/current-sky-mvp branch currently implements the single-screen UI, foreground-only location permission, one-shot GPS acquisition, UTC/timezone/location request data, typed Rust IPC, a provider adapter interface, explicit error states and a refresh path.

This is an integration prototype, not yet a working chart MVP. The native command returns ephemeris_provider_not_configured until an approved, tested ephemeris provider is registered. The UI does not show sample or stale charts. The shared astrological-charts source has not cleared its redistribution-rights gate, so it is not bundled.

See docs/CURRENT_SKY_MVP.md and issue #14 for the required next steps and the temporary Swiss Ephemeris fallback conditions.

## Android setup

Requirements: Node.js 22.12+ or 24+, npm, Rust 1.90+, Android Studio SDK/NDK/platform tools, a compatible JDK and Rust Android targets. Follow the official Tauri mobile prerequisites.

```bash
git clone https://github.com/Cesare-ml/virgostars-mobile-app.git
cd virgostars-mobile-app
npm install
npm run check
npm run android:init
npm run android:dev
```

The repository still needs a genuine generated npm lockfile, successful clean install/tests/Angular build, and Android emulator/physical-device smoke tests. No APK, signed build or device validation is claimed by this branch.

## Design boundaries

- Astronomy is calculated natively behind a versioned Rust provider adapter, not in Angular.
- astrological-functions owns astrological semantics and chart DTOs.
- astrological-charts is the shared renderer, pending rights clearance and Android WebView/WebGL validation.
- Device location is foreground-only and used locally; no account, backend, profile archive or sync is included.
- Swiss Ephemeris is permitted as a temporary provider only after exact licensing terms, authorization, Android packaging and reference-vector tests are completed. No Swiss code or binary is bundled now.

## Project policy

See docs/ARCHITECTURE.md, docs/ROADMAP.md, docs/SECURITY.md, docs/ANDROID.md, AGENTS.md, LICENSE and NOTICE. The CPAL-1.0 license and required visible Powered by VirgoStars attribution must be preserved. No private data, signing keys, kernel binaries, auto-deployments or store releases.
