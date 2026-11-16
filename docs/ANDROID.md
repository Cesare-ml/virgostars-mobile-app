# Android development setup (not yet device-tested)

These steps follow the official [Tauri v2 mobile prerequisites](https://v2.tauri.app/start/prerequisites/). The first native build must be tested on a contributor's configured machine.

1. Install Node.js 22.12+/24+, Rust 1.90+, Android Studio with compatible SDK platform, SDK platform tools, command-line tools and NDK, plus Android Studio's JDK.
2. Configure `JAVA_HOME`, `ANDROID_HOME` and `NDK_HOME` using the versions installed by Android Studio. Restart your terminal.
3. Install Rust Android targets (at least `aarch64-linux-android` for ARM64 phones; add x86_64 for emulators).
4. Run `npm install`, `npm run check`, then `npm run android:init`. Initialization creates a **local, ignored** `src-tauri/gen/android` Android Studio project.
5. With emulator or USB-debugging phone attached, run `npm run android:dev`. Ensure development server is reachable from the device; Android/WebView network rules may need local development configuration.
6. To attempt a local build, `npm run android:build`. This does **not** sign or publish a Google Play release.

For browser-only UI: `npm run dev`, then visit `http://localhost:1420`. The native runtime probe will gracefully report browser preview.

The `npm run icons` script uses the original SVG placeholder; replace this with properly licensed, reviewed brand art before distributing the app. Do not commit `src-tauri/gen/`, generated signing files or local secrets. The Google Play release track, signed AAB, store listing and data-safety declaration are future maintainer tasks.

**iOS:** avoid Android assumptions in shared packages. Later on macOS with Xcode and iOS Rust targets, use `npm run ios:init`, `npm run ios:dev`. This is deliberately out of scope for the first Android smoke.

## Windows 11: first APK verification checklist

From PowerShell in the repository root (with Android Studio SDK/NDK installed and environment variables configured):

```powershell
node --version
npm --version
rustc --version
rustup target add aarch64-linux-android
npm install
npm run check
npm run android:init
adb devices
npm run android:build
```

If `android:init` reports that the Android project already exists, do not delete it; continue with the build. The Android build requires a working Android SDK/NDK, Java installation and the generated local Tauri Android project. Record the full terminal output and generated APK path; **do not claim an APK exists merely because the Angular build succeeds**. For an actual device test, connect a USB-debugging phone and confirm it is listed by `adb devices`, then use `npm run android:dev` or install the generated debug APK with `adb install -r <actual-apk-path>`.

### Physical device acceptance criteria

- App launches to the zodiac wheel without login, network access or entering birth data.
- Ten bodies and their sign/longitude values are visible; observation time is current.
- Leaving the app in the background and returning updates the observation time and positions.
- The language switch updates labels without losing the current sky.
- Screen remains readable on a narrow phone and after a device rotation.
- No unexpected WebView errors or crashes after several background/foreground cycles.
- Compare at least one UTC instant and all ten longitudes against an independent ephemeris before calling numerical accuracy verified.

**Status:** These are execution instructions, not a record of successful tests. Until the commands and physical-device checks are actually run, the Android build and APK remain **unverified**.
