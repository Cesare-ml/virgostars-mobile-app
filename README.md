# VirgoStars Mobile

**Android-first, iOS-ready mobile companion to [VirgoStars Desktop](https://github.com/Cesare-ml/virgostars-desktop).**

Experimental open-source client built with **Angular 20 + TypeScript + Tauri 2 + Rust**. The current branch implements the first **current-sky MVP**; it remains a prototype pending a reproducible build and Android device validation.

## Current MVP — live sky chart

On launch the app calculates and displays the current geocentric chart without login, network access or location permission:

- Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune and Pluto.
- Apparent planetary positions in the true ecliptic of date, tropical zodiac, sign and degree.
- Local recalculation every 60 seconds and a clock refreshed every second.
- Italian and English UI; calculation source and method are visible in the chart.

The temporary astronomy provider is **Astronomy Engine 2.1.19 (MIT)**, used as a replaceable client-side adapter while the canonical VirgoStars engine completes its UTC/time-scale, apparent-position and validation work.

**Ascendant and houses are intentionally not shown.** They depend on a verified observer-angle calculation tied to a location. The app does not invent an observer location or fabricate houses. See [Current Sky MVP](docs/CURRENT_SKY_MVP.md).

## Status and limits

- Android is the first supported development target; iOS setup and device verification remain deferred.
- No login, birth-data input, personal-data persistence, profile archive, remote API or synchronization is included.
- This is the **chart of the current sky**, not a saved personal natal chart tied to a birth profile.
- `npm run check` and an Android build/device smoke test must be run on a configured contributor machine. No successful native build is claimed by this branch.

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

`npm run android:init` generates icons from the repository's original SVG and initializes the Android project (generated native project is ignored). Set `ANDROID_HOME`, `NDK_HOME` and `JAVA_HOME` as required by your toolchain. Launch an Android emulator or connect a device with USB debugging. To attempt a local build, use `npm run android:build`; Google Play publication requires separate signing and release work.

For Angular-only browser development, run `npm run dev`.

## Architecture

```text
src/                       Angular live-sky UI + local calculation adapter
src-tauri/                 Tauri 2 Rust mobile host / read-only IPC
tests/                     Static bootstrap and live-sky calculation contracts
docs/                      Architecture, roadmap, privacy and MVP setup
Upstream shared code:      VirgoStars-Ephemeris (future canonical astronomy)
                           astrological-functions (astrological methods)
                           astrological-charts (renderer; mobile integration pending)
```

Do not copy production VirgoStars web/server code, private birth records, private assets or ephemeris kernels into this repository. The app retains the CPAL-1.0 source license and the visible **Powered by VirgoStars** attribution. Third-party dependencies retain their own licenses; see [NOTICE](NOTICE).

## iOS later

On a Mac with Xcode, the shared source can be initialized with `npm run ios:init` after Android is validated. No signed IPA or App Store delivery exists.
