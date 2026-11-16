# VirgoStars Mobile — roadmap

Milestones represent intended work, not completed functionality.

## M0 — Android live-sky MVP
- [x] Android-first Tauri 2 + Angular 20 + Rust source layout
- [x] Direct launch into a single live current-sky chart
- [x] Real local geocentric tropical longitudes for Sun, Moon and eight planets using temporary MIT Astronomy Engine provider
- [x] Responsive zodiac wheel, positions list, IT/EN UI and automatic refresh
- [x] Provider-neutral DTO so the temporary engine can be replaced
- [x] No fake positions, account collection, user birth data or network calls
- [ ] Genuine dependency lockfile and independently verified npm ci + npm run check
- [ ] Android SDK build and physical/emulator smoke test
- [ ] Compare reference vectors against approved ephemeris output

## M1 — Canonical VirgoStars calculation integration
- [ ] Replace temporary Astronomy Engine with validated VirgoStars-Ephemeris Rust adapter when stable interfaces and numerical tests are ready
- [ ] Integrate astrological-functions and astrological-charts using versioned shared DTOs
- [ ] Add a just-in-time foreground location flow for Ascendant, Midheaven and house cusps
- [ ] Validate house system, geographic precision and timezone behavior
- [ ] Low-memory, dark-mode, portrait/landscape and WebView context restoration tests

## M2 — Local-first private archive
- [ ] Design versioned SQLite schema, migration/rollback and OS-backed encryption/key storage
- [ ] OAuth2 Authorization Code + PKCE via system browser, account-aware device binding
- [ ] Verified offline unlock policy and explicit revocation limitations
- [ ] Transactional outbox, idempotency, cursor sync and conflict UI with server-owned authorization

## M3 — Android beta and release gate
- [ ] Security, accessibility, performance and Play Store/data-safety review
- [ ] Signed Android build, recovery and staged distribution (maintainer-only decision)
- [ ] Offline and network-failure QA on real low-end and high-end phones

## M4 — iOS adaptation
- [ ] Generate iOS native target on macOS with Xcode
- [ ] Validate WKWebView rendering, gestures, secure keychain and background restrictions
- [ ] Review iOS-specific privacy entitlements and distribution signing
