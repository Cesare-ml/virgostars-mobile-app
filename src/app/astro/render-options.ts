import type {AspectId, ChartSettings, PointId} from '../chart-settings';

/** Configure only points actually calculated and preserve the renderer's remaining options. */
export function applyChartSettings(options: {
  mostraAspetti: boolean;
  settaggi: {aspetti_attivi: unknown; aspetti_orbite: unknown; elementi_celesti: unknown};
}, planets: Record<string, unknown>, settings: ChartSettings, catalog: {
  aspects: readonly {id: AspectId}[]; axes: readonly string[]; points: readonly PointId[];
}): void {
  options.mostraAspetti = settings.showAspects;
  const active = options.settaggi.aspetti_attivi as Record<string, boolean>;
  const orbs = options.settaggi.aspetti_orbite as Record<string, number | null>;
  for (const {id} of catalog.aspects) {
    active[id] = settings.aspects[id].active;
    orbs[id] = settings.aspects[id].orb;
  }
  const points = options.settaggi.elementi_celesti as Record<string, {att:boolean; orb:number; aspVerso:boolean}>;
  for (const point of Object.values(points)) { point.att = false; point.aspVerso = false; }
  for (const id of catalog.points) {
    const point = points[id];
    if (!point) continue;
    const present = catalog.axes.includes(id) || Object.hasOwn(planets, id);
    point.att = present && settings.points[id].shown;
    point.aspVerso = present && settings.points[id].aspects;
    point.orb = settings.points[id].orb;
  }
}
