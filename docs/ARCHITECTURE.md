# Architecture — VirgoStars Mobile

Status: **current-sky MVP foundation in progress** (2026-11-16). Android first, iOS later.

## Decision

```text
Angular current-sky screen
      | CurrentSkyService (permission, timestamp, fresh foreground GPS, refresh)
      | typed versioned CurrentSkyInput / CurrentSkySnapshot DTO
      |
Tauri 2 IPC: calculate_current_sky
      |
Rust mobile host + persistent CurrentSkyProvider trait object
      +-- provider adapter (default: fail-closed unavailable provider)
      |     +-- temporary Swiss Ephemeris only after distribution-license approval
      |     +-- future VirgoStars-Ephemeris canonical Rust adapter
      +-- astrological-functions contract (not integrated)
      +-- astrological-charts renderer (not integrated)
      |
local device only; no account, network, persistence or backend dependency
```

The UI and native bridge have a typed contract for observer, timestamp, timezone, provider provenance, ten planetary positions, Ascendant/MC, 12 house cusps and aspects. The Rust host retains one provider object for the app lifetime so a future provider can load data once and reuse it. The current provider is intentionally unavailable; it does not synthesize an astrologic result.

## Refresh policy

- On launch, the app explains the need for location and requests permission only after the user taps the consent CTA.
- On first permission grant, acquire a fresh one-shot foreground GPS fix and capture the exact device UTC instant immediately before the fix request.
- While foregrounded, check position every 15 seconds; request a new calculation at most once per minute, or after at least 250 metres of movement.
- On resume, request a fresh fix and calculation immediately.
- Reject out-of-range coordinates, invalid accuracy, stale fixes and fixes too far from the captured instant.
- Device time is the requested instant; IANA timezone ID and observed UTC offset are carried explicitly.
- No background location watcher, local persistence, logging of coordinates or server call.

## Reuse policy and current blockers

- **VirgoStars-Ephemeris:** canonical Rust astronomy target. The currently inspected experimental `first_sky::calculate` reader accepts the classic DE441 binary, not the SPK kernel bundle. Its documented first-sky output treats Mars, Jupiter, Saturn, Uranus, Neptune and Pluto as *system barycenters*, not planet centers; it also lists UT1=UTC, truncated TDB−TT, no nutation, light-time, aberration, gravitational deflection, polar motion or atmospheric refraction. Do not relabel barycenter coordinates as planet centers or claim apparent positions. The kernel/data packaging, center-level planet capability and independent reference-vector validation must be resolved before selecting this provider.
- **Swiss Ephemeris fallback:** explicitly permitted by mobile issue #14 only as a temporary provider, behind the same Rust contract. The official Swiss documentation describes dual licensing: AGPL (with the whole application under AGPL or a compatible license) or the Swiss Ephemeris Professional License. No Swiss source or binary is included until the owner confirms which licensing path applies and all terms for this Android distribution are satisfied. See [official licensing information](https://www.astro.com/swisseph/swisseph.htm) and [Professional License contract](https://www.astro.com/swisseph/secont_e_2609.pdf).
- **astrological-functions:** intended source for zodiac, house and aspect semantics; current repo states there is no granted outbound license and no stable API commitment. Do not copy source into this app.
- **astrological-charts:** intended shared renderer. Its source/assets are pending rights clearance; do not vendor or redistribute them until cleared.
- Do not implement duplicate astronomy or a second chart renderer in the mobile repo.

## Android and iOS

Generated Tauri Android/iOS IDE trees are local artifacts under `src-tauri/gen/`; no signing keys are committed. Android is the first device test target. iOS requires a Mac, Xcode, app entitlements and separate validation; it is not currently supported or released.

## Future local-first profile architecture

Authentication, encrypted SQLite, OS secure-key storage, owner-scoped sync and offline outbox are out of scope for this single-feature MVP. If later required, use system-browser PKCE, per-profile encryption, transactional outbox and server-owned authorization. Never treat localStorage as encrypted storage.

## Platform / release boundary

Builds do not publish. Android Play and Apple App Store distribution demand review, reproducible dependencies, signing, privacy disclosures and verified platform builds. No GitHub Actions are used.
