# VirgoStars Mobile

**Android-first VirgoStars current-sky chart MVP**, built with Angular 20 + TypeScript + Tauri 2 + Rust.

Opening the app displays the **current geocentric zodiac chart**: Sun, Moon and the eight planets in the tropical zodiac. The initial calculation runs at launch and refreshes every 30 seconds while the app is open. The current MVP needs no account, birth data, GPS, backend or network request.

- **Android:** first target; native project generation and device validation are still required.
- **iOS:** source is kept platform-neutral, but native setup and testing are deferred.
- **Current chart:** geocentric longitudes; no Ascendant, MC or houses in this first MVP.
- **Temporary astronomy provider:** [Astronomy Engine](https://github.com/cosinekitty/astronomy) 2.1.19 (MIT), used through an isolated adapter until VirgoStars-Ephemeris has passed its scientific and integration gates.
- **Not a release:** no signed APK/AAB, store publication or device smoke result is claimed by this branch.

## Get started (Android)

Requirements: Node.js 22.12+ (or 24+), npm, Rust, Android Studio (SDK/NDK/platform tools), a compatible JDK and Rust Android targets. Follow the [official Tauri mobile prerequisites](https://v2.tauri.app/start/prerequisites/).

    git clone https://github.com/Cesare-ml/virgostars-mobile-app.git
    cd virgostars-mobile-app
    npm install
    npm run check
    npm run android:init
    npm run android:dev

The android:init script generates app icons and initializes the local Android Studio project under src-tauri/gen/android (generated native project is ignored). Set ANDROID_HOME, NDK_HOME and JAVA_HOME as required by the installed toolchain. For a local build, run npm run android:build. Google Play signing and publication remain separate maintainer tasks.

For browser-only development, run npm run dev.

## Current-sky calculation

The implementation is in src/app/current-sky.service.ts. It asks Astronomy Engine for geocentric vectors at the current absolute Date instant, rotates them from J2000 equatorial axes to the true ecliptic of date, and derives tropical longitudes. The provider is isolated so a future validated VirgoStars Rust/WASM provider can replace it.

Details, frames and limitations: [Current-sky MVP contract](docs/CURRENT_SKY_MVP.md).

This is not an implementation of the VirgoStars-Ephemeris kernel. That Rust project remains experimental and its independent JPL validation gates are not closed. Swiss Ephemeris is not bundled in this branch; Astronomy Engine is the interim permissively licensed alternative. No code or assets are copied from the separately rights-gated astrological-charts repository.

## Architecture

- src/ — Angular launch screen + current-sky view model
- src/app/current-sky.service.ts — isolated temporary astronomy provider adapter
- src-tauri/ — Tauri 2 Rust mobile host / minimal read-only IPC
- contracts/ — versioned native DTO contracts
- tests/ — static bootstrap, live-chart and license checks
- docs/ — architecture, roadmap, privacy, Android setup
- Future provider: VirgoStars-Ephemeris (Rust) + astrological-functions
- Future renderer: astrological-charts after license and device review

## Project policy

- [Architecture](docs/ARCHITECTURE.md) · [Roadmap](docs/ROADMAP.md) · [Security and privacy](docs/SECURITY.md) · [Android setup](docs/ANDROID.md).
- [Current-sky MVP calculation contract](docs/CURRENT_SKY_MVP.md) · [Agent rules](AGENTS.md) · [License](LICENSE) · [Attribution](NOTICE).
- The original VirgoStars source is offered under **CPAL-1.0** with the required **Powered by VirgoStars** attribution. Third-party dependencies retain their own licenses; Astronomy Engine's MIT notice is included in THIRD_PARTY_LICENSES/.
- No private birth records, proprietary ephemeris kernels, service credentials, releases or store publishing are included.
- An Android build requires a configured Android toolchain. **npm/Angular and native Android builds have not been executed in this branch environment.**
