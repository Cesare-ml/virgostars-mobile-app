import moment from 'moment-timezone';

/** Present the calculated instant in the chart's own IANA zone. */
export function chartHeaderTime(utcIso:string,zone:string):string {
  const epoch=Date.parse(utcIso);
  if(!Number.isFinite(epoch) || !moment.tz.zone(zone)) return '';
  const local=moment.tz(epoch,zone);
  return `${local.format('DD/MM/YYYY HH:mm')} · GMT${local.format('Z')}`;
}
