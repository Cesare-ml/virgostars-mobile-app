import {invoke, isTauri} from '@tauri-apps/api/core';
import {requestChart, type ChartCalculationResult, type ChartRequestV1} from './chart-calculation-contract';

/**
 * App-local adapter. The request carries one UTC instant and one position to
 * the Rust host; no remote API, file path or account data is involved.
 */
export function calculateChart(request: ChartRequestV1): Promise<ChartCalculationResult> {
  return requestChart({
    isNative: isTauri,
    invoke: (command, args) => invoke<unknown>(command, args),
  }, request);
}
