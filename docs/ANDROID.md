# Android development setup (not yet device-tested)

These steps follow the official [Tauri v2 mobile prerequisites](https://v2.tauri.app/start/prerequisites/). The first native build must be tested on a contributor's configured machine.

1. Install Node.js 22.12+/24+, Rust 1.90+, Android Studio with compatible SDK platform, SDK platform tools, command-line tools and NDK, plus Android Studio's JDK.
2. Configure `JAVA_HOME`, `ANDROID_HOME` and `NDK_HOME` using the versions installed by Android Studio. Restart your terminal.
3. Install Rust Android targets (at least `aarch64-linux-android` for ARM64 phones; add x86_64 for emulators).
4. Run `npm install`, `npm run check`, then `npm run android:init`. Initialization creates a **local, ignored** `src-tauri/gen/android` Android Studio project.
5. With emulator or USB-debugging phone attached, run `npm run android:dev`. Ensure development server is reachable from the device; Android/WebView network rules may need local development configuration.
6. To attempt a local build, `npm run android:build`. This does **not** sign or publish a Google Play release.

For browser-only UI: `npm run dev`, then visit `http://localhost:1420`. The native runtime probe will gracefully report browser preview.

The `npm run icons` script uses the maintainer-supplied official PNG emblem; see [brand icon](BRAND_ICON.md). Artwork rights and the separate chart-glyph distribution rights still require review before release. Do not commit `src-tauri/gen/`, generated signing files or local secrets. The Google Play release track, signed AAB, store listing and data-safety declaration are future maintainer tasks.

**iOS:** avoid Android assumptions in shared packages. Later on macOS with Xcode and iOS Rust targets, use `npm run ios:init`, `npm run ios:dev`. This is deliberately out of scope for the first Android smoke.

## Local Windows build checkpoint — 2026-11-16

A local x86_64 debug APK and AAB were built with `npm run android:build -- --debug --target x86_64`, Node 22.18, the installed Android SDK, NDK 28.2.13676358 and the JDK bundled with Android Studio. Gradle needs the `npm run tauri` script. Build success does not establish that the app runs on a device: the configured emulator remained offline during this check.

On this machine the generated, ignored Android project has local SDK and Gradle JDK paths configured. Open `src-tauri/gen/android` in Android Studio; after regenerating it, configure these paths again. For CLI builds set `ANDROID_HOME`, `NDK_HOME`, and `JAVA_HOME` to the installed toolchain. APKs are debug artifacts, not store releases.

## Android Studio Run — Windows ARM64

The generated Gradle project needs a live Tauri CLI options server. Opening the generated project by itself and pressing Run can fail with `cli-options-server.json` missing. Start Android Studio through Tauri, keep the original PowerShell window open throughout the session, and select the `arm64Debug` variant for an ARM64 device. The following paths reflect the toolchain verified on this machine; adapt them elsewhere. Close existing Android Studio windows first so the newly started IDE inherits the environment.

```powershell
cd D:\GitHub\virgostars-mobile-app
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$env:NDK_HOME = Join-Path $env:ANDROID_HOME 'ndk\28.2.13676358'
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio1\jbr'
$env:PATH = "C:\nvm4w\nodejs;$env:USERPROFILE\.cargo\bin;$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"
npm run android:studio:arm64
```

Wait for the initial build and for Android Studio to open; then use Run while the PowerShell command is still running. This command bundles the current frontend at startup: restart it after frontend changes. It uses the default VirgoStars-Ephemeris provider; DE441 data must be imported separately in the app. It is a debug build, not a release.

Alternatively, `npm run android:debug:arm64` builds a standalone debug APK using the same provider, without keeping Android Studio open. Install it using Android Studio or `adb install -r <apk>`; do not uninstall an existing app to work around a signing mismatch, because uninstalling deletes its local archive. A physical phone needs USB debugging authorized. The desktop city catalog must be available as described in [DESKTOP_CITIES.md](DESKTOP_CITIES.md).

On 2026-11-18, `android:debug:arm64 -- --ci` built a local APK containing the ARM64 library and desktop city database. It was installed over an existing debug installation on a connected Pixel 8 Pro using `adb install -r -t`; the package manager reported success. App startup and functionality on the phone were not tested in that check. The Android Studio `--open` workflow itself was not re-tested in that check.

The separate `android:studio:swiss-arm64` script remains available only for the local Swiss prototype; its licensing and limits are described in [SWISS_LOCAL_PROTOTYPE.md](SWISS_LOCAL_PROTOTYPE.md). For an x86_64 emulator, use the same environment setup above but start `npm run android:studio:swiss-x86_64` instead, and select `x86_64Debug` in Android Studio. Restart Tauri when switching target architectures; the server needs the matching Android linker configuration. If an emulator remains offline during startup, try a cold boot without deleting data; the separately configured `VirgoStars_Test` AVD was locally verified with `-no-snapshot -gpu swiftshader_indirect`. If Gradle reports `npm.bat` after the missing server error, inspect the earlier output: the generated Windows task tries multiple npm extensions after *any* failure. If npm is actually missing, verify `npm.cmd` is available in the IDE's inherited PATH and restart the IDE from the configured terminal.
