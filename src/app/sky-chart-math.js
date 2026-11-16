export function normalizeDegrees(value) {
  if (!Number.isFinite(value)) {
    throw new RangeError('Angle must be finite');
  }
  return ((value % 360) + 360) % 360;
}

/**
 * Finds the ecliptic/horizon crossing on the eastern half of the local horizon.
 * rotation is Astronomy Engine's EQD -> ECT matrix for the observation date.
 */
export function calculateAscendant(rotation, latitudeDegrees, siderealDegrees) {
  if (
    !Array.isArray(rotation) ||
    rotation.length !== 3 ||
    rotation.some(row =>
      !Array.isArray(row) ||
      row.length !== 3 ||
      row.some(value => !Number.isFinite(value))
    )
  ) {
    throw new RangeError('Expected a finite 3x3 EQD-to-ECT rotation matrix');
  }

  if (
    !Number.isFinite(latitudeDegrees) ||
    latitudeDegrees < -90 ||
    latitudeDegrees > 90 ||
    !Number.isFinite(siderealDegrees)
  ) {
    throw new RangeError('Invalid observer coordinates or sidereal angle');
  }

  const siderealAngle = normalizeDegrees(siderealDegrees) * Math.PI / 180;
  const latitude = latitudeDegrees * Math.PI / 180;
  const zenithEquatorial = [
    Math.cos(latitude) * Math.cos(siderealAngle),
    Math.cos(latitude) * Math.sin(siderealAngle),
    Math.sin(latitude)
  ];

  const zenithEcliptic = rotation.map(row =>
    row[0] * zenithEquatorial[0] +
    row[1] * zenithEquatorial[1] +
    row[2] * zenithEquatorial[2]
  );

  // The horizon/ecliptic intersection has two antipodal solutions.
  let ascendantRadians = Math.atan2(
    zenithEcliptic[0],
    -zenithEcliptic[1]
  );

  const eastProjectionAt = radians => {
    const eclipticX = Math.cos(radians);
    const eclipticY = Math.sin(radians);
    // Rotation matrices are orthogonal: transpose maps ECT back to EQD.
    const candidateEquatorial = [
      rotation[0][0] * eclipticX + rotation[1][0] * eclipticY,
      rotation[0][1] * eclipticX + rotation[1][1] * eclipticY,
      rotation[0][2] * eclipticX + rotation[1][2] * eclipticY
    ];
    return (
      -Math.sin(siderealAngle) * candidateEquatorial[0] +
      Math.cos(siderealAngle) * candidateEquatorial[1]
    );
  };

  if (eastProjectionAt(ascendantRadians) < 0) {
    ascendantRadians += Math.PI;
  }

  return {
    longitudeDegrees: normalizeDegrees(ascendantRadians * 180 / Math.PI),
    eastProjection: eastProjectionAt(ascendantRadians)
  };
}

export function formatDegreeMinute(value) {
  if (!Number.isFinite(value) || value < 0 || value >= 30) {
    throw new RangeError('Zodiac degree must be in [0, 30)');
  }

  const degrees = Math.floor(value);
  const minutes = Math.min(
    59.9,
    Math.round((value - degrees) * 600) / 10
  );
  return degrees + '° ' + minutes.toFixed(1) + '′';
}

/** Spread neighboring planet glyphs across concentric lanes without changing longitude. */
export function planetGlyphRadius(longitude, prior) {
  const lanes = [91, 105, 77, 116];
  const separation = 15;
  for (const radius of lanes) {
    const clear = prior.every(point => {
      const a = longitude * Math.PI / 180;
      const b = point.longitude * Math.PI / 180;
      const distance = Math.sqrt(radius * radius + point.radius * point.radius - 2 * radius * point.radius * Math.cos(a - b));
      return distance >= separation;
    });
    if (clear) return radius;
  }
  return lanes[prior.length % lanes.length];
}


