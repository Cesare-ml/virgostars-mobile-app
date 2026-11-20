/**
 * Chart display settings: which aspects are drawn and with what orbs, and which
 * points are shown and take part in aspects. Device-only preferences with no
 * personal data. The defaults are the ones Regolo Alpha Leonis starts with.
 */
export type AspectKind = 'longitude' | 'directed' | 'parallel' | 'contraparallel';

export type AspectDefinition = Readonly<{id: string; angleDeg: number | null; kind: AspectKind}>;

/** Order used in lists; ids are the keys the Charts renderer expects. */
export const ASPECT_DEFINITIONS = Object.freeze([
  {id: 'congiunzione', angleDeg: 0, kind: 'longitude'},
  {id: 'opposizione', angleDeg: 180, kind: 'longitude'},
  {id: 'trigono', angleDeg: 120, kind: 'longitude'},
  {id: 'quadrato', angleDeg: 90, kind: 'longitude'},
  {id: 'sestile', angleDeg: 60, kind: 'longitude'},
  {id: 'quinconce', angleDeg: 150, kind: 'longitude'},
  {id: 'semisestile', angleDeg: 30, kind: 'longitude'},
  {id: 'semiquadrato', angleDeg: 45, kind: 'longitude'},
  {id: 'quintile', angleDeg: 72, kind: 'longitude'},
  {id: 'biquintile', angleDeg: 144, kind: 'longitude'},
  {id: 'semiquintile', angleDeg: 36, kind: 'longitude'},
  {id: 'novile', angleDeg: 40, kind: 'longitude'},
  {id: 'settile', angleDeg: 51.42, kind: 'longitude'},
  // The two Phi aspects follow the order of the signs: second point ahead of the first.
  {id: 'phisolare', angleDeg: 222.49, kind: 'directed'},
  {id: 'philunare', angleDeg: 137.5, kind: 'directed'},
  {id: 'parallelodideclinazione', angleDeg: null, kind: 'parallel'},
  {id: 'antiparallelo', angleDeg: null, kind: 'contraparallel'},
] as const satisfies readonly AspectDefinition[]);
export type AspectId = typeof ASPECT_DEFINITIONS[number]['id'];

/** Points offered in the settings, in display order. Axes come last. */
export const POINT_IDS = Object.freeze([
  'Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'Chiron',
  'true Node', 'true Node Sud', 'mean Node', 'mean Node Sud',
  'osc. Apogee', 'osc. Perigee', 'mean Apogee', 'mean Perigee',
  'AS', 'MC', 'DS', 'IC',
] as const);
export type PointId = typeof POINT_IDS[number];
export const AXIS_IDS: readonly string[] = Object.freeze(['AS', 'MC', 'DS', 'IC']);

export type AspectSetting = {active: boolean; orb: number | null};
export type PointSetting = {shown: boolean; orb: number; aspects: boolean};
export type ChartSettings = {
  showAspects: boolean;
  aspects: Record<AspectId, AspectSetting>;
  points: Record<PointId, PointSetting>;
};

export const MAX_ORB_DEG = 15;
const DEFAULT_POINT_ORB = 6;
const ACTIVE_BY_DEFAULT: readonly string[] = ['congiunzione', 'opposizione', 'trigono', 'quadrato', 'sestile'];
/** Aspect orbs that cap the point orb by default; the others use the point orb. */
const DEFAULT_ASPECT_ORBS: Readonly<Record<string, number>> = {quintile: 3, semiquadrato: 3, quinconce: 2, phisolare: 2, philunare: 2};
const HIDDEN_BY_DEFAULT: readonly string[] = ['mean Node', 'mean Node Sud', 'mean Apogee', 'mean Perigee'];
/** Shown, but not aspected unless the user asks: the trans-Saturnians, Chiron and the mean points. */
const NO_ASPECTS_BY_DEFAULT: readonly string[] = ['Uranus', 'Neptune', 'Pluto', 'Chiron', ...HIDDEN_BY_DEFAULT];

export function defaultChartSettings(): ChartSettings {
  const aspects = {} as Record<AspectId, AspectSetting>;
  for (const {id} of ASPECT_DEFINITIONS) {
    aspects[id] = {active: ACTIVE_BY_DEFAULT.includes(id), orb: DEFAULT_ASPECT_ORBS[id] ?? null};
  }
  const points = {} as Record<PointId, PointSetting>;
  for (const id of POINT_IDS) {
    points[id] = {shown: !HIDDEN_BY_DEFAULT.includes(id), orb: DEFAULT_POINT_ORB, aspects: !NO_ASPECTS_BY_DEFAULT.includes(id)};
  }
  return {showAspects: true, aspects, points};
}

function record(x: unknown): Record<string, unknown> | null {
  return x !== null && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : null;
}

/** Orbs are kept to tenths of a degree so stored and displayed values agree. */
function orbValue(x: unknown, min: number): number | null {
  if (typeof x !== 'number' || !Number.isFinite(x) || x < min || x > MAX_ORB_DEG) return null;
  return Math.round(x * 10) / 10;
}

/**
 * Field-by-field: every valid value is kept, anything unknown, missing or out
 * of range falls back to its default. Extra keys are dropped.
 */
export function sanitizeChartSettings(raw: unknown): ChartSettings {
  const settings = defaultChartSettings();
  const source = record(raw);
  if (!source) return settings;
  if (typeof source['showAspects'] === 'boolean') settings.showAspects = source['showAspects'];
  const aspects = record(source['aspects']);
  const points = record(source['points']);
  for (const {id} of ASPECT_DEFINITIONS) {
    const item = aspects && Object.hasOwn(aspects, id) ? record(aspects[id]) : null;
    if (!item) continue;
    if (typeof item['active'] === 'boolean') settings.aspects[id].active = item['active'];
    if (item['orb'] === null) settings.aspects[id].orb = null;
    else settings.aspects[id].orb = orbValue(item['orb'], 0.1) ?? settings.aspects[id].orb;
  }
  for (const id of POINT_IDS) {
    const item = points && Object.hasOwn(points, id) ? record(points[id]) : null;
    if (!item) continue;
    if (typeof item['shown'] === 'boolean') settings.points[id].shown = item['shown'];
    if (typeof item['aspects'] === 'boolean') settings.points[id].aspects = item['aspects'];
    settings.points[id].orb = orbValue(item['orb'], 0) ?? settings.points[id].orb;
  }
  return settings;
}

export interface ChartSettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const CHART_SETTINGS_KEY = 'virgostars.mobile.chart-settings.v1';
const MAX_STORED_LENGTH = 8192;

/** Unknown versions, damaged text and inaccessible storage all yield the defaults. */
export function loadChartSettings(storage: ChartSettingsStorage | null): ChartSettings {
  try {
    const raw = storage?.getItem(CHART_SETTINGS_KEY);
    if (!raw || raw.length > MAX_STORED_LENGTH) return defaultChartSettings();
    const data = record(JSON.parse(raw));
    return data && data['version'] === 1 ? sanitizeChartSettings(data['settings']) : defaultChartSettings();
  } catch {
    return defaultChartSettings();
  }
}

/** Best effort: a failed write never stops the interface. Only sanitized values are stored. */
export function saveChartSettings(storage: ChartSettingsStorage | null, settings: ChartSettings): boolean {
  try {
    if (!storage) return false;
    storage.setItem(CHART_SETTINGS_KEY, JSON.stringify({version: 1, settings: sanitizeChartSettings(settings)}));
    return true;
  } catch {
    return false;
  }
}

/** Parses an orb typed by the user: `.` or `,`, one decimal; empty means "none". */
export function parseOrb(raw: string, min: number): number | null | undefined {
  const text = String(raw ?? '').trim().replace(',', '.');
  if (text === '') return null;
  if (!/^\d{1,2}(?:\.\d)?$/.test(text)) return undefined;
  const value = Number(text);
  return value >= min && value <= MAX_ORB_DEG ? value : undefined;
}
