# Security and privacy

**Current MVP:** no login, personal birth-data input, location permission, account cache, remote API calls or synchronization. The current sky is calculated locally from the device clock. The runtime bridge only reports a public platform label and schema revision.

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

## Temporary astronomy dependency

Astronomy Engine 2.1.19 is a local calculation library distributed under the MIT license. Its copyright and license notice remain applicable to the dependency. No ephemeris kernel file or third-party proprietary data is embedded. The canonical VirgoStars engine will replace this provider only after numerical and integration validation.
