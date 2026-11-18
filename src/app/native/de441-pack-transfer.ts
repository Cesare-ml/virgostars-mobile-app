/** Bounded, resumeless transfer to an app-private, SHA-256-verified native installer. */
export type TransferCommand =
  | 'ephemeris_pack_begin'
  | 'ephemeris_pack_write'
  | 'ephemeris_pack_finish'
  | 'ephemeris_pack_cancel';

export interface PackTransport {
  invoke(command: TransferCommand, args?: Record<string, unknown>): Promise<unknown>;
}

export type ImportResult = Readonly<{id: string; status: 'verified'}>;
const CHUNK_SIZE = 128 * 1024;

function base64Chunk(data: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < data.length; offset += 8192) {
    binary += String.fromCharCode(...data.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

/** No astronomy here. The Rust host validates fixed IDs, length and digest. */
export async function importPack(
  transport: PackTransport,
  pack: Readonly<{id: string; bytes: number}>,
  file: Blob,
  onProgress: (fraction: number) => void,
): Promise<ImportResult> {
  if (file.size !== pack.bytes || !Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new Error('file_size_mismatch');
  }
  let begun = false;
  try {
    await transport.invoke('ephemeris_pack_begin', {id: pack.id});
    begun = true;
    for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
      const chunk = new Uint8Array(await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer());
      const accepted = await transport.invoke('ephemeris_pack_write', {
        id: pack.id, offset, chunkBase64: base64Chunk(chunk),
      });
      const next = offset + chunk.length;
      if (accepted !== next) throw new Error('upload_offset_mismatch');
      onProgress(next / file.size);
    }
    const result = await transport.invoke('ephemeris_pack_finish', {id: pack.id}) as ImportResult;
    if (result?.id !== pack.id || result.status !== 'verified') throw new Error('pack_not_verified');
    return result;
  } catch (error) {
    if (begun) {
      try { await transport.invoke('ephemeris_pack_cancel', {id: pack.id}); } catch { /* Preserve original error. */ }
    }
    throw error;
  }
}
