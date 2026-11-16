# VirgoStars Mobile

**Android-first MVP: a live chart of the current sky.** Built with Angular 20 + TypeScript + Tauri 2 + Rust.

When the app opens, it calculates and displays the current geocentric positions of the Sun, Moon and planets in the tropical zodiac. The snapshot refreshes every 30 seconds. Calculations run locally; the app does not require login, a backend, birth data or network access.

## MVP scope
- Open directly on the current-sky chart.
- Display Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune and Pluto.
- Show a zodiac wheel and each body's tropical ecliptic longitude/sign.
- Refresh every 30 seconds and show local observation time.
- Italian and English interface.
- No profiles, archive, account, payments, interpretation, notifications or synchronization.

**Astronomical provider status:** this first MVP uses the MIT-licensed Astronomy Engine 2.1.19 as a temporary, replaceable provider. The service converts light-time/aberration-corrected geocentric vectors to true ecliptic-of-date longitudes. The upstream project states an accuracy goal of 1 arcminute against NOVAS. This is not a Swiss Ephemeris integration and not the final VirgoStars engine. LiveSkyService is the single provider boundary; replace it only after the Rust VirgoStars-Ephemeris adapter has stable mobile bindings and independent numerical validation.

The chart is geocentric and does not depend on observer coordinates. **Ascendant, MC and houses are intentionally excluded** until location handling and the house-system contract are implemented and tested. Retrograde status is not displayed.

## Get started (Android)
Requirements: Node.js 22.12+ (or 24+), npm, Rust, Android Studio (SDK/NDK/platform tools), a compatible JDK and Rust Android target toolchains. Follow the [official Tauri mobile prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
git clone https://github.com/Cesare-ml/virgostars-mobile-app.git
cd virgostars-mobile-app
npm install
npm run check
npm run android:init
npm run android:dev
```
For a local Android build, run `npm run android:build`. This does not sign or publish a Google Play release. No publication is automated.

## Browser preview
```bash
npm run dev
```
The browser preview calculates the same live sky. The Tauri runtime probe falls back to a browser label when native APIs are unavailable.

## Architecture
```text
Angular mobile UI
  └── LiveSkyService (replaceable provider contract)
        └── Astronomy Engine (temporary MIT provider)
Tauri 2 Rust host (minimal, read-only runtime probe)
Future replacement: VirgoStars-Ephemeris Rust adapter
```

Do not copy production VirgoStars web/server code, private birth records, ephemeris kernels, proprietary data or unlicensed chart assets into this repository. The app retains the required visible **Powered by VirgoStars** attribution.

## Project policy
- [Architecture](docs/ARCHITECTURE.md) · [Roadmap](docs/ROADMAP.md) · [Security and privacy](docs/SECURITY.md) · [Android setup](docs/ANDROID.md) · [Live sky MVP](docs/MVP_LIVE_SKY.md).
- [Agent/contributor rules](AGENTS.md) · [License](LICENSE) · [Attribution](NOTICE) · [Third-party notices](THIRD_PARTY_NOTICES.md).
- Original source is offered under **CPAL-1.0**. Third-party dependencies retain their own licenses.
- **No GitHub Actions**, deployments, store publication, signing material or privileged backend secrets.
- Android device compilation and smoke testing must be performed with a configured Android toolchain; do not infer that it passed from a browser build.
