# Security and privacy

**Current version has no login, account cache, remote API calls, personal-data persistence or synchronization.** The experimental form accepts local civil time, an IANA zone and coordinates, passes a resolved UTC instant and coordinates to a local native command, and does not store or log them. Place searches use a bundled GeoNames catalog and do not call a remote service. The default build has no provider; Swiss is optional and local-only.

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

## Experimental DE441 local-pack storage

The app can import an explicit user-selected local `.eph` slice through bounded IPC chunks. Only ten fixed IDs and filenames are recognized; app-private temporary files are length- and SHA-256-checked before atomic installation. No broad OS filesystem permission, arbitrary path parameter, remote URL or server call is introduced. Installed files may be verified and removed explicitly. Distribution rights and independent scientific validation remain pending, so automatic downloading and bundling of ephemeris data are disabled. See [DE441 local packs](DE441_LOCAL_PACKS.md).
