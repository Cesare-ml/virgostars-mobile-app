#!/usr/bin/env bash
# macOS-only build helper. The outputs are experimental; never upload them as a GitHub Release.
set -euo pipefail
MODE="${1:-}"
if [[ "$MODE" != "simulator" && "$MODE" != "testflight" ]]; then
  echo "Usage: bash scripts/ci-ios-build.sh simulator|testflight" >&2
  exit 2
fi
if [[ "${VIRGOSTARS_IOS_CI:-}" != "1" ]]; then
  echo "VIRGOSTARS_IOS_CI=1 is required for copyright-safe preview inputs" >&2
  exit 2
fi
cd "$(dirname "$0")/.."
test -f ../astrological-charts/package-lock.json
test -f ../astrological-functions/package.json
xcrun --sdk iphonesimulator --show-sdk-path
xcrun --sdk iphoneos --show-sdk-path
echo "::group::Build shared Angular renderer"
npm ci --prefix ../astrological-charts
npm run --prefix ../astrological-charts build:library
npm run --prefix ../astrological-charts demo:pack
echo "::endgroup::"
echo "::group::Validate mobile frontend"
npm ci
npm run check
echo "::endgroup::"
echo "::group::Generate and build native iOS app"
node scripts/prepare-ios-ci-icon.mjs
npm run tauri -- icon .local/ios-ci-launcher.png
npm run tauri -- ios init --ci
if [[ "$MODE" == "simulator" ]]; then
  if [[ "$(uname -m)" == "arm64" ]]; then
    TARGET="aarch64-sim"
  else
    TARGET="x86_64"
  fi
  npm run tauri -- ios build --target "$TARGET" --ci --no-sign
  APP="$(find src-tauri/gen/apple/build -type d -name '*.app' -print -quit)"
  test -n "$APP" || { echo "::error::No iOS simulator .app was produced"; exit 1; }
  BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$APP/Info.plist")"
  test "$BUNDLE_ID" = 'it.virgostars.mobile' || { echo "::error::Unexpected iOS bundle ID: $BUNDLE_ID"; exit 1; }
  ditto -c -k --sequesterRsrc --keepParent "$APP" "$RUNNER_TEMP/VirgoStars-iOS-simulator.zip"
  echo "IOS_ARTIFACT=$RUNNER_TEMP/VirgoStars-iOS-simulator.zip" >> "$GITHUB_ENV"
else
  test -n "${APPLE_DEVELOPMENT_TEAM:-}"
  test -n "${IOS_CERTIFICATE:-}"
  test -n "${IOS_CERTIFICATE_PASSWORD:-}"
  test -n "${IOS_MOBILE_PROVISION:-}"
  test -n "${APPLE_API_KEY_PATH:-}"
  npm run tauri -- ios build --target aarch64 --ci --export-method app-store-connect \
    --build-number "${GITHUB_RUN_NUMBER:-1}"
  IPA="$(find src-tauri/gen/apple/build -type f -name '*.ipa' -print -quit)"
  test -n "$IPA" || { echo "::error::No signed iPhone IPA was produced"; exit 1; }
  mkdir -p "$RUNNER_TEMP/ipa-verification"
  unzip -q "$IPA" -d "$RUNNER_TEMP/ipa-verification"
  APP="$(find "$RUNNER_TEMP/ipa-verification/Payload" -type d -name '*.app' -print -quit)"
  test -n "$APP" || { echo "::error::IPA has no app bundle"; exit 1; }
  BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$APP/Info.plist")"
  test "$BUNDLE_ID" = 'it.virgostars.mobile' || { echo "::error::Unexpected signed bundle ID: $BUNDLE_ID"; exit 1; }
  codesign --verify --deep --strict "$APP"
  echo "IOS_ARTIFACT=$IPA" >> "$GITHUB_ENV"
fi
echo "::endgroup::"
