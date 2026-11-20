import {createHash} from 'node:crypto';
import {createReadStream, constants} from 'node:fs';
import {copyFile, mkdir, rename, stat, lstat, unlink} from 'node:fs/promises';
import path from 'node:path';

// The approved desktop catalog stays in the ignored local build area, not Git.
const EXPECTED_BYTES=196808704;
const EXPECTED_SHA256='605f0d0e3646812b3aaa4acd8b895dd462b10b58d986df1c2e4ca1a486c7457a';
const source=path.resolve(process.env.VIRGOSTARS_CITY_CATALOG || '../virgostars-desktop/.local/places/world-cities.sqlite');
const directory=path.resolve('.local/places');
const target=path.join(directory,'world-cities.sqlite');
const staging=path.join(directory,'world-cities.sqlite.part');
async function inspect(file) {
  const info=await lstat(file);
  if(info.isSymbolicLink() || !info.isFile() || info.size!==EXPECTED_BYTES) throw Error('City catalog has unexpected size or is not a regular file');
  const hash=createHash('sha256');for await (const block of createReadStream(file)) hash.update(block);
  if(hash.digest('hex')!==EXPECTED_SHA256) throw Error('City catalog checksum does not match the desktop v2 catalog');
}
await inspect(source);
await mkdir(directory,{recursive:true});
try {await inspect(target);console.log('Verified desktop city catalog in local build area.');process.exit(0);}
catch(error) {if(error.code!=='ENOENT') throw error;}
let created=false;
try {
  await copyFile(source,staging,constants.COPYFILE_EXCL);
  created=true;
  await inspect(staging);
  try {await stat(target);throw Error('City catalog appeared during staging; refusing to overwrite');}
  catch(error) {if(error.code!=='ENOENT') throw error;}
  await rename(staging,target);
  created=false;
  console.log('Staged and verified desktop city catalog in local build area.');
} catch(error) {
  // Only remove the staging file if this invocation successfully created it.
  if(created) {try {await unlink(staging);} catch { /* nothing to clean */ }}
  throw error;
}
