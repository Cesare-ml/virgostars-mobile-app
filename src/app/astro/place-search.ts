export type Place = Readonly<{id:number;name:string;latitude:number;longitude:number;country:string;countryName:string;region:string;zone:string;population:number}>;
const displayNames = new Map<string, Intl.DisplayNames>();
export function countryLabel(code:string, locale:'it'|'en'):string {
  if (!/^[A-Z]{2}$/.test(code)) return code;
  try {
    let display=displayNames.get(locale);
    if (!display) {display=new Intl.DisplayNames([locale],{type:'region',fallback:'code'});displayNames.set(locale,display);}
    return display.of(code) ?? code;
  } catch {return code;}
}
export function placeLabel(place:Place):string {return [place.name,place.country || place.countryName].filter(Boolean).join(', ');}

/** Resolve localized country names to ISO codes without an external catalog. */
export function normalizePlaceQuery(query:string):string {
  const parts=query.split(',');
  if (parts.length<2 || parts.length>3) return query;
  const index=parts.length-1, input=parts[index].trim().toLocaleLowerCase();
  if (!input || /^[a-z]{2}$/i.test(input)) return query;
  for (let a=65;a<=90;a++) for (let b=65;b<=90;b++) {
    const code=String.fromCharCode(a,b);
    if (['it','en'].some(locale=>countryLabel(code,locale as 'it'|'en').toLocaleLowerCase()===input)) {
      parts[index]=' '+code; return parts.join(',');
    }
  }
  return query;
}
