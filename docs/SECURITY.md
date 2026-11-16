# Security and privacy

The live-sky MVP requests no birth data, account credentials, location permission or personal profile. It runs astronomy calculations locally and does not call a remote API. The native bridge exposes only a public platform label and schema revision.

Before adding identity or local storage:
1. Use system-browser OAuth 2 Authorization Code with PKCE, not an embedded login form.
2. Store secrets only in vetted OS-backed secure storage.
3. Encrypt user-owned local records with a tested key lifecycle and isolate by profile.
4. Use a versioned HTTPS service API; server validates ownership.
5. Atomically store each local edit with an outbox mutation and surface conflicts.
6. Document offline revocation limitations, device loss and profile deletion.
7. Audit Android exported components, deep links, WebView settings, permissions, CSP, dependencies and store disclosure.

Never upload logs containing natal data, tokens or personal identifiers. No GitHub Actions, auto-publishing or cloud deployment are configured.
