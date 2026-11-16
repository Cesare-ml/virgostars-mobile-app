// Type surface of the sibling astrological-functions package (plain .mjs, no bundled types).
// Keep in step with ../astrological-functions/src/index.mjs.
declare module 'astrological-functions' {
  export class AstrologyError extends Error {
    code: string;
  }
  export function normalize360(degrees: number): number;
  export function signedAngularDistance(a: number, b: number): number;
  export function angularSeparation(a: number, b: number): number;
  export function zodiacSignIndex(longitude: number): number;
  export function dodecatemoriaLongitude(longitude: number): number;
  export function locateLongitudeInHouses(longitude: number, cusps: readonly number[]): Readonly<{
    house: number;
    startDeg: number;
    endDeg: number;
    distanceFromCuspDeg: number;
  }>;

  export type AspectPoint = {name: string; longitudeDeg: number; type?: string};
  export type AspectDefinition = {id: string; angleDeg: number; maxOrbDeg: number};
  export type AspectMatch = Readonly<{
    direction: 'A_TO_B' | 'B_TO_A' | 'SKY_TO_NATAL';
    source: Readonly<Required<AspectPoint>>;
    target: Readonly<Required<AspectPoint>>;
    aspectId: string;
    exactAngleDeg: number;
    actualAngleDeg: number;
    signedOrbDeg: number;
    absoluteOrbDeg: number;
    configuredMaxOrbDeg: number;
  }>;
  export function calculateCrossAspects(input: {
    direction: 'A_TO_B' | 'B_TO_A' | 'SKY_TO_NATAL';
    sourcePoints: readonly AspectPoint[];
    targetPoints: readonly AspectPoint[];
    aspectDefinitions: readonly AspectDefinition[];
  }): readonly AspectMatch[];
}
