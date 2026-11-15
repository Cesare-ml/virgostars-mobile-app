# Native capabilities and one-touch moment capture

Status: **prototype — in-app, foreground-only, session memory**. This feature is not yet a persistent natal archive, calculator or always-on system shortcut.

## Product goal

A voluntary action **Cattura il momento** records the time of the **trigger** (before GPS resolution), current device location with accuracy, and stores a record in the account's private archive. Later, the verified VirgoStars Rust astronomical engine and shared astrological-functions/astrological-charts libraries compute and render the actual event/moment chart.

The saved record is a **timestamp + geographic fix**, not an interpretation and not a screenshot. If a capture is created at 14:32:07 and GPS resolves at 14:32:10, the theme uses **14:32:07**, not the later fix time.

## Current prototype (not a finished feature)

- Enable in Settings (defaults off; this opt-in lasts only for the current app session).
- Tap Capture on Home; explicitly request location when in the foreground. Geolocation plugin asks for coarse/fine access; the user may decline or grant approximate access.
- Capture UTC instant, IANA zone, observed UTC offset, coordinates, location-fix timestamp and accuracy.
- Reject invalid coordinates, impossible accuracies, invalid clock and GPS sample older/newer than 45 seconds from the trigger. Never silently invent coordinates.
- Display captured entries **only in memory while the app stays open**; this is not encrypted persistence and not a user's permanent archive.
- Optionally request notification permission and send a generic notification upon success. Notifications do not include location, birth data or time.
- Current illustrations are **not astrological calculations**.
- No background location, service, continuous watcher, login, network sync, upload, analytics, localStorage, IndexedDB or SQL database for capture data.

These restrictions intentionally prevent leaking sensitive geolocation into unencrypted storage before the profile-encryption design is implemented.

## Required final archive contract

```json
{
  "id": "UUID",
  "ownerProfileId": "authorized profile (future)",
  "source": "in-app | android-quick-settings | ios-shortcut",
  "capturedAtUtc": "2026-11-15T12:30:00.000Z",
  "timezoneId": "Europe/Rome",
  "utcOffsetMinutes": 60,
  "latitude": 44.534,
  "longitude": 11.623,
  "accuracyMeters": 18,
  "positionMeasuredAtUtc": "2026-11-15T12:30:03.500Z",
  "clockSource": "device-unverified",
  "calculationStatus": "pending | calculated | failed",
  "revision": 1,
  "syncState": "local-pending | synced | conflict"
}
```

This JSON is a **schema example with fictitious coordinates**, not a committed user record. A completed implementation needs a **server-authorized profile ID**, encrypted SQLite + OS-protected keys, transactional outbox with deterministic mutation IDs, and owner-scoped versioned server sync. Store failure must never show “saved”; chart calculation must never show fake astronomical positions.

For high-accuracy charts, allow user to inspect/correct the time and location after capture and preserve the original raw capture separately. Approximate permission must result in an accuracy warning, and unknown timezone/DST must not be guessed. Record clock integrity: a device clock may be wrong; no device observation alone certifies true UTC.

## Shortcut strategy

### Android (first)
1. In-app Capture button (prototype implementation).
2. Quick Settings **TileService** named “Cattura il momento”, exposed only if enabled and explicitly added by the user. A tile click must launch the app, unlock if necessary and require a foreground one-shot location fix. No silent background capture; respect Android version restrictions and background-launch behavior.
3. Optional home-screen widget and notification action. Test lock-screen and process-dead behavior.
4. **Not supported:** hijacking globally reserved Power + Volume Down screenshot combination or claiming a universal custom physical-button chord. While a focused Activity may receive some key events, power/system shortcuts are OS-controlled and not reliable global hooks. No intrusive AccessibilityService workaround.

### iOS (later)
1. Expose a voluntary **App Intent** to iOS Shortcuts/Siri and the Action button on devices that support it. Ask for location only within allowed execution contexts and validate device/lock state.
2. iOS usage strings must be supplied before distribution; do not assume an Android TileService exists on iOS.

## Native APIs and least-privilege rationale

- Tauri `@tauri-apps/plugin-geolocation`: `checkPermissions`, `requestPermissions`, one `getCurrentPosition`. No `watchPosition` capability.
- Tauri `@tauri-apps/plugin-notification`: `isPermissionGranted`, `requestPermission`, `sendNotification`. Do not grant default all-notification capabilities.
- Android location permissions requested only after an action; no ACCESS_BACKGROUND_LOCATION.
- On Android 12+, user may choose approximate location even if precise is requested; honor accuracy and never misstate precision.
- All coordinate processing stays local. Never include GPS coordinates in a system notification, crash report or diagnostic log.
- The UI opt-in must persist only after a secure profile preferences store exists. Defaults OFF after restart in current prototype.

## Acceptance tests before a release

1. Denied/revoked/approximate location, timeout, disabled sensors, stale fix, unavailable offline GPS.
2. Exact tap timestamp, timezone travel/DST, rapid repeated taps, permissions revoked while app is backgrounded, clock skew.
3. Encrypted durable archive survives restart, app upgrade, device lock; profile switching and remote revocation clearly explained.
4. Capture from Android Quick Settings with app closed/locked, no accidental global shortcuts.
5. Notifications denied should not roll back a successfully persisted capture.
6. Verified ephemeris matches reference outputs. Actual charts never substitute synthetic geometry silently.
7. iOS Shortcuts/Action button and WKWebView testing on supported hardware.

## References

- Android Quick Settings TileService: https://developer.android.com/reference/android/service/quicksettings/TileService
- Android location runtime/approximate permissions: https://developer.android.com/develop/sensors-and-location/location/permissions/runtime
- Tauri Geolocation: https://v2.tauri.app/plugin/geolocation/
- Tauri Notifications: https://v2.tauri.app/plugin/notification/
- Apple App Intents and Shortcuts: https://developer.apple.com/documentation/appintents
