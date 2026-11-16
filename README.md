# VirgoStars Mobile

**Android-first, iOS-ready mobile companion to [VirgoStars Desktop](https://github.com/Cesare-ml/virgostars-desktop).**

Experimental open-source client built with **Angular 20 + TypeScript + Tauri 2 + Rust**. This repository remains an **unverified prototype**, not a released or production-ready astrology app.

## MVP — current sky chart

When the app opens, it calculates and displays the geocentric ecliptic positions of the Sun, Moon and seven planets, with tropical zodiac signs and an approximate retrograde indicator. The chart refreshes on launch, manually and once per minute. Calculation runs locally in the native Rust process; no account, network request, personal birth record or device-location permission is involved.

The temporary calculation provider is **astro 2.0.0 (MIT)**, using VSOP87 planetary theory and ELP-2000/82 lunar theory. It is deliberately isolated behind the native current_sky_chart command and is **not Swiss Ephemeris and not VirgoStars-Ephemeris**. Results have not yet passed VirgoStars reference-vector validation; the app labels this provider and its limits in the UI. TT is approximated from UTC using TAI−UTC = 37 seconds and must be reviewed if IERS announces a leap second.

This MVP shows a chart of the **sky now**, not a personal natal chart. It does not calculate an Ascendant, houses, local horizon or topocentric positions because it does not request the device's location. Those are out of scope for this first, single-function MVP.

- **Android:** first supported development target.
- **iOS:** source architecture remains platform-neutral; native setup, testing and distribution deferred until Android is validated.
- **Offline:** current-sky calculations run locally. Encrypted personal profiles, authentication and synchronization are not part of this MVP.

## Get started (Android)

Requirements: Node.js 22.12+ (or 24+), npm, Rust, Android Studio (SDK/NDK/platform tools), a compatible JDK and Rust Android target toolchains. Follow the [official Tauri mobile prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system.

Run these commands from the repository root:

    npm install
    npm run check
    npm run android:init
    npm run android:dev

The Android init script generates icons from the repository's original SVG and initializes the Android project (generated native project is ignored). Set ANDROID_HOME, NDK_HOME and JAVA_HOME as required by your toolchain. Launch an Android emulator or connect a device with USB debugging. A local unsigned build can be attempted with npm run android:build; Google Play publication requires separate signing and release work. No publication is automated.

For Angular-only browser development, run npm run dev. The native astronomy command is unavailable in browser-only preview; use the Tauri Android host to see calculated positions.

## iOS later

The shared Angular and Rust source remains platform-neutral. On a Mac with Xcode, run npm run ios:init and npm run ios:dev after Android validation. No iOS project, signed IPA or App Store delivery exists yet.

## Architecture

    src/                       Angular current-sky UI and state
    src-tauri/                 Tauri 2 Rust host / typed calculation IPC
    contracts/                 Versioned app-facing DTO contracts
    tests/                     Static bootstrap and safety checks
    docs/                      Architecture, roadmap, privacy, Android setup
    Temporary provider:        astro 2.0.0 (MIT; VSOP87 + ELP-2000/82)
    Planned canonical engine:  VirgoStars-Ephemeris (Rust; integration gate open)

Astrological business methods and a validated shared chart renderer remain separate integration work. Do not copy production VirgoStars web/server code, private birth records, private assets or ephemeris kernels into this public repository. The app has no login, personal-data storage or server synchronization.

## Project policy

- [Architecture](docs/ARCHITECTURE.md) · [Roadmap](docs/ROADMAP.md) · [Security and privacy](docs/SECURITY.md) · [Android setup](docs/ANDROID.md).
- [Agent/contributor rules](AGENTS.md) · [License](LICENSE) · [Attribution](NOTICE) · [Third-party notices](THIRD_PARTY_NOTICES.md).
- The original source is offered under **CPAL-1.0** with the **Powered by VirgoStars** GUI attribution requirement. Third-party dependencies/assets retain their own licenses and notices.
- No GitHub Actions, deployments, store publication, signing material or privileged backend secrets.
- npm run check is the static contract check + Angular compilation. Actual Android toolchain, emulator/device and unsigned APK/AAB build must be verified separately; do not mark the app released until those gates pass.