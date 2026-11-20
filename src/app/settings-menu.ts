export type SettingsPage='appearance'|'language'|'houses'|'startup'|'aspects'|'points'|'de441'|'usno'|'chiron'|'licenses';
export type SettingsEntry=Readonly<{id:SettingsPage;it:string;en:string;keywords:string}>;
export const SETTINGS_ENTRIES:readonly SettingsEntry[]=[
  {id:'appearance',it:'Aspetto',en:'Appearance',keywords:'tema chiaro scuro light dark theme'},
  {id:'language',it:'Lingua',en:'Language',keywords:'italiano english language system dispositivo'},
  {id:'houses',it:'Domificazione',en:'House system',keywords:'case houses placido placidus egizia koch'},
  {id:'startup',it:'Avvio',en:'Startup',keywords:'iniziale cielo tema saved chart'},
  {id:'aspects',it:'Aspetti e orbite',en:'Aspects and orbs',keywords:'congiunzione opposizione trigono quadrato orb'},
  {id:'points',it:'Pianeti e punti',en:'Planets and points',keywords:'corpi celesti pianeti orbite planets'},
  {id:'de441',it:'Effemeridi DE441',en:'DE441 ephemeris',keywords:'motore importazione dati file jpl'},
  {id:'usno',it:'Tabelle USNO',en:'USNO tables',keywords:'delta t deltat previsioni'},
  {id:'chiron',it:'Effemeridi Chirone',en:'Chiron ephemeris',keywords:'chirone chiron spk'},
  {id:'licenses',it:'Licenze',en:'Licenses',keywords:'noto font symbols credit'},
];
const fold=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function filterSettings(query:string):readonly SettingsEntry[] {
  const terms=fold(query.trim()).split(/\s+/).filter(Boolean);
  return SETTINGS_ENTRIES.filter(entry=>{const text=fold(`${entry.it} ${entry.en} ${entry.keywords}`);return terms.every(term=>text.includes(term));});
}
