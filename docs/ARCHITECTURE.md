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
Rust mobile host
      +-- provider adapter (NOT YET LINKED)
      |     +-- future VirgoStars-Ephemeris canonical Rust adapter
      |     +-- temporary Swiss Ephemeris only after license/approval
      +-- astrological-functions contract (not integrated)
      +-- astrological-charts renderer (not integrated)
      |
local device only; no account, network, persistence or backend dependency
```

The UI and native bridge have a typed contract for observer, timestamp, timezone, provider provenance, planet positions, Ascendant/MC, 12 house cusps and aspects. The native command currently returns an unavailable-engine error; it does not synthesize an astrologic result.

## Refresh policy

- On launch/resume, request a fresh foreground-only GPS fix.
- While foregrounded, check position every 15 seconds; request a new calculation at most once per minute, or after at least 250 metres of movement.
- Reject out-of-range coordinates, invalid accuracy, stale fixes and fixes too far from the captured instant.
- Device time is the requested instant; timezone ID and observed offset are carried explicitly.
- No background location watcher, local persistence, logging of coordinates or server call.

## Reuse policy and current blockers

- **VirgoStars-Ephemeris:** canonical Rust astronomy target. Its current first-sky API and DE441 reader are experimental, have documented approximations, and need lawful local kernel/data packaging plus independently validated reference vectors before being used as the mobile production provider.
- **Swiss Ephemeris:** allowed only as a temporary adapter after license terms for the actual distribution have been reviewed and approval obtained. No Swiss dependency/binary is included in this branch.
- **astrological-functions:** intended source for zodiac, house and aspect semantics; current repo states there is no granted outbound license and no stable API commitment. Do not copy source into this app.
- **astrological-charts:** intended shared renderer. Its source/assets are pending rights clearance; do not vendor or redistribute them until cleared.
- Do not implement duplicate astronomy or a second chart renderer in the mobile repo.

## Android and iOS

Generated Tauri Android/iOS IDE trees are local artifacts under `src-tauri/gen/`; no signing keys are committed. Android is the first device test target. iOS requires a Mac, Xcode, app entitlements and separate validation; it is not currently supported or released.

## Future local-first profile architecture

Authentication, encrypted SQLite, OS secure-key storage, owner-scoped sync and offline outbox are out of scope for this single-feature MVP. If later required, use system-browser PKCE, per-profile encryption, transactional outbox and server-owned authorization. Never treat localStorage as encrypted storage.

## Platform / release boundary

Builds do not publish. Android Play and Apple App Store distribution demand review, reproducible dependencies, signing, privacy disclosures and verified platform builds. No GitHub Actions are used.
