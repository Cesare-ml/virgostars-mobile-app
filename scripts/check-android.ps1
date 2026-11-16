# Local-only Android build gate. No CI, signing, publishing, or GitHub Actions.
# Run from repository root in Windows PowerShell: powershell -ExecutionPolicy Bypass -File scripts/check-android.ps1
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Require-Command([string]$name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Missing command: $name. Install/configure it before building."
  }
}

foreach ($command in @('node', 'npm', 'rustc', 'rustup', 'java', 'adb')) {
  Require-Command $command
}

if (-not (Test-Path 'package.json') -or -not (Test-Path 'src-tauri/tauri.conf.json')) {
  throw 'Run this script from the VirgoStars Mobile repository root.'
}

if (-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT) {
  throw 'Set ANDROID_HOME (or ANDROID_SDK_ROOT) to the installed Android SDK.'
}

if (-not $env:NDK_HOME) {
  throw 'Set NDK_HOME to the installed Android NDK directory.'
}

if (-not (Test-Path $env:NDK_HOME)) {
  throw 'NDK_HOME does not point to an existing directory.'
}

if (-not $env:JAVA_HOME) {
  throw 'Set JAVA_HOME to the JDK used by Android Studio.'
}

$targets = @(rustup target list --installed)
if ($LASTEXITCODE -ne 0 -or -not ($targets -contains 'aarch64-linux-android')) {
  throw 'Missing Rust Android ARM64 target. Run: rustup target add aarch64-linux-android'
}

Write-Host 'Checking frontend dependencies and Angular production build...'
if (-not (Test-Path 'package-lock.json')) {
  Write-Warning 'No package-lock.json found: npm ci cannot be used yet. Generate and commit a reviewed lockfile.'
  npm install --no-audit --no-fund
} else {
  npm ci --no-audit --no-fund
}
if ($LASTEXITCODE -ne 0) { throw 'npm dependency installation failed.' }

npm run check
if ($LASTEXITCODE -ne 0) { throw 'Frontend tests or build failed.' }

if (-not (Test-Path 'src-tauri/gen/android')) {
  Write-Host 'Initializing the local Android project...'
  npm run android:init
  if ($LASTEXITCODE -ne 0) { throw 'Tauri Android initialization failed.' }
}

Write-Host 'Building Android APK locally (no release publication)...'
$buildStart = Get-Date
npm run android:build -- --apk
if ($LASTEXITCODE -ne 0) { throw 'Android build failed.' }

$apks = @(Get-ChildItem 'src-tauri/gen/android' -Filter '*.apk' -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -ge $buildStart.AddSeconds(-2) })
if ($apks.Count -eq 0) {
  throw 'Build returned success, but no APK was found in the generated Android project.'
}

Write-Host 'APK artifacts found:'
$apks | ForEach-Object { Write-Host $_.FullName }
Write-Host 'Fresh build artifact exists. Installation and real-device smoke testing remain separate checks.'
