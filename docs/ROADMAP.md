# VirgoStars Mobile — roadmap

Milestones represent intended work, not completed functionality.

## M0 — Bootstrap

- [x] Android-first Tauri 2 + Angular 20 + Rust source layout
- [x] Mobile-first responsive shell, Italian/English, attribution notice
- [x] Minimal native runtime probe and security configuration
- [x] Current-sky MVP screen and typed Tauri IPC command
- [x] Temporary local astronomy provider for Sun, Moon and seven planets
- [x] UI displays calculation time, source and model limitations
- [ ] Verify npm run check and cargo test on a configured machine
- [ ] Initialize Android target and run emulator/physical-device smoke test
- [ ] Confirm astronomy vectors and retrograde flags independently

## M1 — Canonical astronomy and Android demo

- [ ] Integrate a validated VirgoStars-Ephemeris Rust adapter when its public app-facing API is stable
- [ ] Compare all nine body positions against approved reference vectors and Swiss Ephemeris/Horizons where licensing and methodology permit
- [ ] Document time scales, frame, center, corrections, accuracy and supported date range
- [ ] Optimize chart touch layout, DPI, memory and WebView restoration
- [ ] Test dark mode, portrait/landscape, low-memory devices and timezone correctness

## Explicitly deferred

- Personal birth charts, Ascendant, houses and topocentric horizon (requires observer coordinates and a reviewed permission UX)
- Offline profiles, encrypted SQLite, OS key storage and profile deletion
- OAuth2 Authorization Code + PKCE, account ownership and server synchronization
- Android signing/Play Store release and all iOS native work

The MVP intentionally performs no network requests, requires no location permission and stores no personal data. No release or deployment is triggered by repository changes.