/**
 * Read-only offline city search contract shared with the Rust Tauri command.
 * Only bounded result lists cross IPC. City sources stay on local disk.
 */
export interface OfflinePlaceV1 {
  readonly id: number;
  readonly name: string;
  readonly italianName: string | null;
  readonly latMicro: number;
  readonly lngMicro: number;
  readonly population: number | null;
  readonly stateId: number | null;
  readonly region: string | null;
  readonly timeZone: string | null;
  readonly countryName: string | null;
  readonly countryCode: string | null;
}

export type PlaceQueryState =
  | Readonly<{kind: 'ready'; items: readonly OfflinePlaceV1[]}>
  | Readonly<{kind: 'query_too_short' | 'not_native' | 'busy' | 'catalog_unavailable' | 'unavailable' | 'stale'; items: readonly []}>;

export interface PlaceSearchTransport {
  isNative(): boolean;
  invoke(command: 'search_offline_places', args: {query: string; limit: number}): Promise<unknown>;
}

function object(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}
function optionalString(x: unknown): x is string | null {
  return x === null || (typeof x === 'string' && x.length <= 255);
}
function int(x: unknown): x is number {
  return typeof x === 'number' && Number.isSafeInteger(x);
}
function optionalInt(x: unknown): x is number | null {
  return x === null || int(x);
}

/** Read a single own *data* property, never a getter or inherited value. */
function dataField(source: object, field: string, error: string, optional = false): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(source, field);
  if (descriptor === undefined && optional) return null;
  if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error(error);
  return descriptor.value;
}

/**
 * Return detached, frozen values from a single bounded native IPC response.
 * JSON from Tauri is ordinary objects/arrays; sparse arrays, class instances,
 * getters and inherited fields are never valid wire data.
 */
export function decodeOfflinePlaceResults(raw: unknown): readonly OfflinePlaceV1[] {
  const protocolError = 'Invalid offline place protocol';
  const recordError = 'Invalid offline place record';
  try {
  if (!object(raw) ||
      (Object.getPrototypeOf(raw) !== Object.prototype && Object.getPrototypeOf(raw) !== null)) {
    throw new Error(protocolError);
  }
  const version = dataField(raw, 'protocolVersion', protocolError);
  const items = dataField(raw, 'items', protocolError);
  if (version !== 1 || !Array.isArray(items) || Object.getPrototypeOf(items) !== Array.prototype ||
      items.length > 30 || Reflect.ownKeys(items).length !== items.length + 1) {
    throw new Error(protocolError);
  }

  const ids = new Set<number>();
  const results: OfflinePlaceV1[] = [];
  for (let i = 0; i < items.length; i++) {
    // Array.map() skips holes, leaving an undefined slot in the "validated"
    // result. A dense own data index is required for every native record.
    const input: unknown = dataField(items, String(i), recordError);
    if (!object(input) ||
        (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)) {
      throw new Error(recordError);
    }

    // Snapshot exactly once: subsequent validation and output use local
    // primitives, not second reads from an accessor-backed IPC object.
    const id = dataField(input, 'id', recordError);
    const name = dataField(input, 'name', recordError);
    const italianName = dataField(input, 'italianName', recordError);
    const latMicro = dataField(input, 'latMicro', recordError);
    const lngMicro = dataField(input, 'lngMicro', recordError);
    const population = dataField(input, 'population', recordError);
    const stateId = dataField(input, 'stateId', recordError);
    const region = dataField(input, 'region', recordError);
    const timeZone = dataField(input, 'timeZone', recordError);
    // v1 city packs omit country lookup fields; only these two are optional.
    const countryName = dataField(input, 'countryName', recordError, true);
    const countryCode = dataField(input, 'countryCode', recordError, true);
    if (
        !int(id) || id <= 0 || ids.has(id) ||
        typeof name !== 'string' || !name.trim() || name.length > 255 ||
        !optionalString(italianName) ||
        !int(latMicro) || Math.abs(latMicro) > 90_000_000 ||
        !int(lngMicro) || Math.abs(lngMicro) > 180_000_000 ||
        !optionalInt(population) || (population !== null && population < 0) ||
        !optionalInt(stateId) || (stateId !== null && stateId < 0) ||
        !optionalString(region) || !optionalString(timeZone) ||
        !optionalString(countryName) ||
        !(countryCode === null || (typeof countryCode === 'string' && /^[A-Z]{2}$/.test(countryCode)))) {
      throw new Error(recordError);
    }
    ids.add(id);
    results.push(Object.freeze({
      id, name, italianName, latMicro, lngMicro, population, stateId, region,
      timeZone, countryName, countryCode,
    }));
  }
  return Object.freeze(results);
  } catch {
    // Never expose native details, accessor or Proxy trap messages.
    throw new Error(protocolError);
  }
}

/**
 * Latest request wins. The view can update the typed search text immediately,
 * while all stale native results/errors are ignored.
 * Caller should debounce input (e.g. 120 ms) before invoking this method.
 */
export class OfflinePlaceSearch {
  private generation = 0;
  private disposed = false;
  private readonly transport: PlaceSearchTransport;

  constructor(transport: PlaceSearchTransport) { this.transport = transport; }

  async search(query: string, limit = 12): Promise<PlaceQueryState> {
    if (this.disposed) return {kind: 'stale', items: []};
    const ticket = ++this.generation;
    if (!Number.isInteger(limit) || limit < 1 || limit > 30) {
      return {kind: 'unavailable', items: []};
    }
    if (query.trim().length < 2 || [...query].length > 80) {
      return {kind: 'query_too_short', items: []};
    }
    try {
      if (!this.transport.isNative()) return {kind: 'not_native', items: []};
      const raw = await this.transport.invoke('search_offline_places', {query, limit});
      if (ticket !== this.generation || this.disposed) return {kind: 'stale', items: []};
      return {kind: 'ready', items: decodeOfflinePlaceResults(raw)};
    } catch (error: unknown) {
      if (ticket !== this.generation || this.disposed) return {kind: 'stale', items: []};
      const code = String(error);
      if (code === 'PLACE_SEARCH_BUSY') return {kind: 'busy', items: []};
      if (code === 'PLACE_CATALOG_UNAVAILABLE') return {kind: 'catalog_unavailable', items: []};
      // Never propagate Rust file paths, SQL texts, stack traces or user data.
      return {kind: 'unavailable', items: []};
    }
  }
  clear(): void { this.generation++; }
  dispose(): void { this.disposed = true; this.clear(); }
}
