# Android development setup — current-sky MVP

These steps follow the official [Tauri v2 mobile prerequisites](https://v2.tauri.app/start/prerequisites/). The first native build must be tested on a configured development machine.

1. Install Node.js 22.12+/24+, Rust 1.90+, Android Studio with a compatible SDK platform, SDK platform tools, command-line tools and NDK, plus Android Studio's JDK.
2. Configure `JAVA_HOME`, `ANDROID_HOME` and `NDK_HOME` using the versions installed by Android Studio. Restart your terminal.
3. Install Rust Android targets (at least `aarch64-linux-android` for ARM64 phones; add `x86_64` for emulators).
4. Run `npm install`, `npm run check`, then `npm run android:init`. Initialization creates a **local, ignored** `src-tauri/gen/android` project.
5. The MVP requests foreground location at runtime and uses one-shot geolocation. It does not request background location or watch GPS continuously.
6. With emulator or USB-debugging phone attached, run `npm run android:dev`. Ensure the development server is reachable from the device.
7. To attempt a local build, run `npm run android:build`. This does **not** sign or publish a Google Play release.

For browser-only UI: `npm run dev`, then visit `http://localhost:1420`. Browser preview deliberately reports that the native runtime/engine is unavailable.

The current branch contains the GPS acquisition and refresh foundation, but its native astronomy command intentionally returns an unavailable-engine error. **No real chart or verified APK is currently available.** Do not treat a development build as a completed MVP.

Do not commit `src-tauri/gen/`, generated signing files or local secrets. Google Play release, signed AAB, store listing and data-safety declaration are future maintainer tasks.

**iOS:** defer to macOS/Xcode and a separate platform validation; this is out of scope for the first Android smoke.
