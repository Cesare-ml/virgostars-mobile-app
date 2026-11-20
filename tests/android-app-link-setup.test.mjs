import test from 'node:test';
import assert from 'node:assert/strict';
import { CALLBACK, patchActivity, patchManifest } from '../scripts/prepare-android-app-link.mjs';

const manifest = `<?xml version="1.0"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application><activity android:name=".MainActivity" android:exported="true">
    <intent-filter><action android:name="android.intent.action.MAIN" /></intent-filter>
  </activity></application>
</manifest>\n`;
const activity = `package it.virgostars.mobile

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }
}\n`;

test('generated App Link targets only the fixed callback and patching is idempotent', () => {
  assert.equal(CALLBACK, 'https://virgostars.it/android/oauth/callback');
  const output = patchManifest(manifest);
  assert.match(output, /android:autoVerify="true"/);
  assert.match(output, /android:scheme="https" android:host="virgostars\.it" android:path="\/android\/oauth\/callback"/);
  assert.doesNotMatch(output, /android:pathPrefix|android:pathPattern/);
  assert.equal(patchManifest(output), output);
  assert.throws(() => patchManifest(manifest.replace('.MainActivity', '.OtherActivity')));
  assert.throws(() => patchManifest(output.replace('android:autoVerify="true"', 'android:autoVerify="false"')));
});

test('cold and warm intents are stripped before Tauri and consumed only once', () => {
  const output = patchActivity(activity);
  assert.match(output, /captureVirgoCallback\(intent\)\n    enableEdgeToEdge\(\)\n    super\.onCreate/);
  assert.match(output, /onNewIntent\(intent: Intent\) \{\n    captureVirgoCallback\(intent\)\n    super\.onNewIntent\(intent\)/);
  assert.match(output, /input\.data = null/);
  assert.match(output, /fun takeVirgoCallback\(\): String\? \{\n    val result = pendingVirgoCallback\n    pendingVirgoCallback = null/);
  assert.match(output, /super\.onCreate\(savedInstanceState\)\n    currentVirgoActivity = java\.lang\.ref\.WeakReference\(this\)/);
  assert.match(output, /fun getVirgoActivity\(\): MainActivity\? = currentVirgoActivity\?\.get\(\)/);
  assert.match(output, /if \(currentVirgoActivity\?\.get\(\) === this\) currentVirgoActivity = null/);
  assert.equal(patchActivity(output), output);
  assert.throws(() => patchActivity(activity.replace('  override fun onCreate', '  override fun onNewIntent(intent: Intent) {}\n  override fun onCreate')));
});
