# Widget snapshot gate — Android-first foundation

Status: **Locally tested pure TypeScript contract** (Node.js v22.16.0, 8/8 tests). **No Android home-screen widget, iOS WidgetKit extension or actual astrological calculation has been implemented or device-tested.**

## Why this exists

An astrology widget must not display placeholder planetary positions, stale “current” lunar phases, or private client records on a lock screen. Before building native Android AppWidget/Glance and iOS WidgetKit adapters, define one conservative, deterministic way to decide whether a data snapshot is safe and fresh enough to display.

Source: `src/app/native/widget-snapshot.ts`  
Tests: `tests/widget-snapshot.test.mjs`  
Related feature issue: [#9](https://github.com/Cesare-ml/virgostars-mobile-app/issues/9)

## Snapshot schema v1

`PublicWidgetSnapshot` accepts only:

- `schemaVersion: 1`
- `kind`: `moon-phase`, `planetary-hour` or `next-event`
- `calculatedAtUtc` and `validUntilUtc`: strict UTC instants
- `engineVersion`: bounded, nonempty identifier
- `calculationSource: 'virgostars-ephemeris'`: **untrusted provenance metadata** until checked by the app's validated engine adapter
- `data`: a **single non-sensitive enum payload** appropriate to the widget kind

**Do not treat the presence of `calculationSource` or `engineVersion` as scientific verification.** Only a trusted adapter backed by a independently validated VirgoStars-Ephemeris engine may construct the snapshot. The pure gate performs structural and freshness validation, not astronomy or cryptographic authenticity checks.

The function `presentWidgetSnapshot(snapshot, { vaultUnlocked, now })` returns one of three states:

| State | Display | Trigger |
| --- | --- | --- |
| `locked` | “Sblocca VirgoStars” | Profile vault not unlocked; never inspect or expose snapshot data |
| `unavailable` | “Dati da aggiornare” | Missing, stale, future-dated, malformed, unsupported or potentially sensitive data |
| `ready` | Generic label such as “Luna piena” or “Ora di Mercurio” | An unlocked, well-formed, unexpired public snapshot |

**Restrictions**: input expires by `validUntilUtc`; any future clock skew beyond 30 seconds, validity window exceeding 24 hours, unknown payload keys, invalid event/time, or past next-event time fails closed. Moon phase labels, hour rulers and event category names are simple enum mappings — **not computed astronomical assertions**.

## Native integration boundary

```text
VirgoStars-Ephemeris (verified Rust calculations)
            ↓
Validated, versioned, trusted native event snapshot adapter
            ↓
Encrypted profile-scoped local cache (never public birth details)
            ↓
Explicit privacy/unlock policy / minimal widget payload export
            ↓
presentWidgetSnapshot(..) — structural + freshness gate
            ↓
Android AppWidget/Glance (first)  /  iOS WidgetKit (future)
```

A future Android implementation should use system widget scheduling, bounded update intervals and user-added widgets. Do not poll astronomic positions continuously in the background or promise sub-second widget updates. iOS WidgetKit will have its own timeline and refresh limits. Sensitive natal/transit details require a separate user-approved private display policy and secure device state, not an exception to this public schema.

## Verification

Locally run against the **exact GitHub blob contents** (SHA of `widget-snapshot.ts`: `160d86de7097a2a9df070f913ba801ee3d0b4e7e`; tests: `ae532ac680859372c36ae7d22385e61683f538fb`):

```bash
node --experimental-strip-types --test tests/widget-snapshot.test.mjs
```

Result: **8 passing / 0 failing**, Node.js **22.16.0**. Coverage: data freshness, vault lock, strict payload shapes, invalid source versions, valid planetary ruler enums, next-event expiration, malformed inputs. An Angular build and native widget device smoke were **not** run. This is a domain-level safety gate, not a completed widget.

## Next steps

1. Complete Android build gate (#1) and validate accurate ephemeris via shared engine/fixtures.
2. Add encrypted profile storage, ownership and device-unlock policy (#4).
3. Implement trusted provider adapter that authenticates engine version and reference-test status, plus a small verified snapshot cache.
4. Create Android AppWidget/Glance host, test widget installation/resize/background/offline/staleness/reboot on a real Android device.
5. Implement iOS WidgetKit counterpart only after Android is validated.

No GitHub Actions, automatic publishing, production account access, real client fixtures or unnecessary native permissions are used.
