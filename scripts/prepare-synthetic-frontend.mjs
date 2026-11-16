/** Stage ONLY original synthetic chart assets. Never vend original images or the upstream demo. */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SAFE_PART = /^[a-zA-Z0-9_.@ -]+$/;
const IMAGE_TYPES = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MAX_FILES = 2000;
const MAX_FILE_BYTES = 10_000_000;
const MAX_TOTAL_BYTES = 200_000_000;
const MANIFEST_FILE = 'synthetic-assets-manifest.json';

function requireCondition(valid, explanation) {
  if (!valid) throw new Error(explanation);
}
function checkRegular(path, folder = false) {
  const status = lstatSync(path);
  requireCondition(!status.isSymbolicLink() && (folder ? status.isDirectory() : status.isFile()),
    'Unsafe or invalid ' + (folder ? 'directory' : 'file') + ': ' + path);
}
function safePath(input) {
  requireCondition(typeof input === 'string' && input.startsWith('img/') && !input.includes('\\'),
    'Invalid synthetic asset path');
  const parts = input.split('/');
  requireCondition(parts.length >= 2 && parts.every(part => part !== '.' && part !== '..' &&
    part.length < 200 && SAFE_PART.test(part)), 'Unsafe synthetic asset path: ' + input);
  requireCondition(IMAGE_TYPES.has(extname(input).toLowerCase()), 'Unapproved synthetic file type: ' + input);
  return parts;
}
function readSafeFile(root, parts) {
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = join(current, parts[i]);
    checkRegular(current, i !== parts.length - 1);
  }
  return readFileSync(current);
}
function fingerprint(content) { return createHash('sha256').update(content).digest('hex'); }
function listAssetFiles(root, prefix = '') {
  const files = [];
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    requireCondition(!entry.isSymbolicLink(), 'Symlink in staged assets: ' + entry.name);
    const relative = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) files.push(...listAssetFiles(root, relative));
    else {
      requireCondition(entry.isFile(), 'Unexpected filesystem object: ' + relative);
      files.push(relative);
    }
  }
  return files;
}
function verifyExisting(destination, files, metadata) {
  checkRegular(destination, true);
  const assets = join(destination, 'assets');
  checkRegular(assets, true);
  const meta = JSON.parse(readSafeFile(destination, [MANIFEST_FILE]).toString('utf8'));
  requireCondition(meta.schemaVersion === 1 && meta.source?.repository === 'synthetic-local-fixtures',
    'Existing asset stage is not a synthetic stage; inspect/delete only .local/frontend');
  requireCondition(JSON.stringify(meta) === JSON.stringify(metadata),
    'Existing synthetic assets differ; inspect/delete only .local/frontend before rebuilding');
  const actualFiles = listAssetFiles(assets).sort();
  const expectedFiles = files.map(item => item.path).sort();
  requireCondition(JSON.stringify(actualFiles) === JSON.stringify(expectedFiles),
    'Existing synthetic asset stage contains missing or unapproved files');
  for (const file of files) {
    const bytes = readSafeFile(assets, file.parts);
    requireCondition(bytes.length === file.bytes.length && fingerprint(bytes) === file.sha256,
      'Existing synthetic asset stage is modified: ' + file.path);
  }
  const top = readdirSync(destination).sort();
  requireCondition(JSON.stringify(top) === JSON.stringify(['assets', MANIFEST_FILE].sort()),
    'Existing asset stage contains non-asset material');
  return { destination, count: files.length, reused: true };
}

export function prepareSyntheticAssets(chartsPath, destinationPath) {
  const charts = resolve(chartsPath);
  const destination = resolve(destinationPath);
  checkRegular(charts, true);
  const pack = join(charts, '.local', 'demo-pack');
  const assetRoot = join(pack, 'public', 'assets');
  const manifestPath = join(pack, 'manifests', 'approved-assets.json');
  for (const p of [join(charts,'.local'), pack, join(pack,'public'), assetRoot, join(pack,'manifests')]) checkRegular(p, true);
  checkRegular(manifestPath);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  requireCondition(manifest.schemaVersion === 1 && manifest.source?.repository === 'synthetic-local-fixtures' &&
    manifest.source?.commit === 'none' && manifest.source?.assetRoot === 'public/assets',
    'Only the charts locally generated synthetic manifest is permitted');
  requireCondition(Array.isArray(manifest.assets) && manifest.assets.length > 0 && manifest.assets.length <= MAX_FILES,
    'Invalid synthetic asset count');

  let totalBytes = 0;
  const uniquePaths = new Set();
  const files = manifest.assets.map(item => {
    const parts = safePath(item.path);
    const pathKey = item.path.normalize('NFC').toLowerCase();
    requireCondition(!uniquePaths.has(pathKey), 'Case-insensitive duplicate synthetic asset: ' + item.path);
    uniquePaths.add(pathKey);
    requireCondition(item.rightsHolder === 'Astrological Charts synthetic test fixture' &&
      typeof item.permissionBasis === 'string' && item.permissionBasis.startsWith('Original synthetic checkerboard data'),
      'Unapproved rights provenance: ' + item.path);
    requireCondition(Number.isSafeInteger(item.bytes) && item.bytes >= 0 && item.bytes <= MAX_FILE_BYTES &&
      typeof item.sha256 === 'string' && /^[0-9a-f]{64}$/.test(item.sha256),
      'Invalid synthetic asset metadata: ' + item.path);
    totalBytes += item.bytes;
    requireCondition(totalBytes <= MAX_TOTAL_BYTES, 'Synthetic asset pack exceeds safe size limit');
    const bytes = readSafeFile(assetRoot, parts);
    requireCondition(bytes.length === item.bytes && fingerprint(bytes) === item.sha256,
      'Tampered synthetic asset: ' + item.path);
    return {path:item.path, parts, sha256:item.sha256, bytes};
  });

  const metadata = { schemaVersion: 1, source: manifest.source,
    files: files.map(({path,sha256,bytes})=>({path,sha256,bytes:bytes.length})) };
  if (existsSync(destination)) return verifyExisting(destination, files, metadata);
  const staging = destination + '.staging-' + process.pid;
  requireCondition(!existsSync(staging), 'A staging directory already exists; investigate before retrying');
  try {
    mkdirSync(join(staging, 'assets'), {recursive:true});
    for (const file of files) {
      const target = join(staging, 'assets', ...file.parts);
      mkdirSync(dirname(target), {recursive:true});
      writeFileSync(target, file.bytes, {flag:'wx'});
    }
    writeFileSync(join(staging, MANIFEST_FILE), JSON.stringify(metadata,null,2)+'\n', {flag:'wx'});
    renameSync(staging, destination);
    return { destination, count: files.length, reused:false };
  } catch (error) {
    rmSync(staging, {recursive:true,force:true});
    throw error;
  }
}

// Name retained for compatibility with the existing npm command; now stages images only.
export const prepareSyntheticFrontend = prepareSyntheticAssets;

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const args = process.argv.slice(2);
    requireCondition(args.length <= 4 && args.length % 2 === 0, 'Usage: --charts DIR --out DIR');
    const flags = {};
    for (let i=0;i<args.length;i+=2) {
      requireCondition(['--charts','--out'].includes(args[i]) && args[i+1] && !Object.hasOwn(flags,args[i]),
        'Invalid or duplicate option');
      flags[args[i]]=args[i+1];
    }
    const result=prepareSyntheticAssets(flags['--charts'] ?? resolve(ROOT,'../astrological-charts'),
      flags['--out'] ?? resolve(ROOT,'.local/frontend'));
    console.log((result.reused ? 'Reused' : 'Staged') + ' ' + result.count +
      ' SHA-256 verified synthetic assets. No demo HTML/JS copied.');
  } catch (error) { console.error('SYNTHETIC ASSET STAGING FAILED:', error.message); process.exitCode=1; }
}
