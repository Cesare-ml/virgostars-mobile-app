// Opt-in patch to the local Tauri-generated Android project. Do not modify
// native files with unfamiliar customizations; keep generated output untracked.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const CALLBACK = 'https://virgostars.it/android/oauth/callback';
const marker = 'VIRGOSTARS_APP_LINK_V1';
const filter = `            <!-- ${marker} -->
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="virgostars.it" android:path="/android/oauth/callback" />
            </intent-filter>
`;
const functions = `
  // ${marker}: intercept callback data before Tauri plugins see the intent.
  private var pendingVirgoCallback: String? = null

  @Synchronized
  private fun captureVirgoCallback(input: Intent?) {
    val uri = input?.data ?: return
    if (input.action != Intent.ACTION_VIEW || uri.scheme != "https" ||
        uri.authority != "virgostars.it" || uri.encodedPath != "/android/oauth/callback") return
    val callback = uri.toString()
    input.data = null
    if (callback.length <= 2048) pendingVirgoCallback = callback
  }

  @Synchronized
  fun takeVirgoCallback(): String? {
    val result = pendingVirgoCallback
    pendingVirgoCallback = null
    return result
  }

  override fun onNewIntent(intent: Intent) {
    captureVirgoCallback(intent)
    super.onNewIntent(intent)
  }
`;

export function patchManifest(input) {
  if (input.includes(marker)) {
    if (!input.includes(filter)) throw new Error('App Link manifest marker was modified');
    return input;
  }
  const match = /<activity\b[^>]*android:name="\.MainActivity"[^>]*>[\s\S]*?<\/activity>/.exec(input);
  if (!match || input.indexOf('android:name=".MainActivity"', match.index + match[0].length) !== -1)
    throw new Error('Cannot identify the generated MainActivity');
  if (match[0].includes('android:autoVerify') || match[0].includes('/android/oauth/callback'))
    throw new Error('Existing App Link requires manual review');
  const patched = match[0].replace(/([ \t]*)<\/activity>$/, `${filter}$1</activity>`);
  return input.slice(0, match.index) + patched + input.slice(match.index + match[0].length);
}

export function patchActivity(input) {
  input = input.replace(/\r\n/g, '\n');
  if (input.includes(marker)) {
    if (!input.includes(functions) || !input.includes('    captureVirgoCallback(intent)\n    enableEdgeToEdge()'))
      throw new Error('App Link activity marker was modified');
    return input;
  }
  const normalized = input;
  if (!normalized.includes('package it.virgostars.mobile\n') ||
      !normalized.includes('import android.os.Bundle\n') ||
      !normalized.includes('class MainActivity : TauriActivity() {') ||
      !normalized.includes('    enableEdgeToEdge()\n    super.onCreate(savedInstanceState)') ||
      normalized.includes('onNewIntent(') || normalized.includes('captureVirgoCallback'))
    throw new Error('MainActivity has unsupported customizations');
  return normalized.replace('import android.os.Bundle\n', 'import android.os.Bundle\nimport android.content.Intent\n')
    .replace('    enableEdgeToEdge()\n    super.onCreate(savedInstanceState)',
      '    captureVirgoCallback(intent)\n    enableEdgeToEdge()\n    super.onCreate(savedInstanceState)')
    .replace(/\n}\s*$/, `${functions}\n}\n`);
}

async function main() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const manifest = resolve(root, 'src-tauri/gen/android/app/src/main/AndroidManifest.xml');
  const activity = resolve(root, 'src-tauri/gen/android/app/src/main/java/it/virgostars/mobile/MainActivity.kt');
  const [manifestText, activityText] = await Promise.all([readFile(manifest, 'utf8'), readFile(activity, 'utf8')]);
  const newManifest = patchManifest(manifestText.replace(/\r\n/g, '\n'));
  const newActivity = patchActivity(activityText);
  // Compute and validate both changes before writing either generated file.
  await writeFile(activity, newActivity, 'utf8');
  await writeFile(manifest, newManifest, 'utf8');
  process.stdout.write(`Prepared local Android App Link ${CALLBACK}; site association and backend remain separate.\n`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`App Link setup failed: ${error.message}\n`); process.exitCode = 1; });
}
