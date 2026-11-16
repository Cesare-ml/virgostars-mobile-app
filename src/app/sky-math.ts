/** Pure tropical longitude helpers shared by the provider and numerical tests. */
export function normalizeDegrees(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Longitude must be finite.');
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function tropicalPosition(longitude: number): { longitude: number; signIndex: number; signDegree: number } {
  const normalized = normalizeDegrees(longitude);
  return {
    longitude: normalized,
    signIndex: Math.floor(normalized / 30),
    signDegree: normalized % 30
  };
}
