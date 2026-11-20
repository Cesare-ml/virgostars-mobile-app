#!/usr/bin/env python3
"""Package an unsigned, real-device iOS .app as a Sideloadly-compatible IPA.

Runs only after 'tauri ios build --target aarch64 --no-sign' on macOS.
This deliberately does not sign, notarize, publish or install the app.
"""
from __future__ import annotations

import argparse
import hashlib
import plistlib
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

EXPECTED_BUNDLE_ID = "it.virgostars.mobile"


def fail(message: str) -> None:
    raise RuntimeError(message)


def find_device_app(root: Path) -> Path:
    # Tauri CLI versions may retain the .app in build/arm64 or in an Xcode archive.
    archives = sorted(root.glob("*.xcarchive/Products/Applications/*.app"))
    loose = sorted(root.glob("arm64/*.app"))
    candidates = archives or loose
    if len(candidates) != 1:
        fail(
            "Expected exactly one device .app in the Xcode archive or build/arm64; "
            f"found {len(candidates)}. Never package a simulator .app."
        )
    if candidates[0].is_symlink() or not candidates[0].is_dir():
        fail("The iOS application bundle is not a regular directory.")
    return candidates[0]


def inspect_device_app(app: Path) -> dict:
    plist_path = app / "Info.plist"
    if not plist_path.is_file() or plist_path.is_symlink():
        fail("The iPhone app has no regular Info.plist.")
    with plist_path.open("rb") as file:
        info = plistlib.load(file)

    bundle_id = info.get("CFBundleIdentifier")
    if bundle_id != EXPECTED_BUNDLE_ID:
        fail(f"Unexpected bundle ID: {bundle_id!r}")

    platforms = info.get("CFBundleSupportedPlatforms", [])
    platform_name = str(info.get("DTPlatformName", "")).lower()
    if "iPhoneSimulator" in platforms or platform_name == "iphonesimulator":
        fail("This is a simulator app, not an iPhone device build.")
    if "iPhoneOS" not in platforms and platform_name != "iphoneos":
        fail("The app does not declare the iPhoneOS device platform.")

    executable_name = info.get("CFBundleExecutable", "")
    if not isinstance(executable_name, str) or "/" in executable_name or not executable_name:
        fail("Invalid CFBundleExecutable.")
    executable = app / executable_name
    if not executable.is_file() or executable.is_symlink():
        fail("The app has no regular native executable.")
    if executable.stat().st_mode & 0o111 == 0:
        fail("The iPhone executable is not marked executable.")

    arch = subprocess.run(["lipo", "-archs", str(executable)], capture_output=True, text=True, check=True)
    if "arm64" not in arch.stdout.split():
        fail(f"The native executable does not include arm64: {arch.stdout.strip()}")

    # arm64 alone does NOT distinguish an iPhone binary from Apple Silicon Simulator.
    # LC_BUILD_VERSION must specify iOS, not iOS Simulator.
    version = subprocess.run(
        ["xcrun", "vtool", "-show-build", str(executable)],
        capture_output=True, text=True, check=True,
    )
    if not re.search(r"\bplatform\s+(?:IOS|2)\b", version.stdout, re.IGNORECASE):
        fail("The binary is not marked for iPhoneOS by LC_BUILD_VERSION.")

    if (app / "embedded.mobileprovision").exists():
        fail("Unexpected embedded provisioning profile in an unsigned app.")
    signature = subprocess.run(["codesign", "-dv", str(app)], capture_output=True, text=True)
    if signature.returncode == 0 and "Authority=" in (signature.stdout + signature.stderr):
        fail("Unexpected signed distribution identity: refusing to label the IPA unsigned.")

    for path in app.rglob("*"):
        if path.is_file() and path.suffix.lower() in {".eph", ".bsp", ".se1"}:
            fail("An ephemeris kernel was unexpectedly bundled: " + path.name)
        if path.is_file() and path.name == "world-cities.sqlite":
            fail("The Android-only city database was unexpectedly bundled.")
    return info


def package_ipa(app: Path, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        fail(f"Refusing to overwrite an existing IPA: {output}")
    with tempfile.TemporaryDirectory(prefix="virgostars-ios-ipa-") as tmp:
        root = Path(tmp)
        payload = root / "Payload"
        payload.mkdir()
        shutil.copytree(app, payload / app.name, symlinks=True)
        # ditto preserves app executable modes, frameworks and Apple bundle metadata.
        subprocess.run(
            ["ditto", "-c", "-k", "--norsrc", "--keepParent", "Payload", str(output)],
            cwd=root, check=True,
        )


def verify_ipa(output: Path, expected_name: str) -> None:
    prefix = f"Payload/{expected_name}/"
    with zipfile.ZipFile(output) as archive:
        corrupt = archive.testzip()
        if corrupt:
            fail(f"Corrupted IPA member: {corrupt}")
        names = archive.namelist()
        if not names or any(
            name != "Payload/" and not name.startswith(prefix) for name in names
        ):
            fail("IPA archive has unexpected paths outside Payload/<app>.app.")
        if prefix + "Info.plist" not in names:
            fail("IPA does not contain Payload/<app>.app/Info.plist.")
        if plistlib.loads(archive.read(prefix + "Info.plist")).get("CFBundleIdentifier") != EXPECTED_BUNDLE_ID:
            fail("Packaged app identifier differs from the verified build.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build-root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    app = find_device_app(args.build_root.resolve())
    info = inspect_device_app(app)
    output = args.output.resolve()
    package_ipa(app, output)
    verify_ipa(output, app.name)

    digest = hashlib.sha256()
    with output.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    checksum = output.with_suffix(".ipa.sha256")
    checksum.write_text(f"{digest.hexdigest()}  {output.name}\n", encoding="ascii")
    print(f"Verified iPhoneOS arm64 unsigned IPA: {output}")
    print(f"Bundle: {info['CFBundleIdentifier']} | IPA bytes: {output.stat().st_size}")
    print(f"SHA-256: {digest.hexdigest()}")
    print(f"Checksum file: {checksum}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, OSError, ValueError, subprocess.CalledProcessError, zipfile.BadZipFile) as exc:
        print(f"iOS unsigned IPA packaging failed: {exc}", file=sys.stderr)
        sys.exit(1)
