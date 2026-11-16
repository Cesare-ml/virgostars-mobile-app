import test from 'node:test';
import assert from 'node:assert/strict';
import * as Astronomy from 'astronomy-engine';

const bodies = [
  Astronomy.Body.Sun, Astronomy.Body.Moon, Astronomy.Body.Mercury,
  Astronomy.Body.Venus, Astronomy.Body.Mars, Astronomy.Body.Jupiter,
  Astronomy.Body.Saturn, Astronomy.Body.Uranus, Astronomy.Body.Neptune,
  Astronomy.Body.Pluto
];

test('temporary astronomy provider returns finite geocentric true-ecliptic positions', () => {
  const instant = new Date('2026-11-16T12:00:00.000Z');
  const positions = bodies.map(body => {
    const vector = Astronomy.GeoVector(body, instant, true);
    const ecliptic = Astronomy.Ecliptic(vector);
    return { longitude: ecliptic.elon, latitude: ecliptic.elat };
  });
  assert.equal(positions.length, 10);
  for (const position of positions) {
    assert.ok(Number.isFinite(position.longitude));
    assert.ok(position.longitude >= 0 && position.longitude < 360);
    assert.ok(Number.isFinite(position.latitude));
    assert.ok(position.latitude >= -90 && position.latitude <= 90);
  }
});
