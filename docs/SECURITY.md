# Security and privacy

**Current prototype has no login, persistent user archive, remote API calls or synchronization.** With an explicit opt-in it may acquire sensitive GPS coordinates once, in the foreground. Captured moments are **in-memory only** and lost on app close; no location history watcher, background tracking, raw log or network upload is implemented. Only a generic optional confirmation notification is sent. The runtime probe returns a public platform label and schema revision. No production service credentials are needed. All presented chart geometry is illustrative.

Before implementing identity or local storage:
1. Use system-browser OAuth 2 authorization code with PKCE, not an embedded login form.
2. Store secrets only in vetted OS-backed secure storage. Never commit passwords, tokens, refresh tokens, certificates, signing keys or private user records.
3. Encrypt user-owned local records with an explicitly tested key lifecycle, and isolate by profile.
4. Use a versioned HTTPS service API. Server validates user ownership; a mobile login never grants wider data access.
5. Atomically store each local edit with an outbox mutation. Reconcile by revisions; surface conflicts instead of silent last-write-wins.
6. Explicitly document offline revocation limitations, device loss and profile deletion.
7. Audit Android exported components, intent/deep link validation, WebView settings, permissions, CSP, dependencies and store disclosure.
8. Review Apple Keychain, background execution and privacy prompts independently when iOS work begins.

Do not upload logs containing natal data, access tokens or personal identifiers. Vulnerabilities should be disclosed privately to maintainers; do not open a public issue containing an exploit or secrets.

No GitHub Actions, auto-publishing or cloud deployment are configured.

## Moment capture privacy constraints

- Do not allow capture until the user explicitly enables it; permission must be requested just-in-time. This opt-in resets on restart until encrypted profile preferences exist.
- Request foreground location only, do not keep a watcher running, and never use AccessibilityService to monitor hardware shortcuts.
- Preserve the tap instant, measured-position timestamp and accuracy distinctly. Reject stale or invalid data.
- A device-local draft is **not** a saved chart. Do not notify that a record is safely persisted until an encrypted, crash-safe profile archive commits.
- System notifications must omit time/location/coordinates or personal chart details. Permission denial does not imply a crash or permission bypass.
- The initial foreground-only prototype deliberately does not record location in localStorage, IndexedDB, SQL or an external API. See [Native Moment Capture](NATIVE_MOMENT_CAPTURE.md).
