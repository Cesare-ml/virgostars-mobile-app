import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const checks = [];
const check = (name, ok, hint) => checks.push({ name, ok, hint });
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 12000, shell: process.platform === 'win32' });
  return result.status === 0 ? result.stdout.trim() : null;
};

const nodeMajor = Number(process.versions.node.split('.')[0]);
check('Node.js 22 or 24', (nodeMajor === 22 && Number(process.versions.node.split('.')[1]) >= 12) || nodeMajor === 24,
  'Install Node.js 22.12+ or Node.js 24.');
check('npm available', run('npm', ['--version']) !== null, 'Install npm alongside Node.js.');
check('Rust toolchain', run('rustc', ['--version']) !== null, 'Install Rust using rustup.');
check('Cargo available', run('cargo', ['--version']) !== null, 'Install Cargo using rustup.');

const targets = run('rustup', ['target', 'list', '--installed']) ?? '';
check('Rust Android ARM64 target', targets.split(/\r?\n/).includes('aarch64-linux-android'),
  'Run rustup target add aarch64-linux-android.');
check('JAVA_HOME points to a JDK', Boolean(process.env.JAVA_HOME && existsSync(join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'))),
  'Set JAVA_HOME to the Android Studio JDK.');
const androidHome = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
check('Android SDK configured', Boolean(androidHome && existsSync(androidHome)),
  'Set ANDROID_HOME to the Android SDK directory.');
check('Android SDK platform tools', Boolean(androidHome && existsSync(join(androidHome, 'platform-tools'))),
  'Install Android SDK Platform-Tools from Android Studio.');
check('Android NDK configured', Boolean(process.env.NDK_HOME && existsSync(process.env.NDK_HOME)),
  'Install the NDK and set NDK_HOME to its directory.');
check('npm dependency lockfile', existsSync(new URL('../package-lock.json', import.meta.url)),
  'Run npm install to generate package-lock.json, then commit the genuine lockfile.');
check('npm dependencies installed', existsSync(new URL('../node_modules/@angular/cli', import.meta.url)),
  'Run npm install (or npm ci after the lockfile is committed).');

for (const { name, ok, hint } of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' — ' + hint}`);
}
const failed = checks.filter(({ ok }) => !ok).length;
console.log(`\nAndroid prerequisites: ${checks.length - failed}/${checks.length} checks passed.`);
if (failed) process.exitCode = 1;
