# Android development setup (not yet device-tested)

These steps follow the official [Tauri v2 mobile prerequisites](https://v2.tauri.app/start/prerequisites/). The first native build must be tested on a contributor's configured machine.

1. Install Node.js 22.12+/24+, Rust 1.90+, Android Studio with compatible SDK platform, SDK platform tools, command-line tools and NDK, plus Android Studio's JDK.
2. Configure `JAVA_HOME`, `ANDROID_HOME` and `NDK_HOME` using the versions installed by Android Studio. Restart your terminal.
3. Run `npm run doctor` for Node/npm/lockfile diagnostics. Note that this bootstrap has no generated lockfile yet: the first registry-connected contributor must run `npm install` and commit its genuine `package-lock.json`. Future contributors should prefer `npm ci` for reproducible installations.
4. Install Rust Android targets (at least `aarch64-linux-android` for ARM64 phones; add x86_64 for emulators).
5. Run `npm install` (or `npm ci` after the lockfile is committed), `npm run check`, `npm run doctor:android`, then `npm run android:init`. Initialization creates a **local, ignored** `src-tauri/gen/android` Android Studio project.
6. With emulator or USB-debugging phone attached, run `npm run doctor:device`; then run `npm run android:dev`. Ensure development server is reachable from the device; Android/WebView network rules may need local development configuration.
7. To attempt a local build, `npm run android:build`. This does **not** sign or publish a Google Play release. Use `npm run doctor:strict` for an explicit nonzero prerequisite gate before device smoke.

For browser-only UI: `npm run dev`, then visit `http://localhost:1420`. The native runtime probe will gracefully report browser preview.

The `npm run icons` script uses the original SVG placeholder; replace this with properly licensed, reviewed brand art before distributing the app. Do not commit `src-tauri/gen/`, generated signing files or local secrets. The Google Play release track, signed AAB, store listing and data-safety declaration are future maintainer tasks.

**iOS:** avoid Android assumptions in shared packages. Later on macOS with Xcode and iOS Rust targets, use `npm run ios:init`, `npm run ios:dev`. This is deliberately out of scope for the first Android smoke.

## Diagnostic interpretation

- `npm run doctor` checks Node/npm and the actual dependency lockfile (the lockfile remains absent until generated against a package registry).
- `npm run doctor:android` adds Rust, Java, SDK/NDK and ADB checks. Version compatibility and build correctness still require a real Android build.
- `npm run doctor:device` additionally checks for a device in ADB `device` state, **not** unauthorized/offline devices.
- `npm run doctor:strict` exits with code 1 when any diagnostic fails; omit `--strict` to print a report without blocking.
- `node scripts/mobile-doctor.mjs --stage=device --json` emits structured results without printing environment paths or ADB serials.
