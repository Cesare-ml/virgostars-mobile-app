# DE441 in VirgoStars Mobile — local pack custody (prototype)

Status: **implemented source / contract-tested; native build and Android device test pending**.

The **astronomical reader and calculations belong only in [VirgoStars-Ephemeris](https://github.com/Cesare-ml/VirgoStars-Ephemeris)**. The mobile application manages files; it does **not** parse coefficients, split the DE441 kernel, calculate positions or download the complete kernel.

## Pack profile

- Base: **1600–2100**, 46,599,968 bytes (~46.6 MB).
- Eight optional historical slices: **0–1599**, 200 years per file.
- Optional future slice: **2101–2300**.
- Total ten files, 214,130,192 bytes (~214 MB).
- File names, byte counts and SHA-256 are in `src/assets/de441-pack-catalog.json`. The catalog contains no binary ephemeris data or URLs.
- Generated against the same locally held DE441 source, with same-source parity checks. **Not yet independently validated** against external JPL/NASA reference vectors.
- **Distribution rights pending review**. Do not include `.eph` files in Git, APK/AAB, or public hosting.

## What is implemented

1. In the native app, open **Opzioni → Effemeridi DE441**.
2. Choose **Importa file locale** for a missing interval and pick its exact local `.eph` file.
3. Angular reads the selected file in **128 KiB chunks** and sends only the bytes to a specifically named Tauri command.
4. Rust writes to a temporary file in the app-private data directory (`de441-packs/`), checks the complete byte count and streamed SHA-256 against the **compiled-in** catalog, flushes the file, then atomically renames the verified file.
5. **Verifica SHA-256** rehashes an installed pack on demand; **Rimuovi** deletes only that exact catalogued file, after user confirmation.
6. A failed import clears its staging file. The native app does not ask for broad filesystem, networking, or storage permissions. The Android WebView file picker still needs device QA.
7. The user can cancel during chunk upload. The transfer stops at the next safe chunk boundary, Rust deletes the partial staging file, and no incomplete file is installed. Once final SHA-256 verification begins, cancellation is disabled until its atomic outcome.
8. A **separate, opt-in source-only diagnostic** now calls the canonical `De441PackManager` from the Rust library: `de441_probe` selects an installed pack by **JD TDB**, checks its fixed-catalog SHA-256 and returns only a geometric ICRF/J2000 position and velocity. Ordinary builds report `provider_unavailable`; the diagnostic requires the Cargo feature `de441-native-probe`. See [diagnostic protocol](#optional-rust-reader-diagnostic).

No network downloads are offered until legal provenance, independent science validation, secure hosting and an allowed, integrity-pinned distribution mechanism are agreed.

## What is *not* yet integrated

- The app's `calculate_chart` provider does **not yet** call `De441PackManager` and does not use installed slices. The isolated diagnostic does not compute apparent/geocentric ecliptic longitude, light-time, aberration, precession/nutation or reliable UTC→TT→TDB. Connecting actual charts must follow independent reference comparisons and explicit astronomical conversion tests. Until then the existing local-use Swiss provider remains optional and unchanged.
- No native Android build or real-device import test was performed by this change. The WebView file selector, storage persistence across restart, low-memory behaviour, long transfers and interrupted app processes require a physical-device/emulator check.
- **Device QA intentionally deferred by Mirko:** tracked in [mobile issue #32](https://github.com/Cesare-ml/virgostars-mobile-app/issues/32). Continue source development but do not mark native validation complete or release this feature until checked.
- No remote download, auto-update, cloud transfer, background task or installation of the full 2.79 GB `de441.eph`.
- Historical year 0 is astronomical numbering (= 1 BCE). Slices use *JD TDB* logical date boundaries. File records can have intentional overlaps at each boundary: Rust reader selection, not the mobile UI, resolves that.

## Validate using the files already on your Windows PC

From `D:\GitHub\virgostars-mobile-app`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-de441-mobile.ps1 -PacksDirectory "D:\VirgoStars-DE441-Mobile\packs"
```

The script checks exact file hashes without copying or re-downloading the source kernel, then runs the Node contract tests. When the app and its sibling dependencies are installed and the Android toolchain is ready, use `npm run android:dev` to test import interactively.

## Optional Rust reader diagnostic

The code is staged behind a deliberate Cargo feature, **off by default**:

```powershell
cd D:\GitHub\virgostars-mobile-app\src-tauri
cargo check --locked --features de441-native-probe
```

It references a specific, reviewable VirgoStars-Ephemeris commit with `De441PackManager`, without copying the reader into the app. This command downloads **Rust source dependencies if not cached**, but **never downloads DE441 ephemeris files**. A real on-device build still requires Android/Tauri SDK configuration and must be tested later.

The version-1 IPC command is `de441_probe` (not exposed as a UI action). Example developer request:

```json
{
  "request": {
    "protocolVersion": 1,
    "jdTdb": 2451545.0,
    "target": "sun",
    "center": "earth"
  }
}
```

Successful results include `selectedPackId`, numeric `positionKm[3]`, `velocityKmPerDay[3]` and explicit provenance: `frame=ICRF/J2000`, `quantity=geometric`, `epochScale=TDB`, `lengthUnit=km`, `speedUnit=km/day`, `source=de441_classic`. They are not final astrological degrees and **must not** be rendered as natal placements. Failure statuses are normalized (`provider_unavailable`, `invalid_request`, `outside_coverage`, `missing_pack`, `invalid_pack`, `storage_unavailable`, `reader_failed`), without revealing the app-private path. Import/verification is explicit and offline; the diagnostic does not fetch, distribute or auto-install missing packs.

The TypeScript contract is `src/app/native/de441-probe-contract.ts`; the optional invoking adapter is `src/app/native/de441-probe.ts`. Both are intentionally unused by the natal chart implementation. Local Node contract tests may pass even if the native feature cannot yet be compiled on Android.

## Security

- Only fixed IDs compiled into the JSON catalog can be selected by native IPC. The UI cannot pass arbitrary source paths or target filenames.
- Only an explicit user-selected local file can be imported; SHA and length must match before installation.
- A failed SHA check never replaces an installed file.
- A maximum of one import session at a time and 128 KiB per IPC chunk prevent accidental multi-gigabyte in-memory buffering.
- No personal birth records or credentials are persisted by this feature.

See [Security](SECURITY.md), [Architecture](ARCHITECTURE.md) and [Roadmap](ROADMAP.md).
