import {invoke, isTauri} from '@tauri-apps/api/core';
import {requestArchive, type ArchiveOperation, type ArchiveResult} from './chart-archive-contract';

/** The key and storage path remain in the native Android host. */
export function archiveOperation(operation:ArchiveOperation):Promise<ArchiveResult> {
  return requestArchive({isNative:isTauri,invoke:(command,args)=>invoke<unknown>(command,args)},operation);
}
