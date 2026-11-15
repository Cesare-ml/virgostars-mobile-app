import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnose, parseFlags, supportedNode } from '../scripts/mobile-doctor.mjs';

const availableTools = () => ({ ok: true, output: '' });
const allConfigured = { JAVA_HOME: '/private/ignored', ANDROID_HOME: '/private/ignored', NDK_HOME: '/private/ignored' };

test('doctor rejects unsupported flags and invalid stages', () => {
  assert.deepEqual(parseFlags([]), { stage: 'source', json: false, strict: false, help: false });
  assert.deepEqual(parseFlags(['--stage=android', '--json', '--strict']), {
    stage: 'android', json: true, strict: true, help: false
  });
  assert.throws(() => parseFlags(['--stage=ios']), /Invalid stage/);
  assert.throws(() => parseFlags(['--dangerous']), /Unsupported/);
});

test('source doctor enforces declared Node LTS range', () => {
  assert.equal(supportedNode('22.11.0'), false);
  assert.equal(supportedNode('22.12.0'), true);
  assert.equal(supportedNode('23.0.0'), false);
  assert.equal(supportedNode('24.1.0'), true);
  assert.equal(supportedNode('25.0.0'), false);
});

test('source doctor fails closed without an authentic dependency lockfile', () => {
  const result = diagnose({ stage: 'source', lockfile: false, nodeVersion: '22.12.0', probe: availableTools });
  assert.equal(result.ready, false);
  assert.deepEqual(result.checks.filter((entry) => !entry.ok).map((entry) => entry.id), ['lockfile']);
  assert.equal(result.total, 3);
});

test('Android doctor checks native toolchain without printing secret environment values', () => {
  const calls = [];
  const result = diagnose({
    stage: 'android',
    env: allConfigured, lockfile: true, nodeVersion: '24.0.0',
    probe(name, args) {
      calls.push(name);
      if (name === 'rustup' && args[0] === 'target') return { ok: true, output: 'aarch64-linux-android\n' };
      return { ok: true, output: 'ready' };
    }
  });
  assert.equal(result.ready, true);
  assert.ok(calls.includes('adb'));
  assert.ok(!JSON.stringify(result).includes('/private/ignored'));
});

test('Android doctor detects a missing emulator or USB-authorized device', () => {
  const result = diagnose({
    stage: 'device',
    env: allConfigured, lockfile: true, nodeVersion: '22.12.0',
    probe(name, args) {
      if (name === 'rustup' && args[0] === 'target') return { ok: true, output: 'x86_64-linux-android\n' };
      if (name === 'adb' && args[0] === 'devices') {
        return { ok: true, output: 'List of devices attached\nFAKE-DEVICE-ID\tunauthorized\n' };
      }
      return { ok: true, output: '' };
    }
  });
  assert.equal(result.ready, false);
  assert.deepEqual(result.checks.filter((entry) => !entry.ok).map((entry) => entry.id), ['authorized-device']);
  assert.ok(!JSON.stringify(result).includes('FAKE-DEVICE-ID'));
});

test('Android doctor accepts authorized Android device without exposing serial', () => {
  const result = diagnose({
    stage: 'device', env: allConfigured, lockfile: true, nodeVersion: '22.12.0',
    probe(name, args) {
      if (name === 'rustup' && args[0] === 'target') return { ok: true, output: 'aarch64-linux-android\n' };
      if (name === 'adb' && args[0] === 'devices') return { ok: true, output: 'List of devices attached\nFAKE-DEVICE-ID\tdevice\n' };
      return { ok: true, output: '' };
    }
  });
  assert.equal(result.ready, true);
  assert.ok(!JSON.stringify(result).includes('FAKE-DEVICE-ID'));
});
