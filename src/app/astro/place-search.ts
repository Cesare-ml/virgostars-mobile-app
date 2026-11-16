export type Place = Readonly<{id:number;name:string;ascii:string;latitude:number;longitude:number;country:string;region:string;zone:string;population:number;terms:string}>;
type RawPlace = [number,string,string,number,number,string,string,string,number,string[]];
export function decodePlaces(raw: unknown): readonly Place[] {
  if (!Array.isArray(raw) || raw.length > 100000) throw new Error('Invalid catalog');
  return raw.map((v: unknown) => {
    if (!Array.isArray(v) || v.length !== 10) throw new Error('Invalid place');
    const [id,name,ascii,latitude,longitude,country,region,zone,population,aliases] = v as RawPlace;
    if (!Number.isSafeInteger(id) || id <= 0 || typeof name !== 'string' || typeof ascii !== 'string' ||
      !Number.isFinite(latitude) || Math.abs(latitude)>90 || !Number.isFinite(longitude) || Math.abs(longitude)>180 ||
      typeof country !== 'string' || typeof region !== 'string' || typeof zone !== 'string' || !zone ||
      !Number.isSafeInteger(population) || population < 0 || !Array.isArray(aliases) || aliases.length > 150 || aliases.some(a => typeof a !== 'string' || a.length > 50)) throw new Error('Invalid place');
    return {id,name,ascii,latitude,longitude,country,region,zone,population,terms:'|' + [name,ascii,...aliases].map(fold).join('|')};
  });
}
function fold(value:string):string {return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
export function searchPlaces(places:readonly Place[], query:string, limit=8): Place[] {
  const q=fold(query.trim());
  if(q.length<2 || q.length>80 || !Number.isInteger(limit) || limit<1 || limit>20) return [];
  const prefix:Place[]=[], other:Place[]=[];
  for(const p of places) {
    if (p.terms.includes('|' + q)) { if (prefix.length < limit) prefix.push(p); }
    else if (p.terms.includes(q) && other.length < limit) other.push(p);
  }
  return prefix.concat(other).slice(0,limit);
}
let catalog:Promise<readonly Place[]> | null = null;
export function loadPlaces():Promise<readonly Place[]> {
  if (!catalog) catalog=fetch(new URL('assets/cities5000.json',document.baseURI)).then(r=>{if(!r.ok) throw new Error('Catalog unavailable'); return r.json();}).then(decodePlaces).catch(e=>{catalog=null;throw e;});
  return catalog;
}