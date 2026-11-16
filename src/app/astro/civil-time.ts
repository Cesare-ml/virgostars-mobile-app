import moment from 'moment-timezone';

export type CivilTimeResult =
  | {kind: 'ready'; utcIso: string}
  | {kind: 'invalid' | 'unknown_zone' | 'nonexistent' | 'ambiguous'};

/** Convert a civil minute in an explicit IANA zone without guessing at DST gaps or overlaps. */
export function civilTimeToUtc(civil: string, zoneName: string, occurrence: '' | 'earlier' | 'later' = ''): CivilTimeResult {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(civil)) return {kind:'invalid'};
  const wall = moment.utc(civil, 'YYYY-MM-DDTHH:mm', true);
  if (!wall.isValid()) return {kind:'invalid'};
  const zone = moment.tz.zone(zoneName);
  if (!zone) return {kind:'unknown_zone'};
  const matches = [...new Set(zone.offsets)]
    .map(offset => wall.valueOf() + offset * 60000)
    .filter(epoch => moment.tz(epoch, zoneName).format('YYYY-MM-DDTHH:mm') === civil)
    .sort((a,b) => a-b);
  const unique = [...new Set(matches)];
  if (!unique.length) return {kind:'nonexistent'};
  if (unique.length > 1 && !occurrence) return {kind:'ambiguous'};
  const chosen = occurrence === 'later' ? unique[unique.length - 1] : unique[0];
  return {kind:'ready', utcIso: new Date(chosen).toISOString()};
}