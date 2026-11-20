import {chromium} from '../../astrological-charts/node_modules/playwright-core/index.mjs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

// Synthetic IPC and visibly fictional settings only; no device key or personal record.
const root=path.resolve('dist/virgostars-mobile/browser');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
async function setup(page,legacyVersion=1) {
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());if(url.hostname!=='localhost')return route.abort();
    const file=path.resolve(root,url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1)));
    if(!file.startsWith(root+path.sep))return route.abort();
    try {await route.fulfill({status:200,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json'})[path.extname(file)]??'application/octet-stream',body:await readFile(file)});}catch{await route.fulfill({status:404,body:''});}
  });
  await page.addInitScript(version=>{
    if(!localStorage.getItem('fixture-seeded')) {
      localStorage.setItem('fixture-seeded','yes');
      localStorage.setItem('virgostars.mobile.ui-preferences.v1',JSON.stringify({version,theme:'light',locale:'en'}));
      localStorage.setItem('virgostars.mobile.chart-settings.v1',JSON.stringify({version,settings:{showAspects:false,aspects:{quinconce:{active:true,orb:1.5}},points:{Uranus:{shown:false,orb:4,aspects:true}}}}));
    }
    globalThis.isTauri=true;
    globalThis.__TAURI_INTERNALS__={invoke:async(command,args)=>{
      if(command==='runtime_info')return {schema_version:1,platform:'synthetic',mode:'prototype'};
      if(command==='startup_preference')return {protocolVersion:1,status:'ok',preference:{mode:'sky',chartId:null}};
      if(command==='device_preferences') {
        const {section,operation}=args.request,key='fixture-native-'+section;
        if(operation==='set') {
          if(globalThis.delayNextUi && section==='ui'){globalThis.delayNextUi=false;await new Promise(resolve=>globalThis.releaseDelayedUi=resolve);}
          if(globalThis.failNextUi && section==='ui'){globalThis.failNextUi=false;return {protocolVersion:1,status:'unavailable',ui:null,chart:null};}
          localStorage.setItem(key,JSON.stringify(args.request[section]));
          if(section==='ui')globalThis.fixtureUiWrites=(globalThis.fixtureUiWrites||0)+1;
        }
        const value=JSON.parse(localStorage.getItem(key)||'null');
        return {protocolVersion:1,status:'ok',ui:section==='ui'?value:null,chart:section==='chart'?value:null};
      }
      if(command==='calculate_chart') {
        const ids=['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];
        const house=id=>({id,cuspsDeg:Array.from({length:12},(_,i)=>(100+i*30)%360),ascendantDeg:100,mcDeg:10,armcDeg:10,vertexDeg:200});
        return {protocolVersion:1,status:'ok',provider:{id:'fixture',engineVersion:'test'},chart:{julianDayUt:2451545,
          bodies:ids.map((id,i)=>({id,longitudeDeg:i*31%360,latitudeDeg:i+0.1,distanceAu:1,longitudeSpeed:1,latitudeSpeed:0,distanceSpeed:0,rightAscensionDeg:i*31%360,declinationDeg:i,ephemerisSource:'moshier'})),
          houses:[house('egizia'),house('koch')],unavailableBodies:[],unavailableHouseSystems:[]}};
      }
      if(command==='chart_archive')return {protocolVersion:1,status:'ok',charts:[],legacyPresent:false};
      throw Error('unsupported fixture command');
    }};
  },legacyVersion);
}
try {
  const page=await browser.newPage({viewport:{width:390,height:844}});await setup(page);
  await page.goto('http://localhost/',{waitUntil:'domcontentloaded'});
  await page.locator('vs-chart-wheel').waitFor({timeout:45000});
  assert.equal(await page.locator('html').getAttribute('lang'),'en');assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  const migrated=await page.evaluate(()=>({ui:JSON.parse(localStorage.getItem('fixture-native-ui')),chart:JSON.parse(localStorage.getItem('fixture-native-chart'))}));
  assert.deepEqual(migrated.ui,{theme:'light',locale:'en',houseSystem:null});
  assert.equal(migrated.chart.showAspects,false);assert.deepEqual(migrated.chart.aspects.quinconce,{active:true,orb:1.5});
  assert.deepEqual(migrated.chart.points.Uranus,{shown:false,orb:4,aspects:true});
  assert.equal(await page.getByLabel('House system').count(),0);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'House system'}).click();
  await page.getByLabel('Koch').check();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('fixture-native-ui')).houseSystem==='koch');
  await page.getByRole('button',{name:'‹ Settings'}).click();
  await page.getByRole('button',{name:'Aspects and orbs'}).click();
  await page.getByLabel('Show aspect lines').check();
  await page.getByRole('button',{name:'Quincunx',exact:false}).click();
  await page.getByLabel('Orb Quincunx').fill('2.5');await page.getByLabel('Orb Quincunx').dispatchEvent('change');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('fixture-native-chart')).aspects.quinconce.orb===2.5);
  await page.getByRole('button',{name:'‹ Settings'}).click();
  await page.getByRole('button',{name:'Language',exact:true}).click();
  const beforeWrites=await page.evaluate(()=>globalThis.fixtureUiWrites);
  await page.evaluate(()=>{globalThis.delayNextUi=true;});
  await page.getByLabel('Italiano').check();await page.waitForFunction(()=>typeof globalThis.releaseDelayedUi==='function');
  await page.getByLabel('English').check();await page.evaluate(()=>globalThis.releaseDelayedUi());
  await page.waitForFunction(before=>globalThis.fixtureUiWrites>=before+2 && JSON.parse(localStorage.getItem('fixture-native-ui')).locale==='en',beforeWrites);
  await page.reload();await page.locator('vs-chart-wheel').waitFor({timeout:45000});
  assert.equal(await page.locator('html').getAttribute('lang'),'en');assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'House system'}).click();
  assert.ok(await page.getByLabel('Koch').isChecked());
  await page.getByRole('button',{name:'‹ Settings'}).click();await page.getByRole('button',{name:'Aspects and orbs'}).click();
  assert.ok(await page.getByLabel('Show aspect lines').isChecked());await page.getByRole('button',{name:'Quincunx',exact:false}).click();assert.equal(await page.getByLabel('Orb Quincunx').inputValue(),'2.5');
  await page.getByRole('button',{name:'‹ Settings'}).click();await page.getByRole('button',{name:'Language',exact:true}).click();
  await page.evaluate(()=>{globalThis.failNextUi=true;});await page.getByLabel('Italiano').check();
  await page.getByText('Some settings could not be saved',{exact:false}).or(page.getByText('Impossibile conservare alcune impostazioni',{exact:false})).waitFor();
  await page.getByRole('button',{name:/Riprova salvataggio|Retry saving/}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('fixture-native-ui')).locale==='it');
  await page.close();
  const bad=await browser.newPage({viewport:{width:390,height:844}});await setup(bad,2);
  await bad.goto('http://localhost/',{waitUntil:'domcontentloaded'});
  await bad.getByRole('alert').filter({hasText:/Some settings could not be saved|Impossibile conservare alcune impostazioni/}).waitFor();
  assert.equal(await bad.evaluate(()=>localStorage.getItem('fixture-native-ui')),null);
  assert.equal(await bad.evaluate(()=>localStorage.getItem('fixture-native-chart')),null);
  assert.equal(JSON.parse(await bad.evaluate(()=>localStorage.getItem('virgostars.mobile.ui-preferences.v1'))).version,2);
  console.log('Synthetic preferences smoke passed: legacy migration, house and orb round trips, ordered writes, failure/retry and preservation of unknown versions.');
} finally {await browser.close();}
