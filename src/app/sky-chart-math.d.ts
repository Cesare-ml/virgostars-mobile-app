export interface AscendantResult {
  longitudeDegrees: number;
  eastProjection: number;
}

export function normalizeDegrees(value: number): number;

export function calculateAscendant(
  rotation: number[][],
  latitudeDegrees: number,
  siderealDegrees: number
): AscendantResult;

export function formatDegreeMinute(value: number): string;

export function planetGlyphRadius(longitude: number, prior: ReadonlyArray<{ longitude: number; radius: number }>): number;
