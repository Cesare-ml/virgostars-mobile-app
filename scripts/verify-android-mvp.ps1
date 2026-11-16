# VirgoStars Mobile MVP — reproducible Android release gate (Windows PowerShell).
# Requires Node 22/24, Rust, Java, Android SDK/NDK and Tauri Android setup.
# Run from the repository root after Android initialization.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Checked([string]$Name, [string[]]$Arguments) {
  Write-Host ">>> $Name $($Arguments -join ' ')"
  & $Name @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Name failed (exit code $LASTEXITCODE)" }
}

if (-not (Test-Path 'package.json') -or -not (Test-Path 'src-tauri/tauri.conf.json')) {
  throw 'Run this script from the virgostars-mobile-app repository root.'
}
if (-not (Test-Path 'package-lock.json')) {
  throw 'Missing package-lock.json. Run npm install, review and commit the lockfile before release validation.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm is missing.' }
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { throw 'Rust/Cargo is missing.' }
if (-not (Get-Command java -ErrorAction SilentlyContinue)) { throw 'Java is missing.' }
if (-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT) {
  throw 'Set ANDROID_HOME or ANDROID_SDK_ROOT to the Android SDK.'
}

Invoke-Checked 'npm' @('ci')
Invoke-Checked 'npm' @('run', 'check')
if (-not (Test-Path 'src-tauri/gen/android')) {
  throw 'Android project not initialized. Run npm run android:init, review generated files, then retry.'
}
Invoke-Checked 'npm' @('run', 'android:build')

$apks = @(Get-ChildItem -Path 'src-tauri/gen/android' -Recurse -File -Filter '*.apk' -ErrorAction SilentlyContinue)
if ($apks.Count -eq 0) {
  throw 'Build command finished but no APK was found under src-tauri/gen/android.'
}
Write-Host 'Android build succeeded. APK candidates:'
$apks | ForEach-Object { Write-Host $_.FullName }
Write-Host 'Next gate: install on an Android device and verify first launch, offline chart, and foreground refresh.'
