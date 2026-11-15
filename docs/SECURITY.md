# Security and privacy

**Current version has no user login, personal-data input, account cache, remote API calls or synchronization.** The runtime bridge returns only a public platform label and schema revision. No production service credentials are needed. All presented chart geometry is illustrative.

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
