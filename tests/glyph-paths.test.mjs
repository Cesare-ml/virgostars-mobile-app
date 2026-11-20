import test from 'node:test';
import assert from 'node:assert/strict';
import {pointGlyph,zodiacGlyph} from '../src/app/astro/glyph-paths.ts';
import {POINT_IDS} from '../src/app/chart-settings.ts';

test('glyph paths use validated astrological-assets names and all zodiac signs',()=>{
  assert.equal(pointGlyph('Sun'),'assets/img/simboli-bianchi/elementi-celesti/Sun.png');
  assert.match(pointGlyph('true Node'),/true%20Node\.png$/);
  assert.equal(pointGlyph('../Sun'),'');
  for(const point of POINT_IDS) assert.ok(pointGlyph(point),`Missing glyph path for ${point}`);
  assert.equal(zodiacGlyph(0),'assets/img/simboli-bianchi/segni/01.png');
  assert.equal(zodiacGlyph(11),'assets/img/simboli-bianchi/segni/12.png');
  assert.equal(zodiacGlyph(12),'');
});
