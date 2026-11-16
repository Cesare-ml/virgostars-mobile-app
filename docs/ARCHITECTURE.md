# Architecture — VirgoStars Mobile

Status: **live-sky MVP implementation in progress** (2026-11-16). Android first, iOS later.

## Decision

Keep the same platform-neutral boundaries as VirgoStars Desktop:

```text
Angular live-sky UI (TypeScript; touch, safe areas, current-time chart)
      | typed app services and view models
      |              [future]
      +-- astrological-functions (methods, no duplicated astronomy)
      +-- astrological-charts (responsive Three.js chart renderer)
      |
Tauri 2 IPC + scoped native geolocation plugin (explicit permissions)
      |
Rust mobile host
      +-- future VirgoStars-Ephemeris canonical Rust adapter
      +-- future encrypted SQLite local repository
      +-- future OS secure-key storage and device identity
      +-- future transactional outbox + owner-scoped HTTPS sync
      |
VirgoStars server: independent authenticated/versioned API, not a direct DB link
```

The host exposes `runtime_info` and the official Tauri geolocation plugin. The current UI calculates a tropical geocentric sky chart through a temporary MIT provider adapter, with Whole Sign houses. The provider is not the VirgoStars engine and has not yet passed scientific parity tests. No OAuth, storage or sync integration exists.

## Current MVP implementation\n\n`SkyChartService` isolates Astronomy Engine 2.1.19 (MIT) behind a replaceable provider boundary. `@tauri-apps/plugin-geolocation` requests location only after explicit user consent; permissions are limited to check/request/current-position, not continuous tracking. Coordinates are held in process memory only. The user may also enter coordinates manually. Chart data refreshes every 30 seconds.\n\nThis is an implementation target, not yet an Android build/device validation. The canonical VirgoStars ephemeris must replace the temporary provider only after stable Rust/mobile bindings and scientific fixtures have passed.\n\n## Reuse policy

- **virgostars-desktop:** share verified DTOs, Rust ports and security principles; do **not** copy experimental desktop UI wholesale. Mobile UI is touch-first.
- **VirgoStars-Ephemeris:** canonical numerical astronomy in Rust, no new astronomy algorithms in UI.
- **astrological-functions:** shared astrological calculation semantics via typed adapter; no duplicated business logic.
- **astrological-charts:** shared renderer when mobile WebView/WebGL performance and licensing are validated.
- **astrological-assets:** private or licensed assets must not enter this public repository without explicit rights clearance.

## Android and iOS

Generated Tauri Android/iOS IDE trees are local artifacts under `src-tauri/gen/`; there are no committed Google/Apple signing secrets. Keep Rust and TypeScript packages multiplatform. Android (SDK 24+) is the first device test target. iOS requires a Mac, Xcode, app entitlements and separate validation; it is not currently supported or released.

## Local-first, not localStorage-first

Initial online authentication must use verified system-browser PKCE and a server device-registration contract. Never collect user passwords in embedded WebViews. Secure credentials are OS-keychain backed; encrypted SQLite stores only data owned by the signed-in profile, and pending local edits are written atomically with outbox entries. Server owns authorization on every API operation. Reconnection must be idempotent and conflict aware. See the Desktop repo's `docs/OFFLINE_AUTH_AND_SYNC.md`; it is **a proposal**, not a working API.

Critical tests before first beta: Android offline restart, device lock and eviction, WebView context-loss/recovery, low-memory performance, timezone/DST correctness, repeatable astronomy reference vectors, account isolation, local encryption, server conflict detection, revocation behavior, migration rollback and accessibility.

## Platform / release boundary

Builds do not publish. Android Play and Apple App Store distribution demand review, reproducible dependencies, signing, screenshots/permissions and verified platform builds. No GitHub Actions are used.
