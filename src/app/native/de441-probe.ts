import {invoke, isTauri} from '@tauri-apps/api/core';
import {
  decodeDe441ProbeResponse,
  type De441ProbeRequest,
  type De441ProbeResponse,
} from './de441-probe-contract';

/** Developer-only native diagnostic; never feed this into the natal renderer. */
export async function probeDe441Geometric(request: De441ProbeRequest): Promise<De441ProbeResponse> {
  if (!isTauri()) return {
    protocolVersion: 1,
    status: 'provider_unavailable',
    selectedPackId: null,
    result: null,
  };
  return decodeDe441ProbeResponse(await invoke<unknown>('de441_probe', {request}));
}
