# Security and privacy

Android city search uses a bundled desktop catalog copied to private storage after checksum verification. Search input stays on the device; no file paths or SQL are accepted from the WebView. See [desktop city catalog](DESKTOP_CITIES.md).

**Current version has no login, account cache, remote API calls or synchronization.** The experimental new-chart form accepts local civil time, an IANA zone and coordinates. Save persists those inputs to the encrypted archive before passing a resolved UTC instant and coordinates to a local calculation command. A failed save stops calculation; a failed calculation can leave the saved inputs in the archive. The archive uses an in-memory SQLite database sealed with XChaCha20-Poly1305, a random data key wrapped with AES-GCM by Android Keystore, and Android's no-backup directory; key loss or uninstall makes it unrecoverable. It has no profile isolation or account access controls and has not received an independent security review. See [archive design and limitations](ARCHIVE_CORE_EXPERIMENT.md). Image export controls are currently hidden. Android display preferences are typed non-personal values stored in app-private no-backup files; the older WebView values may remain after migration. Android startup preference stores a mode and an optional local chart UUID in a separate no-backup file; that UUID is a pseudonymous reference, not encrypted chart contents. Place and archive searches are local. The default VirgoStars provider requires external DE441 data; Swiss is explicitly selected, optional and local-only. No data paths are accepted from the WebView. See [display preference persistence](PREFERENCES_PERSISTENCE.md).

The user can choose DE441, USNO and Chiron data using the platform file picker. Bytes cross the local WebView/native bridge in bounded chunks and are written to app-private storage; file names and paths are not sent to native commands. A temporary file is removed after failure or cancellation, or on the next app start after interruption; the previous installed data is kept until successful replacement, and the USNO set is committed as one bundle. Validation checks structure and sample computations, not authenticity or a trusted checksum; no ephemeris file is bundled or downloaded by the application.

A separate opt-in native HTTPS transport exists for future account work, but is not wired into the app or its IPC. It uses a bundled certificate-root snapshot, which needs an explicit trust-store, revocation and update policy before release. The transport is blocking and must run on a native worker if integrated. See [Android v1 checkpoint](ANDROID_V1_CHECKPOINT.md).

An isolated opt-in encrypted snapshot cache prototype requires a previously verified profile and a supplied existing key; it is not connected to Android Keystore or app flows. It must not be interpreted as complete account isolation, offline authorization or revocation handling. Profile-derived filenames are pseudonymous; chart data remain encrypted on disk. A future integration must prevent stale sessions from writing after account switching or revocation.

Before implementing identity, synchronization or release:
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
