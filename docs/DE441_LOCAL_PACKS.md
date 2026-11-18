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

No network downloads are offered until legal provenance, independent science validation, secure hosting and an allowed, integrity-pinned distribution mechanism are agreed.

## What is *not* yet integrated

- The app's `calculate_chart` provider does **not yet** call `De441PackManager` and does not use installed slices. Adding the IPC to the canonical Rust engine must follow review of the new upstream API, astronomical reference comparisons and mobile binding tests. Until then the existing local-use Swiss provider remains optional and unchanged.
- No native Android build or real-device import test was performed by this change. The WebView file selector, storage persistence across restart, low-memory behaviour, long transfers and interrupted app processes require a physical-device/emulator check.
- No remote download, auto-update, cloud transfer, background task or installation of the full 2.79 GB `de441.eph`.
- Historical year 0 is astronomical numbering (= 1 BCE). Slices use *JD TDB* logical date boundaries. File records can have intentional overlaps at each boundary: Rust reader selection, not the mobile UI, resolves that.

## Validate using the files already on your Windows PC

From `D:\GitHub\virgostars-mobile-app`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-de441-mobile.ps1 -PacksDirectory "D:\VirgoStars-DE441-Mobile\packs"
```

The script checks exact file hashes without copying or re-downloading the source kernel, then runs the Node contract tests. When the app and its sibling dependencies are installed and the Android toolchain is ready, use `npm run android:dev` to test import interactively.

## Security

- Only fixed IDs compiled into the JSON catalog can be selected by native IPC. The UI cannot pass arbitrary source paths or target filenames.
- Only an explicit user-selected local file can be imported; SHA and length must match before installation.
- A failed SHA check never replaces an installed file.
- A maximum of one import session at a time and 128 KiB per IPC chunk prevent accidental multi-gigabyte in-memory buffering.
- No personal birth records or credentials are persisted by this feature.

See [Security](SECURITY.md), [Architecture](ARCHITECTURE.md) and [Roadmap](ROADMAP.md).
