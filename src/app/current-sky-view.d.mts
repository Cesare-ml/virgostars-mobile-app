export declare function needsSkyRefresh(lastCalculation: Date | null, now: Date, intervalMs?: number): boolean;
export interface PlanetLongitude {
  readonly id: string;
  readonly longitudeDeg: number;
}
export type PositionedPlanet<T extends PlanetLongitude> = T & {
  readonly x: number;
  readonly y: number;
  readonly labelX: number;
  readonly labelY: number;
};
export declare function layoutPlanetMarkers<T extends PlanetLongitude>(bodies: readonly T[]): readonly Readonly<PositionedPlanet<T>>[];

export declare function formatZodiacDegree(degreeInSign: number): string;
