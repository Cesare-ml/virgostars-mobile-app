# Security and privacy

**Current-sky MVP foundation status:** the app requests a one-shot foreground location permission on Android, then obtains a fresh GPS sample for a local calculation attempt. Coordinates and accuracy are passed only through local Tauri IPC; this branch does not persist them, log them, upload them or send them to a VirgoStars server. No background location or continuous GPS watcher is enabled.

The current native calculation command returns an explicit unavailable error because no validated, legally distributable astronomy/astrology provider has been linked. No chart is fabricated. The UI displays permission, GPS and engine-unavailable states separately.

Before implementing the actual calculator:
1. Link only a legally distributable, offline-capable astronomical provider and record its version, time scale, coordinate frame, kernel/data provenance and known approximations.
2. Use system location permission only while the app is foregrounded. Explain the purpose before the runtime prompt; allow denial and retry.
3. Never write raw coordinates, location history or GPS fixes to localStorage, IndexedDB, logs, analytics or crash reports.
4. Validate coordinate ranges, GPS accuracy and fix age relative to the captured instant. Fail closed when the fix is unavailable or stale.
5. Keep all astronomical calculations local. No network request is required to show the current sky.
6. Keep Tauri IPC versioned, typed and limited to the single calculation command. Do not add broad plugins, generic filesystem access or WebView permission grants.
7. Keep chart output absent until the engine result passes contract and reference-vector checks; do not preserve stale results as though they were current.
8. Audit Android exported components, intent/deep link validation, WebView settings, permissions, CSP, dependencies and store disclosure before a release.

Before adding user accounts or durable storage:
- Use system-browser OAuth2 Authorization Code + PKCE, not an embedded login form.
- Store secrets only in vetted OS-backed secure storage. Never commit passwords, tokens, certificates, signing keys or private user records.
- Encrypt user-owned local records with an explicitly tested key lifecycle, and isolate by profile.
- Use a versioned HTTPS service API. Server validates user ownership; a mobile login never grants wider data access.
- Atomically store each local edit with an outbox mutation. Reconcile by revisions; surface conflicts instead of silent last-write-wins.
- Explicitly document offline revocation limitations, device loss and profile deletion.

No GitHub Actions, auto-publishing or cloud deployment are configured.
