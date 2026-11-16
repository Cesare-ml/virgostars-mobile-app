/**
 * Determines whether a previously calculated sky is stale.
 * A negative elapsed time means the device clock moved backwards; recalculate.
 */
export function needsSkyRefresh(lastCalculation, now, intervalMs = 60_000) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError('A valid current Date is required');
  }
  if (!(lastCalculation instanceof Date) || !Number.isFinite(lastCalculation.getTime())) {
    return true;
  }
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new RangeError('Refresh interval must be positive and finite');
  }
  const elapsed = now.getTime() - lastCalculation.getTime();
  return elapsed < 0 || elapsed >= intervalMs;
}

/**
 * Places each label in the zodiac wheel using collision-aware radial lanes.
 * Planet dots stay at their exact longitude; only labels move radially.
 */
export function layoutPlanetMarkers(bodies) {
  if (!Array.isArray(bodies)) throw new TypeError('Expected an array of bodies');
  const labels = [];
  return bodies.map((body) => {
    if (!Number.isFinite(body.longitudeDeg)) throw new TypeError('Invalid longitude');
    const angle = (body.longitudeDeg - 90) * Math.PI / 180;
    const x = 180 + Math.cos(angle) * 76;
    const y = 180 + Math.sin(angle) * 76;
    const radii = [91, 107, 83, 99, 115];
    let best = null;
    for (const radius of radii) {
      const labelX = 180 + Math.cos(angle) * radius;
      const labelY = 180 + Math.sin(angle) * radius;
      const closest = labels.length
        ? Math.min(...labels.map(label => Math.hypot(label.x - labelX, label.y - labelY)))
        : Infinity;
      if (!best || closest > best.clearance) {
        best = { labelX, labelY, clearance: closest };
      }
      if (closest >= 17) break;
    }
    labels.push({ x: best.labelX, y: best.labelY });
    return Object.freeze({ ...body, x, y, labelX: best.labelX, labelY: best.labelY });
  });
}
