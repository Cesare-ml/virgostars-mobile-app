# Android development setup (not yet device-tested)

These steps follow the official [Tauri v2 mobile prerequisites](https://v2.tauri.app/start/prerequisites/). The first native build must be tested on a contributor's configured machine.

1. Install Node.js 22.12+/24+, Rust 1.90+, Android Studio with compatible SDK platform, SDK platform tools, command-line tools and NDK, plus Android Studio's JDK.
2. Configure `JAVA_HOME`, `ANDROID_HOME` and `NDK_HOME` using the versions installed by Android Studio. Restart your terminal.
3. Install Rust Android targets (at least `aarch64-linux-android` for ARM64 phones; add x86_64 for emulators).
4. Run `npm install`, `npm run android:doctor`, `npm run check`, then `npm run android:init`. The doctor script reports missing Java/SDK/NDK/Rust prerequisites and checks for the npm lockfile; fix reported failures before continuing. Initialization creates a **local, ignored** `src-tauri/gen/android` Android Studio project.
5. With emulator or USB-debugging phone attached, run `npm run android:dev`. Ensure development server is reachable from the device; Android/WebView network rules may need local development configuration.
6. To attempt a local build, `npm run android:build`. This does **not** sign or publish a Google Play release.

For browser-only UI: `npm run dev`, then visit `http://localhost:1420`. The native runtime probe will gracefully report browser preview.

The `npm run icons` script uses the original SVG placeholder; replace this with properly licensed, reviewed brand art before distributing the app. Do not commit `src-tauri/gen/`, generated signing files or local secrets. The Google Play release track, signed AAB, store listing and data-safety declaration are future maintainer tasks.

**iOS:** avoid Android assumptions in shared packages. Later on macOS with Xcode and iOS Rust targets, use `npm run ios:init`, `npm run ios:dev`. This is deliberately out of scope for the first Android smoke.

## Build reproducibility gate

The repository does not yet contain a verified `package-lock.json`. On a network-connected development machine, run `npm install` to resolve the pinned packages and produce a genuine lockfile, commit that file to the feature branch, then verify a clean install with `npm ci` followed by `npm run check`. Do not synthesize registry integrity hashes or claim an Android build until the native toolchain actually completes it. `npm run android:doctor` is a diagnostic only, not proof of a working build.
