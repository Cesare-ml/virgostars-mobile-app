# Swiss Ephemeris local prototype

Status: experimental, local use only; not a release or validated natal chart. `chart_calculation.rs`, `swiss_provider.rs` and `src/app/native/chart-calculation*` derive from the CPAL-1.0 VirgoStars Desktop project. Attribution remains visible in the app. The provider is optional and disabled by default; the UI displays geocentric apparent positions and the actual source. With no configured Swiss files it uses Moshier, not Swiss ephemeris data files. Unavailable bodies and house systems are explicitly reported. The user supplies local civil time and an explicit IANA zone; the app resolves it to UTC and rejects DST gaps, while requiring an earlier/later choice for overlaps. The offline GeoNames city selector suggests coordinates and an IANA zone; users must verify them for the place and date.

For a private local build with the Android toolchain configured:

```powershell
npm run android:build -- --debug --target aarch64 --features swiss-ephemeris
```

Swiss Ephemeris has AGPL or professional terms. The Desktop maintainer checkpoint states no professional licence was held and limits this provider to local use; do not distribute binaries or enable the feature by default pending the applicable rights decision. `sweph-sys` links third-party code. No Swiss data files are packaged. This prototype has not been independently validated end-to-end. The renderer and functions use sibling local checkouts; the UI wheel uses open-font zodiac, house and body symbols over verified synthetic placeholders, not original artwork. The native Android renderer has passed an emulator smoke test; physical-device testing remains open.
Source reference: VirgoStars Desktop commit `b692b95eea1c8ba28bf8c4421388a6109cd8ccf9`; mobile adapts coordinate validation to reject integer minimum without overflow.

## Shared renderer setup

From sibling checkout `astrological-charts`, run `npm ci`, `npm run build:library` and `npm run demo:pack` if its synthetic pack is not already present. Keep `astrological-functions` checked out beside this repository. In the mobile checkout run `npm ci` and `npm run check`. `prepare:charts` verifies the synthetic pack manifest and stages only its generated images in ignored `.local/frontend`; it refuses changed or non-synthetic packs. No proprietary artwork is copied. The adapter and asset staging script derive from the Desktop commit noted above. The graphical renderer is experimental; touch interaction, low-memory handling and physical-device behavior have not been verified on Android.

For the stacked DE441 branch at mobile commit `9bc0226`, the renderer API was
successfully compiled against `astrological-charts` commit
`cf7b323ffd1be260d482ea101124522ebc6910d0`, the draft
[Charts PR #146](https://github.com/Cesare-ml/astrological-charts/pull/146)
based on experimental commit `4ec8b883f448c10e18e12a5570d6c7a75ccc2f45`.
That PR fixes the library tsconfig and stale interaction-test probes; its
`npm run build:library` and 34 interaction tests passed locally. The mobile
dependency remains a local `file:` reference, so its lockfile does not pin the
sibling Git commit; verify the checkout and rebuild its output before `npm ci`.
The renderer revision is not integrated into Charts `main`, source/artwork
rights review remains pending, and build success is not visual validation.
## Android emulator checkpoint — 2026-11-16

A locally built debug APK with `swiss-ephemeris` was installed on a separate x86_64 Android 36.1 emulator. After a cold start with emulator Wi-Fi and mobile data disabled, a fictional J2000 request returned Swiss Ephemeris 2.10.03 / Moshier results (Sun 280.3689°, Moon 223.3238°), five house systems and Chiron unavailable; the shared chart rendered with synthetic checkerboard artwork. The emulator network was restored afterwards. Europe/Rome 2024 DST gap and overlap were checked in the actual app, including the later occurrence mapping to 01:30 UTC. These are local smoke checks, not a scientific accuracy audit, real-device test or release.

The emulator exposed Angular component CSS being rejected by Tauri CSP. The bootstrap now provides Angular the nonce already inserted in the trusted document by Tauri; this preserves the CSP. After rebuilding, the WebView showed matching style nonces and the expected layout. Touch handling, low-memory and physical-device behavior remain open.
## Renderer interaction checkpoint — 2026-11-16

On the Android 36.1 x86_64 emulator, the UI offered the five house systems returned by the provider; selecting `placido` completed a redraw without an error. Rotating to landscape preserved the selected system, result and canvas (viewport 914×411 CSS pixels). A simulated `WEBGL_lose_context` event put the control into loading state; restoring it triggered a redraw, retained `placido` and left no chart error. A screenshot showed the synthetic wheel after recovery. This is a single emulator smoke test, not a physical-device, touch-gesture, memory-leak or scientific validation.
## Chart inspector checkpoint — 2026-11-16

The app lists each available calculated body with its zodiac sign, degree and minute within that sign, retrograde mark when longitude speed is negative, house in the selected system, absolute longitude and actual ephemeris source. House lookup uses `astrological-functions`; unavailable or invalid house cusps give no house instead of an invented result. A zodiac-boundary test prevents a degree just below 30° from appearing as 30°00′.

On the Android 36.1 x86_64 emulator, a fictional Rome chart showed the Sun at 10°19′ Capricorn and the corresponding house. Switching from Egizia to Placidus changed at least one listed house, and navigating away and back preserved the Placidus selection and list. This verifies one local case, not complete astrological or physical-device validation.
## Planet selection checkpoint — 2026-11-16

The mobile host connects the shared renderer's natal planet click events to the calculated-body list. The list offers keyboard-accessible toggle buttons with `aria-pressed`; the chart announces the current selection. Only body IDs returned by the current provider can be selected, and no new aspects or astronomy are computed. Selection is kept in memory when navigating between app tabs and reapplied to the scene after redraw; it is cleared for a new calculation or a new place.

On the Android 36.1 x86_64 emulator, an injected Android touch on the Sun glyph selected the Sun in the list; a second touch cleared it. Selecting Sun from the list survived switching tabs, changing houses and simulated WebGL context loss/restoration. This is one emulator case, not a complete touch-target, TalkBack, physical-device or GPU-lifecycle audit.
