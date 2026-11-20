import {invoke, isTauri} from '@tauri-apps/api/core';

const CHUNK = 64 * 1024;
export const MAX_EPHEMERIS_BYTES = 8 * 1024 * 1024 * 1024;
export type EphemerisStatus = {available: boolean; installedBytes: number | null; startJulianDayTdb: number | null; endJulianDayTdb: number | null;
  usno:{startJulianDayUt:number;endJulianDayUt:number;predictions:boolean}|null;
  chiron:{startJulianDayTdb:number;endJulianDayTdb:number}|null};
export type ImportResult = 'imported' | 'cancelled' | 'invalid_file' | 'invalid_size' | 'storage_error' | 'unavailable' | 'missing_usno_files';
export type ImportTransport = {invoke(command:string, args?:Record<string, unknown>):Promise<unknown>};
const native:ImportTransport = {invoke:(command,args)=>invoke(command,args)};

export async function ephemerisStatus():Promise<EphemerisStatus | null> {
  if (!isTauri()) return null;
  try {
    const value = await native.invoke('ephemeris_status') as Partial<EphemerisStatus> | null;
    if (!value || typeof value.available !== 'boolean' ||
      !(value.installedBytes === null || (Number.isSafeInteger(value.installedBytes) && value.installedBytes! > 0)) ||
      !(value.startJulianDayTdb === null || Number.isFinite(value.startJulianDayTdb)) ||
      !(value.endJulianDayTdb === null || Number.isFinite(value.endJulianDayTdb))) return null;
    const usno=value.usno, chiron=value.chiron;
    if (!(usno === null || (usno && Number.isFinite(usno.startJulianDayUt) && Number.isFinite(usno.endJulianDayUt) && usno.startJulianDayUt < usno.endJulianDayUt && typeof usno.predictions === 'boolean')) ||
        !(chiron === null || (chiron && Number.isFinite(chiron.startJulianDayTdb) && Number.isFinite(chiron.endJulianDayTdb) && chiron.startJulianDayTdb < chiron.endJulianDayTdb))) return null;
    return {available:value.available, installedBytes:value.installedBytes!, startJulianDayTdb:value.startJulianDayTdb!, endJulianDayTdb:value.endJulianDayTdb!, usno:usno!, chiron:chiron!};
  } catch { return null; }
}

/** Streams only the explicitly selected file, never its name or path. */
export async function importEphemeris(file:Blob, signal:AbortSignal, progress:(n:number)=>void, transport:ImportTransport = native, spec?:{kind:'usno'|'chiron';parts?:number[]}):Promise<ImportResult> {
  const max = spec?.kind === 'chiron' ? 32*1024*1024 : spec?.kind === 'usno' ? 12*1024*1024 : MAX_EPHEMERIS_BYTES;
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > max) return 'invalid_size';
  let id:number | undefined;
  try {
    if (signal.aborted) return 'cancelled';
    const received = await transport.invoke('ephemeris_import_begin', spec ? {size:file.size,...spec} : {size:file.size});
    if (!Number.isSafeInteger(received) || (received as number) < 1) return 'unavailable';
    id = received as number;
    for (let offset=0; offset<file.size;) {
      if (signal.aborted) return 'cancelled';
      const end = Math.min(offset + CHUNK, file.size);
      const bytes = new Uint8Array(await file.slice(offset,end).arrayBuffer());
      if (signal.aborted) return 'cancelled';
      if (bytes.length !== end-offset) return 'storage_error';
      await transport.invoke('ephemeris_import_chunk', {id, offset, bytes:Array.from(bytes)});
      offset = end;
      progress(offset / file.size);
    }
    if (signal.aborted) return 'cancelled';
    await transport.invoke('ephemeris_import_finish', {id});
    id = undefined;
    return 'imported';
  } catch (error) {
    if (signal.aborted) return 'cancelled';
    if (error === 'invalid_file') return 'invalid_file';
    if (error === 'invalid_size') return 'invalid_size';
    if (error === 'storage_error' || error === 'incomplete') return 'storage_error';
    return 'unavailable';
  } finally {
    if (id !== undefined) { try { await transport.invoke('ephemeris_import_cancel', {id}); } catch { /* already closed */ } }
  }
}

/** A complete USNO set is committed together; names stay in the WebView. */
export function usnoSelection(files:readonly File[]):{blob:Blob;parts:number[]}|null {
  const allowed=['deltat.data','historic_deltat.data','deltat.preds'];
  if (files.length < 2 || files.length > 3 || files.some(f=>!allowed.includes(f.name))) return null;
  const selected=allowed.map(name=>files.filter(file=>file.name===name));
  if (selected[0].length!==1 || selected[1].length!==1 || selected[2].length>1) return null;
  const parts=selected.map(group=>group[0]?.size ?? 0);
  if (parts[0]===0 || parts[1]===0 || (selected[2].length===1 && parts[2]===0) || parts.some(n=>!Number.isSafeInteger(n)||n>4*1024*1024)) return null;
  return {blob:new Blob(selected.flat()),parts};
}
