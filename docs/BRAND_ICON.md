# VirgoStars Mobile — official icon

The official golden VirgoStars emblem supplied by the maintainer on 18 November 2026 replaces the temporary abstract star. Original proportions and fine-grain gold texture are preserved; the background `#101726` and centered safety margin keep the disk visible behind Android/iOS rounded masks.

- `src/assets/virgostars-icon.png` (1024px) is the source for `npm run icons` (`tauri icon`).
- `src/assets/virgostars-mark.png` is the transparent header mark used by the Angular shell.
- `src-tauri/icons/` contains Tauri-native PNG, ICO and ICNS files for deterministic builds.
- Run `npm run icons` before building if an already-initialized Android/iOS IDE project is using old cached launcher icons; initialize with `npm run android:init` or `npm run ios:init` when needed.

Generated Android/iOS native IDE trees remain ignored. Android launcher and adaptive masks must be visually tested in an emulator and on a physical device. iOS requires Xcode/macOS and has not yet been validated.

The logo is a user-supplied brand asset; CPAL-1.0 on the source code is not by itself a trademark/artwork license.
