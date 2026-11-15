# VirgoStars Mobile

**Android-first, iOS-ready mobile companion to [VirgoStars Desktop](https://github.com/Cesare-ml/virgostars-desktop).**

Experimental open-source client built with **Angular 20 + TypeScript + Tauri 2 + Rust**. This repository is a **bootstrap prototype**, not a released or production-ready astrology app.

- **Android:** first supported development target.
- **iOS:** architecture prepared; native setup, testing and distribution deferred until macOS/Xcode and signing are available.
- **Offline-first goal:** native encrypted local profiles, charts and conflict-safe synchronization are *planned*, not yet implemented.
- **Present functionality:** responsive Italian/English mobile shell, accessible navigation, explicitly illustrative chart placeholder and a read-only native runtime probe. **No real ephemeris, login, personal-data persistence or sync yet.**

## Get started (Android)

Requirements: Node.js 22.12+ (or 24+), npm, Rust, Android Studio (SDK/NDK/platform tools), a compatible JDK and Rust Android target toolchains. Follow the [official Tauri mobile prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system.

```bash
git clone https://github.com/Cesare-ml/virgostars-mobile-app.git
cd virgostars-mobile-app
npm run doctor
npm install
npm run check
npm run doctor:android
npm run android:init
npm run android:dev
```

`npm run android:init` generates icons from the repository's original SVG and initializes the Android project (generated native project is ignored). Set `ANDROID_HOME`, `NDK_HOME` and `JAVA_HOME` as required by your toolchain. Launch an Android emulator or connect a device with USB debugging. To attempt an unsigned/local build later, use `npm run android:build`; Google Play publication requires separate signing and release work. No publication is automated.

Use `npm run doctor:device` before testing an emulator or authorized physical device. `npm run doctor:strict` exits nonzero while any required prerequisite is missing. The doctor **never prints** SDK paths, secrets or device serial numbers. It checks prerequisites, **not** whether an APK actually compiles or runs. A committed `package-lock.json` is still pending, so the first contributor with npm registry access must generate it using a genuine `npm install`, commit the lockfile, and use `npm ci` afterward. No lockfile has been fabricated.

For Angular-only browser development, run `npm run dev`. The native probe displays a browser-safe fallback when Tauri is unavailable.

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
- `npm run check` is a static contract check + Angular compilation; an actual Android build needs a configured Android toolchain and has **not been verified by this bootstrap**.
