# VirgoStars Mobile

**Android-first mobile companion to VirgoStars Desktop.**

The first MVP opens directly on a live geocentric sky chart: Sun, Moon and the eight major planets, placed in the tropical zodiac and refreshed once per minute. The on-screen clock advances every second. No account, birth record, server connection or manual setup is required to see the current sky.

## Current MVP

- Angular 20 + TypeScript + Tauri 2 + Rust; Android is the first native target.
- Real planetary longitudes calculated locally by **Astronomy Engine 2.1.19** (MIT), a temporary astronomy provider while VirgoStars-Ephemeris remains experimental.
- Geocentric, tropical, true ecliptic-of-date positions.
- Responsive zodiac wheel and sign/degree/minute list in Italian and English.
- No synthetic positions or fabricated chart values.
- No Ascendant or houses: those require an observer location and separately validated house-method integration. This MVP does not request location.
- Provider boundary isolated in `src/app/current-sky.mjs`, replaceable by the canonical VirgoStars-Ephemeris adapter when validation and native integration are ready.

## Get started (Android)

Requirements: Node.js 22.12+ (or 24+), npm, Rust, Android Studio (SDK/NDK/platform tools), compatible JDK and Rust Android targets. Follow the official Tauri v2 mobile prerequisites.

```bash
git clone https://github.com/Cesare-ml/virgostars-mobile-app.git
cd virgostars-mobile-app
npm install
npm run check
npm run android:init
npm run android:dev
```

To attempt a local Android build, run `npm run android:build`. This does not sign or publish a Google Play release.

For browser preview: `npm run dev`, then visit `http://localhost:1420`.

## Architecture and constraints

```text
src/app/current-sky.mjs      Astronomy provider adapter and chart DTO
src/app/app.component.*      Live chart UI, one-minute refresh and locale
src-tauri/                   Tauri 2 Rust mobile host
tests/                       Contract and ephemeris regression tests
docs/                         Architecture, roadmap, privacy, Android setup
```

Do not bundle personal birth records, signing keys, paid datasets or unlicensed kernels. The temporary provider is MIT-licensed; its notice is documented in `docs/THIRD_PARTY_NOTICES.md`. Canonical VirgoStars-Ephemeris remains the future source of truth after scientific validation.

## Project policy

- Architecture, roadmap, security, Android setup and contributor rules are documented under `docs/` and `AGENTS.md`.
- Original project source is CPAL-1.0 with the required visible **Powered by VirgoStars** attribution. Third-party dependencies retain their own licenses.
- No GitHub Actions, deployments, store publication, signing material or unattended releases.
- Android compilation and device validation require a configured Android toolchain; do not claim a native build until it has been run.
