# Architecture — VirgoStars Mobile

Status: **prototype shell only** (2026-11-15). Android first, iOS later.

## Decision

Keep the same platform-neutral boundaries as VirgoStars Desktop:

```text
Angular mobile UI (TypeScript; accessibility, touch, safe areas)
      | typed app services and view models
      |              [future]
      +-- astrological-functions (methods, no duplicated astronomy)
      +-- astrological-charts (responsive Three.js chart renderer)
      |
Tauri 2 IPC (versioned, explicit permissions)
      |
Rust mobile host
      +-- future VirgoStars-Ephemeris canonical Rust adapter
      +-- future encrypted SQLite local repository
      +-- future OS secure-key storage and device identity
      +-- future transactional outbox + owner-scoped HTTPS sync
      |
VirgoStars server: independent authenticated/versioned API, not a direct DB link
```

The host exposes `runtime_info` and `calculate_chart`. The default build returns provider unavailable; an optional local-use Swiss provider calculates apparent geocentric positions and houses. The UI passes calculated positions through the Desktop-derived adapter using astrological-functions into astrological-charts. Manifest-verified synthetic assets are staged beneath open-font glyph textures for zodiac signs, houses and calculated bodies; proprietary artwork is not bundled. OAuth, storage and sync remain unintegrated.

The separate DE441 local-pack custody adapter exposes explicit native IPC commands for fixed-catalog inventory, import (128 KiB chunks), hash verification and removal in an app-private folder. It has no network access or astronomy calculations. The canonical `De441PackManager` remains in VirgoStars-Ephemeris. A **feature-gated diagnostic** (`de441-native-probe`) delegates read-only geometric ICRF state evaluation to that manager after hashing the installed pack; the normal build returns unavailable. The diagnostic is not connected to chart calculation, which still needs time-scale, observer-frame and apparent-position conversion plus independent validation. See [DE441 local packs](DE441_LOCAL_PACKS.md).

## Reuse policy

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
