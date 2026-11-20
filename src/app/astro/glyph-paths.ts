const points=new Set(['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','Chiron',
  'mean Node','true Node','mean Node Sud','true Node Sud','mean Apogee','osc. Apogee','mean Perigee','osc. Perigee','AS','DS','MC','IC']);
/** Paths refer to the locally staged, manifest-verified astrological-assets pack. */
export function pointGlyph(id:string):string {
  return points.has(id) ? `assets/img/simboli-bianchi/elementi-celesti/${encodeURIComponent(id)}.png` : '';
}
export function zodiacGlyph(index:number):string {
  return Number.isInteger(index) && index>=0 && index<12
    ? `assets/img/simboli-bianchi/segni/${String(index+1).padStart(2,'0')}.png` : '';
}
