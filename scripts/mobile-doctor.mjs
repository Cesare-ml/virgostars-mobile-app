#!/usr/bin/env node
/**
 * Read-only mobile toolchain diagnostics. Never logs environment variable values,
 * absolute paths, Android device identifiers or credentials.
 *
 * Usage:
 *   node scripts/mobile-doctor.mjs [--stage=source|android|device] [--json] [--strict]
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const STAGES = ['source', 'android', 'device'];

export function parseFlags(args) {
  const stageFlag = args.find((arg) => arg.startsWith('--stage='));
  const stage = stageFlag?.slice('--stage='.length) ?? 'source';
  if (!STAGES.includes(stage)) throw new Error('Invalid stage; choose source, android or device.');
  const allowed = new Set(['--json', '--strict', '--help', ...(stageFlag ? [stageFlag] : [])]);
  if (args.some((arg) => !allowed.has(arg))) throw new Error('Unsupported doctor argument.');
  return { stage, json: args.includes('--json'), strict: args.includes('--strict'), help: args.includes('--help') };
}

export function supportedNode(version) {
  const [major, minor] = version.replace(/^v/, '').split('.').map(Number);
  return (major === 22 && minor >= 12) || major === 24;
}

export function diagnose({ stage = 'source', env = process.env, nodeVersion = process.versions.node,
  lockfile = false, probe }) {
  if (!STAGES.includes(stage)) throw new Error('Unsupported diagnostic stage.');
  const checks = [];
  const add = (id, ok, advice) => checks.push({ id, ok: Boolean(ok), advice: ok ? null : advice });
  const hasTool = (name, args = ['--version']) => Boolean(probe(name, args).ok);
  add('node-supported', supportedNode(nodeVersion), 'Use Node.js 22.12+ or 24.x.');
  add('npm', hasTool('npm'), 'Install npm for your Node.js installation.');
  add('lockfile', lockfile, 'Generate and commit package-lock.json using npm install; then use npm ci.');
  if (stage === 'android' || stage === 'device') {
    add('rustc', hasTool('rustc'), 'Install Rust 1.90+ and an Android-compatible toolchain.');
    add('cargo', hasTool('cargo'), 'Install Cargo with the Rust toolchain.');
    add('rustup', hasTool('rustup'), 'Install rustup and Android Rust targets.');
    const targets = probe('rustup', ['target', 'list', '--installed']);
    add('android-rust-target', targets.ok && /(?:aarch64|armv7|i686|x86_64)-linux-android/.test(targets.output),
      'Run rustup target add aarch64-linux-android (and x86_64-linux-android for emulators).');
    add('java', hasTool('java', ['-version']), 'Install a compatible Android Gradle JDK (17+).');
    add('java-home', Boolean(env.JAVA_HOME), 'Set JAVA_HOME; its value is never displayed.');
    add('android-sdk', Boolean(env.ANDROID_HOME || env.ANDROID_SDK_ROOT),
      'Set ANDROID_HOME or ANDROID_SDK_ROOT; its value is never displayed.');
    add('android-ndk', Boolean(env.NDK_HOME || env.ANDROID_NDK_HOME),
      'Install NDK and configure NDK_HOME; its value is never displayed.');
    add('adb', hasTool('adb', ['version']), 'Install Android SDK platform-tools and add adb to PATH.');
  }
  if (stage === 'device') {
    const devices = probe('adb', ['devices']);
    // Output is deliberately parsed, never returned or printed: IDs are sensitive.
    const connected = devices.ok && devices.output.split(/\r?\n/).some((line) => /\tdevice\s*$/.test(line));
    add('authorized-device', connected, 'Start an Android emulator or authorize USB debugging on a test device.');
  }
  const passed = checks.filter((check) => check.ok).length;
  return { stage, passed, total: checks.length, ready: passed === checks.length, checks };
}

export function systemProbe(name, args) {
  const command = process.platform === 'win32' && name === 'npm' ? 'npm.cmd' : name;
  const response = spawnSync(command, args, { encoding: 'utf8', timeout: 4000, windowsHide: true, shell: false });
  return { ok: !response.error && response.status === 0, output: String(response.stdout || response.stderr || '') };
}

function main() {
  let options;
  try {
    options = parseFlags(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`Doctor: ${error.message}\n`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    process.stdout.write('Usage: node scripts/mobile-doctor.mjs [--stage=source|android|device] [--json] [--strict]\n');
    return;
  }
  const report = diagnose({
    stage: options.stage,
    lockfile: existsSync(new URL('../package-lock.json', import.meta.url)),
    probe: systemProbe
  });
  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write(`VirgoStars Mobile doctor (${report.stage}): ${report.passed}/${report.total} checks OK\n`);
    for (const check of report.checks) {
      process.stdout.write(`  ${check.ok ? 'OK' : 'MISSING'} ${check.id}${check.advice ? ' — ' + check.advice : ''}\n`);
    }
    process.stdout.write(report.ready ? 'Prerequisites detected; build/device smoke still required.\n' :
      'Prerequisites missing; no build success is implied.\n');
  }
  if (options.strict && !report.ready) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
