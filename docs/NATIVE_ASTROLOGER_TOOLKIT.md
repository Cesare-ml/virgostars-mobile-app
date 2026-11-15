# VirgoStars Mobile — native astrologer toolkit

**Status: design + two pure TypeScript contracts. No Android/iOS native feature in this document is claimed to have passed a device test.**
Product decision: mobile should complement VirgoStars Desktop with *instant capture, event reminders and field-work tools*, without duplicating astronomical or astrological calculations.

## Priority and rollout

| Rank | Feature | Astrologer's workflow | Native integration | Dependencies / caveats |
| --- | --- | --- | --- | --- |
| P0 | Capture the moment | Record exact tap time, GPS and an eventual event chart | Android Quick Settings tile; iOS App Intent/Control/Action button | Current PR #7 only keeps a temporary session draft. Must first add encrypted profile-owned archive and a verified chart engine. System screenshot buttons cannot be globally hijacked. |
| P0 | Personalized event reminders | Alerts for transits to natal positions, ingress, lunations, stations, solar returns, planetary hour changes | Android local notifications/AlarmManager; iOS local notification scheduling | User opt-in and **verified** event UTC instants; OS delivery not guaranteed to the second. No endless background ephemeris polling. |
| P0 | Astrological home widgets | Moon phase, next verified event, current planetary hour, Capture button | Android AppWidget/Glance; iOS WidgetKit / Controls | Cache only precomputed verified, time-stamped values; widgets are not continuously updated clocks and cannot imply zero latency. |
| P1 | Calendar export | Export verified transits/consultation times and event notes to device calendar | Android calendar ACTION_INSERT dialog; iOS EventKit with user confirmation | Separate user action; do not request full read/write permissions for simple export. Keep private chart details hidden by default. |
| P1 | Secure identity & local vault | Offline access to birth charts and client records on a shared/lost phone | Android Keystore/BiometricPrompt; iOS Keychain/LocalAuthentication | Biometric success must unlock a strong encryption key; does not replace backend per-owner authorization or automatic backup design. |
| P1 | Native share / Print | Send selected charts as PDF/PNG, share a safe link, print consultation notes | Android ACTION_SEND/print; iOS share sheet/AirPrint | Redact birth date/time, coordinates and other personal data unless explicitly selected. Temporary files need secure cleanup. |
| P1 | Voice notes for consultations | Attach dictated diary entries to a **specific** chart/instant | Native microphone, audio recording and optional on-device speech-to-text | Separate microphone consent, encrypted recordings, offline mode and transparent transcription model. No always-on microphone. |
| P1 | Offline chart calculation | Open/create natal and event charts without reception | Rust VirgoStars-Ephemeris in Tauri mobile, shared astrological-functions and astrological-charts | Engine correctness, kernel licenses, local storage, hardware memory/GPU performance verified before use. |
| P2 | Compass / sky pointing | Point phone toward the horizon to overlay calculated azimuth/altitude of celestial objects | Android rotation vector/magnetometer, iOS Core Motion/Core Location heading | Not a camera astrometry system; calibrate heading and compensate magnetic declination, magnetic interference and location uncertainty. |
| P2 | Camera / QR import | Scan a printed consultation QR code to open an authorized chart, attach photos to a client note | Android camera / iOS camera scanning | Authenticated opaque IDs only, no plain-text birth records in QR; validate untrusted deep links. |
| P2 | Watch companion | Glance at selected event countdowns, planetary hours or trigger capture | Wear OS tiles/complications, Apple Watch complications and App Intents | Separate native watch apps, battery, disconnected operation, lock-state, secure device handoff. |
| P3 | NFC astrological tokens | Tap a user-created card/tag to open a particular chart or trigger a pre-approved action | Tauri NFC plugin, Android/iOS NFC | Never store private birth data or credentials on a readable NFC tag; device and iOS entitlement support vary. |
| P3 | Haptic feedback | Short tactile confirmation after a *durable* capture / reminder acknowledgment | Tauri haptics plugin on mobile | Not all Android hardware supports consistent haptics; must remain optional and accessible. |

## Shared computational rule

All **astronomical positions and times** originate from the canonical, validated `VirgoStars-Ephemeris` implementation. Zodiac/house/aspect rules belong to `astrological-functions`. Visual rendering belongs to `astrological-charts`. Do **not** calculate Moon phases, planetary hours or aspects from unvalidated static UI formulas or placeholders.

A native widget consumes a verified snapshot such as:
```text
Snapshot { engine_version, calculated_at_utc, valid_until_utc, timezone_id,
           location_precision, astronomical_method, display_data }
```
If stale, absent, inaccessible offline or outside documented capabilities, show “Dati da aggiornare” — no synthetic precision.

## Event reminders — first code slice in this branch

`src/app/native/astro-event-planner.ts` implements **pure planning only**:
- Accept a real UTC instant and explicit provenance, IANA display zone, user opt-in and lead minutes.
- Compute reminder trigger in UTC, preserving DST correctness. Lead times must be 0–10,080 minutes.
- Return `ready-to-request` or `expired`, explicitly marked **best-effort**. It never claims a reminder was scheduled, delivered or precise to the second.
- Default lock-screen notification text is generic and contains no planetary event, person's name, birth details or coordinates.
- Prepare a calendar event draft requiring explicit user confirmation; do **not** silently modify the user's calendar.
- No plugin, permission grant, background service, server call, clock adjustment, local persistence or real ephemeris is added by this slice.

Next integration requires a `NativeNotificationScheduler` interface that reports OS-level acceptance/errors, persisted scheduling intentions in the encrypted profile and reconciliation after reboot/timezone changes. **Scheduling permission and UX are separate from planning.**

## Android notification limits

- On Android 14+ most fresh installs cannot assume permission for **exact alarms**. Evaluate whether a user-visible event truly needs exact precision and whether the app qualifies under policy; otherwise use inexact alternatives and explain delivery may be late.
- Do not request `USE_EXACT_ALARM` for a general-purpose astrologer app unless its distribution use-case explicitly qualifies under Google Play policy.
- No background continuous GPS, no AccessibilityService to hijack global keys, no secret battery-exemption prompts. User-owned shortcuts/tile widgets are explicit opt-ins.
- A Quick Settings tile must respect lock screen, authentication, background launch restrictions and Android 14+ PendingIntent behavior.

## iOS differences

- Use App Intents/Shortcuts/Action button and WidgetKit/Controls where OS/device versions allow.
- iOS location should default to **When In Use**. Background access needs a separate justification and system UX; do not imply the same process lifecycle as Android.
- Notification scheduling/delivery and widget refresh remain OS-controlled; no per-second guarantee.
- If a watch or widget cannot access an encrypted profile, show a private neutral placeholder, not unprotected cached birth details.

## Suggested development order

1. Finish Android build baseline and validate PR #7 location permissions on a device.
2. Build an encrypted private archive before declaring moment capture “saved”.
3. Connect verified event ephemerides and the planner's native scheduling adapter; validate push-free reminders and exact-alarm fallback.
4. Deliver Android calendar-insert flow and first read-only Moon/next-event widget, based only on verified snapshots.
5. Add biometric unlock, privacy-safe share, optional diary voice notes.
6. Build instrument/AR, smartwatch, NFC and iOS equivalents only after device smoke data.

## Official technical references

- Android widgets: https://developer.android.com/develop/ui/views/appwidgets/overview
- Android Quick Settings: https://developer.android.com/develop/ui/views/quicksettings-tiles
- Android alarm behavior: https://developer.android.com/about/versions/14/changes/schedule-exact-alarms
- Android calendar insert intent: https://developer.android.com/guide/components/intents-common
- Android orientation sensors: https://developer.android.com/develop/sensors-and-location/sensors/sensors_position
- Apple WidgetKit: https://developer.apple.com/documentation/widgetkit/
- Apple App Intents: https://developer.apple.com/documentation/appintents/
- Apple location consent: https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services
- Tauri mobile plugin catalog: https://v2.tauri.app/plugin/
