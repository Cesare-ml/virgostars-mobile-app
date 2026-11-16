# VirgoStars Mobile

**Android-first, iOS-ready mobile companion to [VirgoStars Desktop](https://github.com/Cesare-ml/virgostars-desktop).**

Experimental open-source client built with **Angular 20 + TypeScript + Tauri 2 + Rust**. The immediate product goal is deliberately narrow: open the app and see the actual astrological chart for the current instant and device location, refreshed while foregrounded.

## Current MVP implementation status

This branch contains the **current-sky UI shell and native acquisition boundary**:

- A single initial screen titled “Il cielo di adesso”.
- One-shot foreground GPS permission and current-position acquisition. Location is processed on-device and is not uploaded or persisted.
- UTC trigger timestamp, IANA timezone, observed UTC offset, observer coordinates, altitude and GPS accuracy in a versioned native input contract.
- Fresh-fix validation and refresh policy (GPS checked every 15 seconds, astronomical calculation throttled to one minute, recalculated after meaningful movement or app resume).
- A typed Tauri calculate_current_sky command that currently returns sky_engine_unavailable.

**Important: no real chart is calculated or rendered yet.** The native command intentionally fails closed. The DE441 reader/provider in VirgoStars-Ephemeris is experimental and not independently validated as a complete astrology provider; astrological-functions has no granted outbound reuse license/API stability; and astrological-charts source/assets are pending rights clearance. The MVP must not show fabricated planetary positions or a geometric placeholder as a live chart.

The next integration gates are: a lawful offline astronomical provider (VirgoStars-Ephemeris when the required capability and data are ready, or an approved Swiss Ephemeris integration after license review), the astrological-functions contract, and the cleared shared renderer. Swiss Ephemeris is **not bundled or linked** by this branch.

## Get started (Android)

Requirements: Node.js 22.12+ (or 24+), npm, Rust, Android Studio (SDK/NDK/platform tools), a compatible JDK and Rust Android target toolchains. Follow the [official Tauri mobile prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system.

```bash
git clone https://github.com/Cesare-ml/virgostars-mobile-app.git
cd virgostars-mobile-app
npm install
npm run check
npm run android:init
npm run android:dev
```

npm run android:init generates icons from the repository's original SVG and initializes the local ignored Android project. Set ANDROID_HOME, NDK_HOME and JAVA_HOME for the installed toolchain. npm run android:build attempts a local Android build; a successful APK and a physical-device smoke test have **not yet been recorded** for this MVP.

For Angular-only browser development, run npm run dev. Browser preview deliberately reports that the native runtime/engine is unavailable.

## Architecture

```text
Angular single-screen UI
  └─ CurrentSkyService (permissions, fresh GPS, foreground refresh)
       └─ typed Tauri IPC: calculate_current_sky
            └─ provider adapter (NOT YET LINKED)
                 ├─ VirgoStars-Ephemeris (target Rust provider)
                 └─ Swiss Ephemeris (only after license/approval)
            └─ astrological-functions (not yet integrated)
            └─ astrological-charts (not yet integrated)
```

No login, accounts, archive, persistent GPS, server sync, notifications, widgets or personal birth data are part of this MVP.

## Project policy

- [Architecture](docs/ARCHITECTURE.md) · [Roadmap](docs/ROADMAP.md) · [Security and privacy](docs/SECURITY.md) · [Android setup](docs/ANDROID.md).
- [Agent/contributor rules](AGENTS.md) · [License](LICENSE) · [Attribution](NOTICE).
- Preserve CPAL-1.0 attribution and visible **Powered by VirgoStars**. Third-party dependencies/assets retain their own licenses.
- No GitHub Actions, automatic deployments, store publication, signing material or privileged backend secrets.
