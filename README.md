# VirgoStars Mobile

**Android-first, iOS-ready mobile companion to [VirgoStars Desktop](https://github.com/Cesare-ml/virgostars-desktop).**

Experimental open-source client built with **Angular 20 + TypeScript + Tauri 2 + Rust**. This repository is a **bootstrap prototype**, not a released or production-ready astrology app.

- **Android:** first supported development target.
- **iOS:** architecture prepared; native setup, testing and distribution deferred until macOS/Xcode and signing are available.
- **Offline-first goal:** Android has an experimental device-only encrypted chart archive; profiles and conflict-safe synchronization are planned.
- **Present functionality:** responsive Italian/English shell, experimental native VirgoStars-Ephemeris calculation and an Android encrypted archive. The default build needs externally supplied DE441 data; without it the provider is unavailable. The calculated chart is displayed with the shared renderer and locally staged private VirgoStars glyphs; remaining graphics use locally generated synthetic placeholders; login and sync are not integrated.

[VirgoStars-Ephemeris setup and limitations](docs/EPHEMERIS_INTEGRATION.md). [Experimental local Swiss provider and limitations](docs/SWISS_LOCAL_PROTOTYPE.md). [Offline place catalog and attribution](docs/GEONAMES_CATALOG.md). [Chart symbols and font licenses](docs/CHART_SYMBOLS.md).

Android place search uses the same offline SQLite catalog as VirgoStars Desktop, including its country and time-zone fields. On first search the packaged database is verified and copied into private device storage; coordinates and IANA time zone remain editable. The catalog must be staged locally before a build; see [desktop city catalog](docs/DESKTOP_CITIES.md).

In **Options → DE441 ephemeris data**, import or update a compatible classic DE441 file, the USNO ΔT tables and a compatible Chiron SPK. Select both required USNO files together; the predictions file is optional. These data are obtained separately, validated and installed locally; none is supplied or downloaded by the app.

On the chart, use the zoom controls to enlarge the wheel up to 300%, then scroll in either direction to explore it. Fit returns to the full wheel; planet selection remains available while zoomed.

The planets panel shows glyphs for each available body and sign, with position, house and provider source. Expand a body for longitude and latitude speeds, equatorial coordinates, distance and distance rate. Accessible labels follow the selected language; these are experimental provider values, not independently verified astronomical results.

Applicable natal aspect rows can show experimental A/S marks for applying or separating; unsupported motion, exact/stationary contacts and declination remain unmarked. The list does not claim that every listed aspect has a line on the wheel. Transit and synastry interfaces are temporarily hidden.

The chart form accepts local times with optional seconds and milliseconds, and can use the current minute in the selected time zone. Beneath the wheel, the compact time controls move by minutes, hours, days, months or years while keeping the last drawn chart visible during recalculation. **Change chart location** accepts a place from the offline catalog or manual coordinates and an IANA time zone, with an explicit choice to keep the UTC instant or the local clock time. Check historical location and time-zone information independently. **Restore** returns to the last direct calculation or reopened chart. A failed navigation calculation keeps the previous chart. For a repeated local time, choose the first or second occurrence; a nonexistent time requires a different step. See the [Desktop 0.0.1 parity checkpoint](docs/DESKTOP_PARITY.md) for the remaining work.

The header's **Sky** button returns from a saved chart to the sky at the last sky location, and starts updates every 33 seconds. On the sky it pauses or resumes updates; the indicator is green when running and yellow when paused. Editing the chart, leaving its tab or backgrounding the app pauses updates. The current-sky startup starts live updates when possible.

The unified chart screen opens on the current sky or the selected startup chart and offers the wheel, latitudes, planets, aspects, elements and tools. Elements count the ten major planets by zodiac-sign element. New charts are created from the archive. The canvas supersamples screen density and zoom with bounded resolution and a transparent background. House system is configured in searchable Options; Placidus is the default. New installations use a light theme and the device language when Italian is supported, otherwise English; existing saved preferences are preserved.

In **Elements**, show the dodecatemoria of the available seven traditional planets with their zodiac positions and houses in the selected house system. The calculation uses the shared `astrological-functions` convention; unavailable planets and houses are not invented.

Settings offer light/dark presentation, Italian/English, house system and aspect/point display and orbs. Android stores these non-personal preferences in app-private no-backup files, migrates available old WebView settings and warns if persistence fails. [Details and limitations](docs/PREFERENCES_PERSISTENCE.md).

Android users can save, search, update, reopen and delete chart inputs in a local encrypted archive. **Save** in the new-chart form stores the inputs before calculating; if saving fails, calculation does not proceed. Reopening recalculates the chart and therefore needs compatible ephemeris data. Choose the startup sky or a saved chart in Options. The navigator supports repeated stepping, calendar-field adjustments, confirmed update and saving a separate election chart. The archive is bound to this app installation and excluded from Android backup: uninstalling the app or losing its key makes it unrecoverable. It is experimental and has no account, synchronization, export or recovery. [Implementation and verification](docs/ARCHIVE_CORE_EXPERIMENT.md).

Local builds require the sibling `astrological-assets` checkout. The build stages only individually hash-verified glyphs into ignored local build output under the existing private-use approval; this does not clear public redistribution of the resulting APK. See [chart assets and rights](docs/CHART_SYMBOLS.md).

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

`npm run android:init` generates icons from the repository's original SVG and initializes the Android project (generated native project is ignored). Set `ANDROID_HOME`, `NDK_HOME` and `JAVA_HOME` as required by your toolchain. Launch an Android emulator or connect a device with USB debugging. To attempt an unsigned/local build later, use `npm run android:build`; Google Play publication requires separate signing and release work. No publication is automated.

For Angular-only browser development, run `npm run dev`. The native probe displays a browser-safe fallback when Tauri is unavailable.

For Android Studio Run on Windows ARM64, use the [Tauri-backed launch instructions](docs/ANDROID.md#android-studio-run--windows-arm64); opening the generated project alone does not start the required Tauri process.

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
- `npm run check` runs contract tests, Angular compilation and chart-symbol verification. Android builds require a configured Android toolchain; local debug builds have been exercised on an emulator and a Pixel 8 Pro. This is not release validation.
