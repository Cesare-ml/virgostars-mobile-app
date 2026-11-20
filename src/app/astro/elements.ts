import {zodiacSignIndex} from 'astrological-functions';
import type {ChartSnapshotV1} from '../native/chart-calculation-contract';
export type ElementId='fire'|'earth'|'air'|'water';
export type ElementGroup=Readonly<{id:ElementId;points:readonly string[]}>;
const PLANETS=new Set(['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto']);
const ELEMENTS:readonly ElementId[]=['fire','earth','air','water'];
/** Count each available major planet once by the element of its zodiac sign. */
export function chartElements(chart:Pick<ChartSnapshotV1,'bodies'>):readonly ElementGroup[] {
  const groups=ELEMENTS.map(id=>({id,points:[] as string[]}));
  for(const body of chart.bodies) {
    if(!PLANETS.has(body.id) || !Number.isFinite(body.longitudeDeg)) continue;
    groups[zodiacSignIndex(body.longitudeDeg)%4].points.push(body.id);
  }
  return groups;
}
