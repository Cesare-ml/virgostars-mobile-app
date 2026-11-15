/**
 * Shared, public-only snapshot contract for future Android and iOS widgets.
 * Pure formatting/validation: no position calculations, persistence or OS API.
 * A structural check is NOT scientific verification of ephemeris accuracy.
 */
export type WidgetKind = 'moon-phase' | 'planetary-hour' | 'next-event';
export type MoonPhase =
  | 'new' | 'waxing-crescent' | 'first-quarter' | 'waxing-gibbous'
  | 'full' | 'waning-gibbous' | 'last-quarter' | 'waning-crescent';
export type PlanetaryRuler = 'sun' | 'moon' | 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn';
export type PublicEventKind = 'lunar-phase' | 'planetary-ingress' | 'station';

export interface PublicWidgetSnapshot {
  schemaVersion: 1;
  kind: WidgetKind;
  calculatedAtUtc: string;
  validUntilUtc: string;
  /** Opaque engine version; nonempty but not proof of scientific validation. */
  engineVersion: string;
  /** The upstream integration must independently validate this provenance claim. */
  calculationSource: 'virgostars-ephemeris';
  /** Non-sensitive enum values only. No names, coordinates or birth records. */
  data:
    | { moonPhase: MoonPhase }
    | { planetaryRuler: PlanetaryRuler }
    | { eventKind: PublicEventKind; eventAtUtc: string };
}

export type WidgetPresentation =
  | { state: 'unavailable'; title: 'VirgoStars'; message: 'Dati da aggiornare'; canOpenApp: true }
  | { state: 'locked'; title: 'VirgoStars'; message: 'Sblocca VirgoStars'; canOpenApp: true }
  | {
      state: 'ready'; title: 'VirgoStars'; kind: WidgetKind;
      label: string; validUntilUtc: string; canOpenApp: true;
    };

const MOON: Record<MoonPhase, string> = {
  new: 'Luna nuova', 'waxing-crescent': 'Luna crescente', 'first-quarter': 'Primo quarto',
  'waxing-gibbous': 'Gibbosa crescente', full: 'Luna piena',
  'waning-gibbous': 'Gibbosa calante', 'last-quarter': 'Ultimo quarto',
  'waning-crescent': 'Luna calante'
};
const RULER: Record<PlanetaryRuler, string> = {
  sun: 'Sole', moon: 'Luna', mercury: 'Mercurio', venus: 'Venere',
  mars: 'Marte', jupiter: 'Giove', saturn: 'Saturno'
};
const EVENT: Record<PublicEventKind, string> = {
  'lunar-phase': 'Fase lunare', 'planetary-ingress': 'Ingresso planetario',
  station: 'Stazione planetaria'
};

function utcMillis(value: unknown): number | null {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || new Date(millis).toISOString().slice(0, 19) !== value.slice(0, 19)) {
    return null;
  }
  return millis;
}

function onlyKeys(obj: unknown, allowed: readonly string[]): obj is Record<string, unknown> {
  return !!obj && typeof obj === 'object' && !Array.isArray(obj) &&
    Object.keys(obj).every((key) => allowed.includes(key));
}

/**
 * Fail-closed rendering gate. Secret-bearing payloads are rejected even when
 * the UI is unlocked; locked vaults never disclose their snapshot values.
 * This does not validate numerical ephemeris accuracy or authenticate source.
 */
export function presentWidgetSnapshot(
  snapshot: unknown, options: { vaultUnlocked: boolean; now?: Date }
): WidgetPresentation {
  const unavailable = (): WidgetPresentation => ({
    state: 'unavailable', title: 'VirgoStars', message: 'Dati da aggiornare', canOpenApp: true
  });
  if (!options || options.vaultUnlocked !== true) {
    return { state: 'locked', title: 'VirgoStars', message: 'Sblocca VirgoStars', canOpenApp: true };
  }
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) return unavailable();
  if (!onlyKeys(snapshot, ['schemaVersion', 'kind', 'calculatedAtUtc', 'validUntilUtc',
    'engineVersion', 'calculationSource', 'data'])) return unavailable();
  if (snapshot.schemaVersion !== 1 || snapshot.calculationSource !== 'virgostars-ephemeris' ||
      typeof snapshot.engineVersion !== 'string' || !snapshot.engineVersion.trim() ||
      snapshot.engineVersion.length > 80) return unavailable();
  const calculated = utcMillis(snapshot.calculatedAtUtc);
  const until = utcMillis(snapshot.validUntilUtc);
  if (calculated === null || until === null || until <= calculated ||
      calculated > now.getTime() + 30_000 || until <= now.getTime() ||
      until - calculated > 24 * 60 * 60 * 1000) return unavailable();
  let label: string | undefined;
  const data = snapshot.data;
  switch (snapshot.kind) {
    case 'moon-phase':
      if (onlyKeys(data, ['moonPhase']) &&
          Object.hasOwn(data, 'moonPhase') && typeof data.moonPhase === 'string') {
        label = MOON[data.moonPhase as MoonPhase];
      }
      break;
    case 'planetary-hour':
      if (onlyKeys(data, ['planetaryRuler']) &&
          Object.hasOwn(data, 'planetaryRuler') && typeof data.planetaryRuler === 'string') {
        const ruler = RULER[data.planetaryRuler as PlanetaryRuler];
        if (ruler) label = 'Ora di ' + ruler;
      }
      break;
    case 'next-event':
      if (onlyKeys(data, ['eventKind', 'eventAtUtc']) && Object.keys(data).length === 2 &&
          typeof data.eventKind === 'string' && utcMillis(data.eventAtUtc) !== null) {
        label = EVENT[data.eventKind as PublicEventKind];
        // A next-event widget must not display an event already in the past.
        if (utcMillis(data.eventAtUtc)! <= now.getTime()) label = undefined;
      }
      break;
    default: return unavailable();
  }
  if (!label) return unavailable();
  return {
    state: 'ready', title: 'VirgoStars', kind: snapshot.kind as WidgetKind,
    label, validUntilUtc: snapshot.validUntilUtc as string, canOpenApp: true
  };
}
