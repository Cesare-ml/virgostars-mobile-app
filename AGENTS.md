# VirgoStars Mobile — contributor and agent instructions

Read `README.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, and `docs/SECURITY.md` before editing. The repository is public, Android-first and iOS-ready. This is an **unverified prototype**, not a released product.

- Use scoped branches and reviewable PRs for future changes. Do not silently merge other agents' work or modify unrelated repos.
- Preserve the CPAL-1.0 license and the required visible `Powered by VirgoStars` attribution.
- Never include production or other private repositories' code, real birth records, secrets, signing keys, paid city datasets, proprietary assets or third-party kernels.
- Astro calculations belong in `VirgoStars-Ephemeris` (Rust) and `astrological-functions`; chart UI belongs in `astrological-charts`. Shared adapters must have proven contract tests. Do not claim incomplete integrations work.
- Keep any native IPC minimal, typed, explicitly permissioned and platform neutral; no broad plugins or WebView permission grants.
- A first login and server synchronization cannot be presumed. Offline profile access needs encrypted local storage and explicit revocation semantics before shipping.
- Use *Proposed*, *Prototype*, *Locally tested*, *Integrated*, *Released* accurately. Never claim a build/device test you did not actually run.
- No GitHub Actions or unattended deployments; store signing, releases and repository license changes need explicit maintainer approval.
- Prefer small independently tested changes. Avoid auto-generated checked-in Android/iOS IDE output.
