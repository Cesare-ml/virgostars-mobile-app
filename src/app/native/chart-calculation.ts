import {invoke, isTauri} from '@tauri-apps/api/core';
import {requestChart, type ChartCalculationResult, type ChartRequestV1} from './chart-calculation-contract';
import {assembleSharedHouses} from '../astro/shared-house-adapter';

/**
 * App-local adapter. The request carries one UTC instant and one position to
 * the Rust host; no remote API, file path or account data is involved.
 */
export async function calculateChart(request: ChartRequestV1): Promise<ChartCalculationResult> {
  const snapshot = {utcIso: request.utcIso, latMicro: request.latMicro, lngMicro: request.lngMicro};
  const result = await requestChart({
    isNative: isTauri,
    invoke: (command, args) => invoke<unknown>(command, args),
  }, snapshot);
  if (result.kind !== 'ready' || !result.chart.houseAngleFacts) return result;
  try { return {...result, chart:assembleSharedHouses(result.chart, result.provider, snapshot)}; }
  catch { return {kind:'calculation_failed'}; }
}
