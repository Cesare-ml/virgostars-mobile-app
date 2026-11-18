import {invoke, isTauri} from '@tauri-apps/api/core';
import {importPack} from './de441-pack-transfer';

/** Data-file custody only. Planetary calculations remain in VirgoStars-Ephemeris. */
export type PackStatus = 'missing' | 'installed_unverified' | 'invalid_size';
export type VerifyStatus = 'verified' | 'invalid_hash' | 'invalid_size' | 'missing';
export type PackInventory = Readonly<{
  id: string;
  firstYear: number;
  lastYear: number;
  required: boolean;
  filename: string;
  bytes: number;
  status: PackStatus;
}>;
export type Verification = Readonly<{id: string; status: VerifyStatus}>;

export type PackCommand =
  | 'ephemeris_pack_inventory'
  | 'ephemeris_pack_begin'
  | 'ephemeris_pack_write'
  | 'ephemeris_pack_finish'
  | 'ephemeris_pack_cancel'
  | 'ephemeris_pack_verify'
  | 'ephemeris_pack_remove';

const nativeTransport: {invoke(command: PackCommand, args?: Record<string, unknown>): Promise<unknown>} = {
  invoke: (command, args) => invoke(command, args),
};

export function packServiceAvailable(): boolean { return isTauri(); }

export async function readNativePacks(): Promise<readonly PackInventory[]> {
  if (!packServiceAvailable()) return [];
  const inventory = await nativeTransport.invoke('ephemeris_pack_inventory');
  if (!Array.isArray(inventory) || inventory.length !== 10) throw new Error('Invalid DE441 pack inventory');
  const statuses = new Set<PackStatus>(['missing', 'installed_unverified', 'invalid_size']);
  const ids = new Set<string>();
  return inventory.map(raw => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid DE441 pack item');
    const pack = raw as Record<string, unknown>;
    if (typeof pack.id !== 'string' || ids.has(pack.id) ||
      typeof pack.filename !== 'string' || !/^de441-[a-z0-9-]+\.eph$/.test(pack.filename) ||
      typeof pack.firstYear !== 'number' || typeof pack.lastYear !== 'number' ||
      typeof pack.bytes !== 'number' || pack.bytes <= 0 || !Number.isSafeInteger(pack.bytes) ||
      typeof pack.required !== 'boolean' || !statuses.has(pack.status as PackStatus)) {
      throw new Error('Invalid DE441 pack item');
    }
    ids.add(pack.id);
    return Object.freeze(pack as unknown as PackInventory);
  });
}

export async function verifyPack(id: string): Promise<Verification> {
  const result = await nativeTransport.invoke('ephemeris_pack_verify', {id}) as Verification;
  if (result?.id !== id || !['verified','invalid_hash','invalid_size','missing'].includes(result?.status)) {
    throw new Error('Invalid DE441 verification result');
  }
  return result;
}

export async function removePack(id: string): Promise<void> {
  await nativeTransport.invoke('ephemeris_pack_remove', {id});
}

export function importLocalPack(
  pack: Pick<PackInventory, 'id' | 'bytes'>,
  file: Blob,
  onProgress: (fraction: number) => void,
): Promise<Verification> {
  if (!packServiceAvailable()) return Promise.reject(new Error('native_only'));
  return importPack(nativeTransport, pack, file, onProgress);
}
