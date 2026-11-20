/** Presentation labels for renderer/provider IDs; identifiers stay unchanged in calculations. */
const LABELS: Readonly<Record<string, readonly [string, string]>> = {
  Sun:['Sole','Sun'], Moon:['Luna','Moon'], Mercury:['Mercurio','Mercury'], Venus:['Venere','Venus'],
  Mars:['Marte','Mars'], Jupiter:['Giove','Jupiter'], Saturn:['Saturno','Saturn'], Uranus:['Urano','Uranus'],
  Neptune:['Nettuno','Neptune'], Pluto:['Plutone','Pluto'], Chiron:['Chirone','Chiron'],
  'mean Node':['Nodo Nord medio','Mean North Node'], 'true Node':['Nodo Nord vero','True North Node'],
  'mean Node Sud':['Nodo Sud medio','Mean South Node'], 'true Node Sud':['Nodo Sud vero','True South Node'],
  'mean Apogee':['Luna Nera media','Mean Black Moon'], 'osc. Apogee':['Luna Nera osculatrice','Osculating Black Moon'],
  'mean Perigee':['Perigeo medio','Mean perigee'], 'osc. Perigee':['Perigeo osculatore','Osculating perigee'],
  AS:['Ascendente','Ascendant'], DS:['Discendente','Descendant'], MC:['Medio Cielo','Midheaven'], IC:['Fondo Cielo','Imum Coeli'],
};
export function pointLabel(id: string, locale: 'it' | 'en'): string {
  return LABELS[id]?.[locale === 'it' ? 0 : 1] ?? id;
}
