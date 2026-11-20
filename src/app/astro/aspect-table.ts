import {calculateCrossAspects, signedAngularDistance} from 'astrological-functions';
import {calculateDeclinationContacts} from 'astrological-functions/declination-contacts';
// Experimental shared method; this private sibling has not yet exported the subpath.
import {classifyOrientedAspectTrend} from '../../../../astrological-functions/src/aspect-trend.mjs';
import type {AspectDefinition, AspectId, ChartSettings} from '../chart-settings';
import type {TemaRenderData} from './tema-render-data';
import type {ChartProviderV1, ChartSnapshotV1} from '../native/chart-calculation-contract';

type Point = {name: string; longitudeDeg: number; declinationDeg: number | null; speed: number | null};
export type AspectTableRow = Readonly<{from: string; to: string; aspect: string; orb: number; trend: 'applying'|'separating'|null}>;
export type AspectMotionContext = Readonly<{provider:ChartProviderV1; chart:ChartSnapshotV1; utcIso:string}>;
const ORDER = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','Chiron',
  'MC','IC','AS','DS','mean Apogee','mean Perigee','osc. Apogee','osc. Perigee','mean Node','mean Node Sud','true Node','true Node Sud'];
const AXES = new Set(['AS','DS','MC','IC']);
const JPL_BODIES = new Set(['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto']);
const MODEL_POINTS = new Set(['mean Node','true Node','mean Apogee','osc. Apogee']);
const OPPOSITES = [['osc. Apogee','osc. Perigee'],['mean Apogee','mean Perigee'],['true Node','true Node Sud'],['mean Node','mean Node Sud']];

function compatible(data:TemaRenderData, context:AspectMotionContext|undefined):boolean {
  const house=context?.chart.houses[0];
  return !!context && context.provider.id === 'virgostars_ephemeris' && context.provider.engineVersion === 'core-0.1.0-6835e00' &&
      !!house && data.as===house.ascendantDeg && data.mc===house.mcDeg && data.ds===(house.ascendantDeg+180)%360 && data.ic===(house.mcDeg+180)%360 &&
      !!context.chart.houseAngleFacts && context.chart.houseAngleFacts.model === 'iau2006_2000b_utc_as_ut1' &&
      context.utcIso === data.dataora && Number.isFinite(Date.parse(context.utcIso)) &&
      Math.abs(Date.parse(context.utcIso)-(context.chart.julianDayUt-2440587.5)*86400000)<=1;
}
function speeds(data:TemaRenderData, context:AspectMotionContext|undefined):Map<string,number> {
  const out=new Map<string,number>();
  if (!compatible(data,context) || !context) return out;
  for (const body of context.chart.bodies) {
    const rendered=data.planets[body.id];
    const expectedSource=(body.ephemerisSource === 'jpl' && JPL_BODIES.has(body.id)) ||
      (body.ephemerisSource === 'jpl_small_body' && body.id === 'Chiron') ||
      (body.ephemerisSource === 'virgostars_model' && MODEL_POINTS.has(body.id));
    if (expectedSource && rendered &&
        rendered.longitude === body.longitudeDeg && rendered.longitudeSpeed === body.longitudeSpeed && Number.isFinite(body.longitudeSpeed)) out.set(body.id,body.longitudeSpeed);
  }
  // The renderer creates these exact antipodes from a known lunar point;
  // their longitude advances at the same rate as the source point.
  for (const [source,opposite] of OPPOSITES) {
    const from=data.planets[source], to=data.planets[opposite], rate=out.get(source);
    if (from && to && rate !== undefined && to.longitude === (from.longitude+180)%360 && to.longitudeSpeed === rate) out.set(opposite,rate);
  }
  return out;
}

function points(data: TemaRenderData, settings: ChartSettings, context?:AspectMotionContext): Point[] {
  const angles: Record<string, number> = {AS:data.as, DS:data.ds, MC:data.mc, IC:data.ic};
  const knownSpeeds=speeds(data,context);
  return ORDER.flatMap<Point>(name => {
    const setting = settings.points[name as keyof typeof settings.points];
    if (!setting?.aspects) return [];
    if (AXES.has(name)) return [{name, longitudeDeg:angles[name], declinationDeg:null, speed:null}];
    const body = data.planets[name];
    return setting.shown && body ? [{name, longitudeDeg:body.longitude, declinationDeg:body.equatoriale.declination, speed:knownSpeeds.get(name) ?? null}] : [];
  });
}

function motion(a:Point,b:Point,definition:AspectDefinition,allowed:number,mode:'natal'|'transit'|'synastry'):AspectTableRow['trend'] {
  if (mode === 'synastry' || definition.angleDeg === null || (definition.kind !== 'longitude' && definition.kind !== 'directed')) return null;
  if (mode === 'transit' && !AXES.has(b.name) && b.speed === null) return null;
  const sourceSpeed = AXES.has(a.name) && mode === 'natal' ? 0 : a.speed;
  const targetSpeed = mode === 'transit' || AXES.has(b.name) ? 0 : b.speed;
  if (sourceSpeed === null || targetSpeed === null) return null;
  const angle=definition.angleDeg > 180 ? 360-definition.angleDeg : definition.angleDeg;
  const branches:('FORWARD'|'REVERSE')[] = definition.kind === 'directed' ? [definition.angleDeg > 180 ? 'REVERSE' : 'FORWARD'] : angle===0 || angle===180 ? ['FORWARD'] : ['FORWARD','REVERSE'];
  try {
    const facts=branches.map(branch=>classifyOrientedAspectTrend({source:{longitudeDeg:a.longitudeDeg,longitudeSpeedDegPerDay:sourceSpeed},target:{longitudeDeg:b.longitudeDeg,longitudeSpeedDegPerDay:targetSpeed},aspectAngleDeg:angle,branch,maxOrbDeg:allowed,exactToleranceDeg:0,stationaryRelativeSpeedDegPerDay:0,motionFrame:mode==='transit'?'TARGET_FIXED':'COEVOLVING'}));
    const fact=facts.reduce((x,y)=>x.absoluteResidualDeg<=y.absoluteResidualDeg?x:y);
    return fact.trend === 'APPLYING' ? 'applying' : fact.trend === 'SEPARATING' ? 'separating' : null;
  } catch { return null; }
}

/** Geometry delegates to shared astrological-functions; pairing and orb policy match the desktop table. */
export function aspectTable(first: TemaRenderData, second: TemaRenderData | null, settings: ChartSettings,
  definitions: readonly AspectDefinition[], direction: 'A_TO_B' | 'SKY_TO_NATAL' = 'A_TO_B', context?:AspectMotionContext, targetContext?:AspectMotionContext): AspectTableRow[] {
  const from = points(first, settings, context), to = second ? points(second, settings, targetContext) : from;
  const motionReady=compatible(first,context) && (!second || (direction==='SKY_TO_NATAL' && compatible(second,targetContext)));
  const rows: AspectTableRow[] = [];
  for (const definition of definitions) {
    const setting = settings.aspects[definition.id as AspectId];
    if (!setting?.active) continue;
    for (let i = 0; i < from.length; i++) for (let j = second ? 0 : i + 1; j < to.length; j++) {
      const a = from[i], b = to[j];
      if (!second && ((AXES.has(a.name) && AXES.has(b.name)) || OPPOSITES.some(([x,y]) => (a.name === x && b.name === y) || (a.name === y && b.name === x)))) continue;
      const pointOrb = settings.points[b.name as keyof typeof settings.points].orb;
      const allowed = definition.kind === 'parallel' || definition.kind === 'contraparallel' ? 1 : Math.min(pointOrb, setting.orb ?? pointOrb);
      if (allowed <= 0) continue;
      let orb: number | null = null;
      if (definition.kind === 'longitude' && definition.angleDeg !== null) {
        const facts = calculateCrossAspects({direction, sourcePoints:[a], targetPoints:[b], aspectDefinitions:[{id:definition.id, angleDeg:definition.angleDeg, maxOrbDeg:allowed}]});
        orb = facts[0]?.absoluteOrbDeg ?? null;
      } else if (definition.kind === 'directed' && definition.angleDeg !== null) {
        orb = Math.abs(signedAngularDistance(definition.angleDeg, (b.longitudeDeg - a.longitudeDeg + 360) % 360));
      } else if (a.declinationDeg !== null && b.declinationDeg !== null) {
        const id = definition.kind === 'parallel' ? 'PARALLEL' : 'CONTRA_PARALLEL';
        const facts = calculateDeclinationContacts({direction, sourcePoints:[{name:a.name, declinationDeg:a.declinationDeg}], targetPoints:[{name:b.name, declinationDeg:b.declinationDeg}], contactDefinitions:[{id, maxOrbDeg:allowed}]});
        orb = facts.contacts[0]?.absoluteOrbDeg ?? null;
      }
      if (orb !== null && orb < allowed) rows.push({from:a.name, to:b.name, aspect:definition.id, orb,
        trend:motionReady ? motion(a,b,definition,allowed,!second?'natal':direction==='SKY_TO_NATAL'?'transit':'synastry') : null});
    }
  }
  return rows;
}
