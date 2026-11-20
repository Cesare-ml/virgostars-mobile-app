# Architecture — VirgoStars Mobile

Android searches the bundled desktop city database through a bounded native SQLite command; see [desktop city catalog](DESKTOP_CITIES.md).

Status: **experimental prototype**. Android first, iOS later. The [desktop parity checkpoint](DESKTOP_PARITY.md) tracks which features have source-level implementations and what remains unverified.

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
      +-- VirgoStars-Ephemeris Rust adapter (external DE441 data required)
      +-- Android encrypted in-memory SQLite chart repository
      +-- Android Keystore wrapped data key; future device identity
      +-- future transactional outbox + owner-scoped HTTPS sync
      |
VirgoStars server: independent authenticated/versioned API, not a direct DB link
```

The host exposes `runtime_info`, `calculate_chart`, Android-only chart archive, display and startup-preference commands, and bounded, app-owned DE441/USNO/Chiron import commands. The default provider uses VirgoStars-Ephemeris and requires external DE441 data; without data it reports unavailable. An explicit file picker streams selected data into private staging and validates it before replacement; the USNO files are committed together. The optional local-use Swiss feature explicitly selects Swiss instead, never as an automatic fallback. For VirgoStars-Ephemeris, the native host returns astronomical angle facts and the UI assembles houses via the shared astrological-functions methods before invoking astrological-charts. See [integration and data limitations](EPHEMERIS_INTEGRATION.md). Transit and synastry overlay interfaces are temporarily hidden; no snapshots are persisted. On Android, display settings and the selected startup mode and optional archive UUID are stored in separate app-private no-backup files; chart data remain in the encrypted native archive. Existing WebView display preferences are migrated when available. [Storage and verification](PREFERENCES_PERSISTENCE.md). Shared geometry is used for the aspect table. Local builds stage manifest-verified glyphs from the privately approved `astrological-assets` checkout, with synthetic non-glyph artwork. Those APKs are not cleared for public distribution; see [chart symbols and rights](CHART_SYMBOLS.md). OAuth and sync remain unintegrated.

The [Android archive](ARCHIVE_CORE_EXPERIMENT.md) adapts the desktop core, encrypts the entire in-memory database and keeps its data key wrapped by Android Keystore. Its bounded IPC stores chart inputs, not calculated snapshots. There is one device-local archive and no profile or recovery mechanism; iOS remains unimplemented.

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

Builds do not publish. Android Play and Apple App Store distribution demand review, reproducible dependencies, signing, screenshots/permissions and verified platform builds. The only permitted GitHub Actions integration is the iOS compilation workflow: unsigned simulator previews on PR/push, and an explicitly gated manual signing/TestFlight path. A successful build is not device validation; see [iOS build guide](IOS.md).
