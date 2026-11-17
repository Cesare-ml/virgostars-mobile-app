# VirgoStars Mobile

**Android-first, iOS-ready mobile companion to [VirgoStars Desktop](https://github.com/Cesare-ml/virgostars-desktop).**

Experimental open-source client built with **Angular 20 + TypeScript + Tauri 2 + Rust**. This repository is a **bootstrap prototype**, not a released or production-ready astrology app.

- **Android:** first supported development target.
- **iOS:** architecture prepared; native setup, testing and distribution deferred until macOS/Xcode and signing are available.
- **Offline-first goal:** native encrypted local profiles, charts and conflict-safe synchronization are *planned*, not yet implemented.
- **Present functionality:** responsive Italian/English shell and experimental native calculation behind an optional local-use Swiss Ephemeris feature. The default build has no provider. The calculated chart is displayed with the shared renderer and open-font glyphs; remaining graphics use locally generated synthetic placeholders; login, persistence and sync are not integrated.

[Experimental local Swiss provider and limitations](docs/SWISS_LOCAL_PROTOTYPE.md). [Offline place catalog and attribution](docs/GEONAMES_CATALOG.md). [Chart symbols and font licenses](docs/CHART_SYMBOLS.md).

On the chart, use the zoom controls to enlarge the wheel up to 200%, then scroll in either direction to explore it. Fit returns to the full wheel; planet selection remains available while zoomed.

## Idee e sviluppo delle funzioni native

- [Native Astrologer Toolkit — funzionalità, priorità e vincoli Android/iOS](docs/NATIVE_ASTROLOGER_TOOLKIT.md). Include cattura del momento, notifiche per transiti, widget lunari, calendario, biometria, diario vocale, sensori, condivisione, smartwatch, QR/NFC e feedback aptico. Le idee sono **pianificate**, non già implementate.

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

`npm run android:init` generates icons from the maintainer-supplied official PNG emblem and initializes the Android project (generated native project is ignored). Set `ANDROID_HOME`, `NDK_HOME` and `JAVA_HOME` as required by your toolchain. Launch an Android emulator or connect a device with USB debugging. To attempt an unsigned/local build later, use `npm run android:build`; Google Play publication requires separate signing and release work. No publication is automated.

For Angular-only browser development, run `npm run dev`. The native probe displays a browser-safe fallback when Tauri is unavailable.

For Android Studio Run on Windows ARM64, use the [Tauri-backed launch instructions](docs/ANDROID.md#android-studio-run--windows-arm64-local-swiss-prototype); opening the generated project alone does not start the required Tauri process.

## iOS later

The shared Angular and Rust source remains platform-neutral. **On a Mac with Xcode**, run `npm run ios:init` and `npm run ios:dev`, *after* the Android prototype is validated. No iOS project, signed IPA or App Store delivery exists yet.

## Architecture

```text
src/                       Angular mobile UI and state (offline-friendly shell)
src-tauri/                 Tauri 2 Rust mobile host / read-only IPC
contracts/                 Planned versioned adapters and DTOs
tests/                     Static bootstrap and safety checks
docs/                      Architecture, roadmap, privacy, Android setup
Upstream shared code:      VirgoStars-Ephemeris (Rust astronomy)
                           astrological-functions (astrological methods)
                           astrological-charts (chart rendering)
                           virgostars-desktop (compatible local-first contracts)
Future:                    owned-profile SQLite storage, secure key storage,
                           OAuth2/PKCE, versioned server sync and offline outbox
```

Do not copy production VirgoStars web/server code, private birth records, private assets or ephemeris kernels into this repository. The illustrative UI is not a horoscope or natal chart. Native application and online service require separate ownership and security boundaries.

## Project policy

- [Architecture](docs/ARCHITECTURE.md) · [Roadmap](docs/ROADMAP.md) · [Security and privacy](docs/SECURITY.md) · [Android setup](docs/ANDROID.md).
- [Agent/contributor rules](AGENTS.md) · [License](LICENSE) · [Attribution](NOTICE).
- The original source is offered under **CPAL-1.0** with the **Powered by VirgoStars** GUI attribution requirement. Third-party dependencies/assets retain their own licenses.
- **No GitHub Actions**, deployments, store publication, signing material or privileged backend secrets.
- `npm run check` runs contract tests, Angular compilation and chart-symbol verification. Android builds require a configured Android toolchain; the local Swiss-enabled x86_64 debug build has been exercised on an emulator, not validated for release or on a physical device.
