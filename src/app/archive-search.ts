import type {SavedChartV1} from './native/chart-archive-contract';

/** Local-only search over already decrypted records; no query is persisted. */
export function filterArchive(charts:readonly SavedChartV1[], query:string):readonly SavedChartV1[] {
  const normalize=(value:string):string=>value.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase().trim();
  const needle=normalize(query).slice(0,80);
  return needle ? charts.filter(chart=>normalize(`${chart.name} ${chart.placeName}`).includes(needle)) : charts;
}
