# iOS on GitHub Actions — build setup (experimental)

**Status (2026-11-20):** the first macOS/Xcode **unsigned simulator build succeeded**, including artifact upload ([GitHub Actions run 44795768102](https://github.com/Cesare-ml/virgostars-mobile-app/actions/runs/44795768102)). The resulting app has **not** been launched in Simulator or installed on an iPhone; the signed IPA, TestFlight delivery and App Store path remain untested and unconfigured. This is a technical preview, not a production-ready iOS port.

## Start without a Mac

1. Open [Actions](https://github.com/Cesare-ml/virgostars-mobile-app/actions/workflows/ios.yml) in this repository (after this change lands on `main`).
2. Select **iOS / Build (simulator and signed IPA)**, **Run workflow**, `target=simulator`. Pull requests and selected pushes to `main` also run this unsigned test.
3. If green, download artifact `VirgoStars-iOS-simulator-<run-number>`. Unzip on a Mac to install the contained `.app` in the Apple Simulator. **It is not an IPA and cannot be installed on an iPhone.** An artifact from an unsuccessful build is not evidence of a working app.
4. Read the workflow log when a step fails. The job checks the JavaScript contracts, Angular build, licensed preview glyphs, bundle identifier and iOS native compilation.

The workflow checks out the mobile application and **exact pinned commits** of `astrological-charts` and `astrological-functions` alongside it, runs `npm ci`, prepares a generated synthetic renderer asset pack and OFL Noto glyph images, and builds on a GitHub macOS/Xcode runner. Dependencies from sibling folders are required by the current `file:` imports in `package.json`. Update pins only after an integration build and regression test.

The GitHub job sets `VIRGOSTARS_IOS_CI=1` to stage **locally generated open-font symbols** instead of private-license VirgoStars glyphs. The desktop city catalog is Android-only, is *not* packaged for iOS and is bypassed during this preview. Tauri's `tauri.ios.conf.json` removes that resource for iOS; Android's full local database handling remains unchanged. Until the iOS place picker has a separate implementation, use manual coordinates/time-zone selection (where the UI supports it). The generated icon is validated; if the old 1024px icon is damaged, the workflow constructs a usable image from the committed official transparent mark.

**Limitations:** the iOS chart archive and device settings are not implemented with Apple Keychain, native offline city search is not available, DE441/USNO/Chiron ephemerides are not included, and WKWebView gestures/performance, file import and device lifecycles still need testing. With no imported ephemeris data, the default calculation provider reports unavailable. A successful CI compilation does **not** prove the live-sky MVP works on a physical iPhone.

## Prepare a real iPhone/TestFlight IPA

The signed path is **manual only from `main`**, uses the protected `ios-distribution` GitHub Environment, and is refused unless the maintainer explicitly sets `IOS_DISTRIBUTION_APPROVED=true` after a source/artwork distribution-rights audit and iOS release QA. Never set the approval merely to make CI green.

Apple requires an active [Apple Developer Program](https://developer.apple.com/programs/) membership, a registered bundle ID **`it.virgostars.mobile`**, a valid Apple Distribution certificate `.p12` with its private key/password and an **App Store Connect** provisioning profile for that exact App ID. An App Store Connect API key is used for distribution authentication. Consult the [official Tauri iOS signing guide](https://v2.tauri.app/distribute/sign/ios/) and [App Store guide](https://v2.tauri.app/distribute/app-store/).

Configure the following **GitHub Environment** at Settings → Environments → `ios-distribution`, preferably with required reviewers. Do not commit any credential, certificate, private key or provisioning profile.

| Type | Name | Value |
|---|---|---|
| Environment variable | `IOS_DISTRIBUTION_APPROVED` | `true` **only after release rights and QA approval** |
| Environment variable | `APPLE_DEVELOPMENT_TEAM` | Your 10-character Apple Team ID |
| Environment variable | `APPLE_API_KEY` | App Store Connect API Key ID |
| Environment variable | `APPLE_API_ISSUER` | App Store Connect Issuer ID |
| Environment secret | `IOS_CERTIFICATE` | Base64 of exported Apple Distribution `.p12` |
| Environment secret | `IOS_CERTIFICATE_PASSWORD` | Password for `.p12` |
| Environment secret | `IOS_MOBILE_PROVISION` | Base64 of App Store Connect `.mobileprovision` |
| Environment secret | `APPLE_API_PRIVATE_KEY` | Raw contents of downloaded `AuthKey_<KeyID>.p8` |

For a Mac-based collaborator, `base64 -i /path/to/certificate.p12 | pbcopy` and `base64 -i /path/to/profile.mobileprovision | pbcopy` produce values for the relevant Secrets. **On Windows PowerShell** (after obtaining the correct certificate/profile), use `[Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path '.\\certificate.p12')))` for `IOS_CERTIFICATE`, and the same expression with `.\\profile.mobileprovision` for `IOS_MOBILE_PROVISION`; store the output directly as GitHub Environment secrets, not in a tracked file. The `.p12` must contain the matching private key. Never paste secrets into issues, PRs, build logs or chats.

After setup: Actions → **iOS / Build** → **Run workflow** on `main` → `target=testflight`. Leave **upload_testflight=false** to produce a signed IPA as a workflow artifact for review. **This repository is public: do not consider Actions artifacts private or use this job for confidential prerelease binaries.** The optional checkbox `upload_testflight=true` explicitly uploads the built IPA to App Store Connect/TestFlight; the matching app must already exist, and Apple must process/approve it before testers can install it. This is **not** a public GitHub release and does not automatically create an App Store listing.

If you later want direct ad-hoc distribution, that requires a **separate** Ad Hoc provisioning profile containing each recipient device's UDID and a distinct export method. The current signed path produces an App Store Connect/TestFlight IPA, **not** a broadly sideloadable IPA.

## Locally on macOS

With Xcode, CocoaPods, xcodegen, Node 22 and Rust iOS toolchains installed, clone the three sibling repos in one parent directory, build the charts library and generate the synthetic demo pack. To reproduce the CI preview:

```bash
export VIRGOSTARS_IOS_CI=1
bash scripts/ci-ios-build.sh simulator
```

Without the CI flag, local `npm run ios:init` and `npm run ios:dev` use the normal private-source build assets and require the normal desktop city catalog. No generated Xcode project under `src-tauri/gen/` should be committed.

## Release checklist

- [ ] Simulator workflow passed and its artifact boots in Simulator, with wheel, current-sky state, relevant error handling and no placeholder UI accepted as production.
- [ ] All shared code, images and fonts licensed for distribution; source pins reviewed.
- [ ] iPhone hardware smoke: launch, gestures, background/foreground, WebGL recovery, device rotation, timezone and astronomical reference checks.
- [ ] iOS-specific encrypted archive, Keychain lifecycle, city search or clearly documented feature parity, platform file import and privacy permissions tested.
- [ ] Apple Developer identity, bundle ID, signing credentials and App Store Connect record configured.
- [ ] Signed IPA validates, TestFlight processing succeeds, private beta tested on a real iPhone.
- [ ] Only then assess App Store publication. GitHub Actions builds are not releases by default.
