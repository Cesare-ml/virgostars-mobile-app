# DE441 mobile ephemeris packs — selected packaging profile

Status: **Adopted product profile / implementation pending**, 2026-11-18.
Canonical numerical engine: [VirgoStars-Ephemeris](https://github.com/Cesare-ml/VirgoStars-Ephemeris) in Rust.
Exporter work item: [VirgoStars-Ephemeris #599](https://github.com/Cesare-ml/VirgoStars-Ephemeris/issues/599).

## Why this profile

Use **one astronomical solution, JPL DE441**, for all packs. Keep the installed mobile data small while permitting the requested epoch range from astronomical year 0 through civil/astronomical year 2300. Avoid mixing DE406, DE440 and DE441 silently. Current mobile Swiss/Moshier prototype is not an implemented DE441 adapter, and this document does not claim otherwise.

**Selected split:**
- **Core pack:** [1600-01-01, 2101-01-01), always local after a future validated installation; covers years 1600–2100 inclusive.
- **Optional on-demand packs:** historical [0,200), [200,400), [400,600), [600,800), [800,1000), [1000,1200), [1200,1400), [1400,1600) plus future [2101,2301). These are 8 historical packs and 1 future pack, each ~200 years. Intervals denote astronomical calendar years; exact JD TDB boundaries must appear in the generated manifest.
- Any downloaded optional pack remains available offline until deliberately removed through Settings. Missing coverage is an explicit typed error and an optional download prompt initiated by the UI, never an implicit network call by the astronomy engine or a silent lower-precision fallback.
- Pack boundaries must preserve any intersecting source Chebyshev records, may overlap in physical record storage, and must provide exact continuous coverage without gaps or double-counting under a stated precedence rule.

## Size screening (planning estimates only)

Using approximately 2.6 GB for the complete classic DE441 over ~30,391 years, and ~3.308 GB for the two NAIF DE441 SPK parts over the same interval. Divide by covered years to get a first-order linear estimate. Real size varies with record granularity, metadata, coefficient series, binary format and compression.

| Candidate | Span | Classic JPL estimate | SPK estimate | Decision |
| --- | ---: | ---: | ---: | --- |
| 1800–2200 | 400 years | ~34 MB | ~44 MB | Smaller but loses valuable early history |
| **1600–2100** | **500 years** | **~43 MB** | **~54 MB** | **Selected default mobile core** |
| 1800–2300 | 500 years | ~43 MB | ~54 MB | Same weight, but less historical coverage |
| 1600–2300 | 700 years | ~60 MB | ~76 MB | Larger base, unnecessary |
| 0–2300 | 2300 years | ~197 MB | ~250 MB | Complete optional coverage, not base download |
| Any 200-year optional pack | 200 years | ~17 MB | ~22 MB | On-demand historical/future module |

Note: including the entire final year (2100 for base, 2300 for complete coverage) adds nearly one calendar year to the rough endpoint-to-endpoint estimate. Figures are **not actual extracted file sizes** and do not demonstrate any particular lossless/lossy compression ratio.

The selected base shifts 200 years of coverage earlier **without materially changing the weight** compared with 1800–2300. Optional packs give fine-grained selective downloads before 1600 and after 2100, preserving the *same DE441 model* throughout. A user who needs the entire 0–2300 range can install all packs (combined storage still roughly corresponds to 0–2300).

## Settings: offline ephemeris manager (future feature)

Add a dedicated **Settings → Offline ephemerides** screen with:
- A fixed **Base (1600–2100)** row, with installed version, source, exact year coverage and disk usage. The base pack is part of the validated app install and cannot be removed independently (uninstalling the app is separate).
- Nine optional rows grouped as **Historical (0–1599)** and **Future (2101–2300)**, each showing coverage, actual size, state (not installed/downloading/verifying/installed/failed), progress, and **Download** / **Remove** actions.
- Total ephemeris storage used and available device space; disk-capacity preflight, network/data-size confirmation, cancellation/retry, and an explicit removal confirmation showing which time coverage will become unavailable.
- A removed pack must never delete saved charts, user birth information or preferences; existing charts outside available coverage require downloading their corresponding pack again to recalculate.
- Pack list and active-coverage status must remain usable offline; no automatic background downloads or third-party HTTP calls without user action. After verification, packs are cached persistently and accessible with airplane mode enabled.
- UI-friendly, typed failures: missing range, checksum mismatch, interrupted download, insufficient storage, incompatible pack version and corrupt files; maintain previous validated pack until replacement commits atomically.
- If a chart request has no locally installed coverage, explain the missing period and offer to install the relevant pack; never silently switch to another ephemeris model.

The screen and pack downloader **are not yet implemented**. The roadmap and Rust exporter issue are implementation tracks, not evidence of a working UI.

## Binary provenance and scientific contract

- Original source: JPL DE441, not data generated by or licensed under VirgoStars CPAL. Record source location, version, file hash, JPL/NAIF references, rights review and independent distribution terms.
- Input/output epochs: manifest must specify **Julian Date TDB** and astronomical year numbering. Year 0 is 1 BCE; do not conflate with historical calendar conventions.
- Retain exact source coefficient records initially; the slice writer must rebuild a valid self-contained index and headers for the chosen format. **Never** truncate or concatenate raw bytes while leaving stale offsets.
- Explicitly declare covered bodies and target-center chains, coordinate frame (ICRF/J2000 where applicable), geometric state units (km and km/day), and supported corrections. A slice must not accidentally drop Earth–Moon reconstruction data.
- The Rust reader may have different support for classic binary DE441 and NAIF DAF/SPK; verify the selected exporter/reader pair before selecting a distributable file extension.
- Record full-precision requested JD start/end and effective record boundaries; ensure day/hour queries near cutover points remain valid.

## Mobile behavior and gates

1. Provider selection is typed: selecting DE441 packs never falls back invisibly to Swiss, Moshier or another JPL model. Unsupported epoch => explicit missing-range error and user-action download UX.
2. Download/cache feature (future): HTTPS, verified full SHA-256, atomic install, disk quota check, abort/retry, removable optional packs, clear provenance and version display; offline queries never depend on a running service.
3. Source and generated kernel data live outside Git. **No binary assets or new remote calls in this docs-only PR.** Before bundling, complete a separate dataset redistributability/provenance review.
4. Benchmarks on Android ARM64: true compressed/uncompressed disk bytes, initial download/install overhead, open latency, repeated position batch latency, peak RSS, battery/CPU and offline restart.
5. Scientific validation must compare pack vs **full parent DE441** for identical TDB epochs (coefficient-level parity when no re-encoding), plus **independent** NASA/NAIF or JPL Horizons reference vectors. Cover each body, velocities, extreme epochs, all 9 hand-off boundaries, both sides of every Chebyshev record boundary and corrupt files.
6. Only consider new lossy polynomial quantization after a published and independently verified error budget. Target package size or a claim of 0.001 arcsecond precision must not be promised without evidence.
7. The production adapter, Android packaging and app-store/release flow remain separately gated; this is an implementation contract, **not shipped functionality**.

## Sources

- [JPL DE440/DE441 scientific overview](https://ssd.jpl.nasa.gov/doc/de440_de441.html)
- [JPL planetary ephemeris export and format](https://ssd.jpl.nasa.gov/planets/eph_export.html)
- [NAIF SPK reference and kernel selection](https://naif.jpl.nasa.gov/naif/kernel_selection.html)
- [Existing core reader and constraints](https://github.com/Cesare-ml/VirgoStars-Ephemeris/blob/main/docs/DE441.md)
- [VirgoStars data distribution preflight](https://github.com/Cesare-ml/VirgoStars-Ephemeris/blob/main/docs/KERNEL_DATA_DISTRIBUTION_PREFLIGHT_2026-11-14.md)

The public JPL materials are factual technical references; they do not automatically grant the rights to relicense third-party kernels as CPAL.
