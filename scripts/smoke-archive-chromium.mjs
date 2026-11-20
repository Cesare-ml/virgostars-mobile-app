import {chromium} from '../../astrological-charts/node_modules/playwright-core/index.mjs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

// Local synthetic integration check. No real records or platform keys are used.
const root=path.resolve('dist/virgostars-mobile/browser');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:390,height:844},locale:'it-IT'});
await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='localhost') return route.abort();
  const file=path.resolve(root,url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1)));
  if(!file.startsWith(root+path.sep)) return route.abort();
  try {await route.fulfill({status:200,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json'})[path.extname(file)]??'application/octet-stream',body:await readFile(file)});}
  catch {await route.fulfill({status:404,body:''});}
});
await page.addInitScript(()=>{
  globalThis.isTauri=true;
  globalThis.__TAURI_INTERNALS__={invoke:async(command,args)=>{
    if(command==='runtime_info') return {schema_version:1,platform:'synthetic',mode:'prototype'};
    if(command==='device_preferences') {
      const {section,operation}=args.request,key='fixture-device-'+section;
      if(operation==='set') localStorage.setItem(key,JSON.stringify(args.request[section]));
      const value=JSON.parse(localStorage.getItem(key)||'null');
      return {protocolVersion:1,status:'ok',ui:section==='ui'?value:null,chart:section==='chart'?value:null};
    }
    if(command==='startup_preference') {
      if(args.request.operation==='get' && sessionStorage.getItem('fixture-defer-preference')==='yes') {
        sessionStorage.removeItem('fixture-defer-preference');
        await new Promise(resolve=>{globalThis.releaseFixturePreference=resolve;});
      }
      if(args.request.operation==='set') localStorage.setItem('fixture-startup',JSON.stringify(args.request.preference));
      return {protocolVersion:1,status:'ok',preference:JSON.parse(localStorage.getItem('fixture-startup')||'{"mode":"sky","chartId":null}')};
    }
    if(command==='chart_archive') {
      const request=args.request, charts=JSON.parse(localStorage.getItem('fixture-charts')||'[]');
      if(request.operation==='save') {
        if(globalThis.failNextArchive){globalThis.failNextArchive=false;return {protocolVersion:1,status:'archive_full'};}
        const index=charts.findIndex(x=>x.id===request.chart.id), previous=index<0?null:charts[index];
        const chart={...request.chart,createdAtMs:previous?.createdAtMs??1000,updatedAtMs:2000};
        if(index<0) charts.push(chart);else charts[index]=chart;
        localStorage.setItem('fixture-charts',JSON.stringify(charts));
      }
      if(request.operation==='delete') {const index=charts.findIndex(x=>x.id===request.id);if(index>=0)charts.splice(index,1);localStorage.setItem('fixture-charts',JSON.stringify(charts));}
      return {protocolVersion:1,status:'ok',charts,legacyPresent:false};
    }
    if(command==='calculate_chart') {
      globalThis.calculationCount=(globalThis.calculationCount||0)+1;
      if(sessionStorage.getItem('fixture-defer-startup')==='yes') {
        sessionStorage.removeItem('fixture-defer-startup');
        await new Promise(resolve=>{globalThis.releaseFixtureStartup=resolve;});
      }
      if(globalThis.failNextCalculation) {globalThis.failNextCalculation=false;return {protocolVersion:1,status:'calculation_failed'};}
      const ids=['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];
      return {protocolVersion:1,status:'ok',provider:{id:'fixture',engineVersion:'test'},chart:{julianDayUt:2451545,
        bodies:ids.map((id,i)=>({id,longitudeDeg:i*31%360,latitudeDeg:i+0.1,distanceAu:1,longitudeSpeed:1,latitudeSpeed:0,distanceSpeed:0,rightAscensionDeg:i*31%360,declinationDeg:i,ephemerisSource:'moshier'})),
        houses:[{id:'egizia',cuspsDeg:Array.from({length:12},(_,i)=>(100+i*30)%360),ascendantDeg:100,mcDeg:10,armcDeg:10,vertexDeg:200}],unavailableBodies:[],unavailableHouseSystems:[]}};
    }
    throw Error('unsupported fixture command');
  }};
});
try {
  await page.goto('http://localhost/',{waitUntil:'domcontentloaded'});
  await page.locator('vs-chart-wheel').waitFor({timeout:45000});
  await page.getByRole('button',{name:'Archivio',exact:true}).click();
  await page.getByRole('button',{name:'Nuovo tema'}).click();
  const menu=page.getByRole('navigation',{name:'Sezioni della carta'});
  await page.getByLabel('Nome del tema',{exact:true}).fill('Alfa fittizia');
  await page.getByLabel('Data e ora locali').fill('2000-01-01T12:00');
  await page.getByLabel('Fuso orario IANA (es. Europe/Rome)').fill('UTC');
  await page.getByLabel('Latitudine (nord positiva)').fill('41');
  await page.getByLabel('Longitudine (est positiva)').fill('12');
  const calculationsBeforeSave=await page.evaluate(()=>globalThis.calculationCount);
  await page.evaluate(()=>{globalThis.failNextArchive=true;});
  await page.getByRole('button',{name:'Salva',exact:true}).click();
  await page.getByText('Archivio pieno.').waitFor();
  assert.equal(await page.evaluate(()=>globalThis.calculationCount),calculationsBeforeSave,'do not calculate an unsaved new chart');
  await page.evaluate(()=>{globalThis.failNextCalculation=true;});
  await page.getByRole('button',{name:'Salva',exact:true}).click();
  await page.getByText('Impossibile calcolare il tema',{exact:false}).waitFor();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('fixture-charts')).length),1);
  await page.getByRole('button',{name:'Salva',exact:true}).click();
  await page.locator('vs-chart-wheel').waitFor();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('fixture-charts')).length),1,'retry must update the earlier saved inputs');
  const forward=page.getByRole('button',{name:'Avanti nel tempo',exact:true});
  await forward.scrollIntoViewIfNeeded();
  await page.evaluate(()=>window.scrollBy(0,150));
  const box=await forward.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.waitForFunction(()=>document.querySelector('.sky-current-time')?.textContent.includes('01/01/2000 12:08'),null,{timeout:5000});
  await page.mouse.up();
  const stopped=await page.locator('.sky-current-time').innerText();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.sky-current-time').innerText(),stopped,'hold must stop on release');
  await page.getByRole('button',{name:'Ripristina',exact:true}).click();
  await page.getByLabel('Passo').fill('1');await page.getByLabel('Unità di tempo').selectOption('month');
  await forward.click();
  await page.waitForFunction(()=>document.querySelector('.sky-current-time')?.textContent.includes('01/02/2000 12:00'));
  await page.getByRole('button',{name:'Ripristina',exact:true}).click();
  await page.getByLabel('Passo').fill('4');await page.getByLabel('Unità di tempo').selectOption('minute');
  await forward.click();
  await page.waitForFunction(()=>document.querySelector('.sky-current-time')?.textContent.includes('01/01/2000 12:04'));
  await menu.getByRole('button',{name:'Strumenti'}).click();
  await page.getByRole('button',{name:'Aggiorna tema salvato'}).click();
  await page.getByRole('button',{name:'Conferma aggiornamento'}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('fixture-charts'))[0].utcIso==='2000-01-01T12:04:00.000Z');
  await menu.getByRole('button',{name:'Grafico'}).click();
  assert.ok(await page.getByRole('button',{name:'Ripristina',exact:true}).isDisabled());
  await menu.getByRole('button',{name:'Strumenti'}).click();
  await page.getByRole('button',{name:'Erigi elettiva'}).click();
  await page.getByLabel('Nome elettiva').fill('Elettiva fittizia');
  await page.getByRole('button',{name:'Salva nuova elettiva'}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('fixture-charts')).length===2);
  await page.getByRole('button',{name:'Archivio',exact:true}).click();
  await page.getByLabel('Cerca nell’archivio').fill('elettiva');
  assert.equal(await page.locator('[aria-labelledby=saved-charts-title] .session-row').count(),1);
  await page.getByLabel('Cerca nell’archivio').fill('');
  await page.getByRole('button',{name:'Opzioni',exact:true}).click();
  await page.getByRole('button',{name:'Avvio',exact:true}).click();
  await page.getByText('Un tema salvato',{exact:true}).click();
  await page.getByLabel('Tema iniziale').selectOption({label:'Alfa fittizia'});
  await page.waitForFunction(()=>!document.body.textContent.includes('Salvataggio preferenza…'));
  await page.reload();
  await page.getByRole('heading',{name:'Alfa fittizia'}).waitFor({timeout:45000});
  assert.match(await page.locator('.chart-heading').innerText(),/01\/01\/2000 12:04/);
  assert.doesNotMatch(await page.locator('body').innerText(),/Transiti|Sinastria/);
  await page.getByRole('button',{name:'Opzioni',exact:true}).click();
  await page.getByRole('button',{name:'Avvio',exact:true}).click();
  await page.getByText('Cielo del momento').click();
  await page.waitForFunction(()=>!document.body.textContent.includes('Salvataggio preferenza…'));
  await page.reload();
  await page.getByRole('heading',{name:'Cielo attuale'}).waitFor({timeout:45000});
  await page.getByRole('button',{name:'Opzioni',exact:true}).click();
  await page.getByRole('button',{name:'Avvio',exact:true}).click();
  await page.getByText('Un tema salvato',{exact:true}).click();
  await page.waitForFunction(()=>!document.body.textContent.includes('Salvataggio preferenza…'));
  await page.evaluate(()=>sessionStorage.setItem('fixture-defer-preference','yes'));
  await page.reload();
  await page.waitForFunction(()=>typeof globalThis.releaseFixturePreference==='function');
  await page.getByRole('button',{name:'Opzioni',exact:true}).click();
  await page.evaluate(()=>globalThis.releaseFixturePreference());
  await page.getByRole('button',{name:'Avvio',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('input[name=startup]')[1]?.checked===true);
  assert.ok(await page.getByRole('heading',{name:'Avvio'}).isVisible(),'preference loads without taking over user navigation');
  await page.evaluate(()=>sessionStorage.setItem('fixture-defer-startup','yes'));
  await page.reload();
  await page.waitForFunction(()=>typeof globalThis.releaseFixtureStartup==='function');
  await page.getByRole('button',{name:'Archivio',exact:true}).click();
  await page.evaluate(()=>globalThis.releaseFixtureStartup());
  await page.waitForTimeout(200);
  assert.ok(await page.locator('[aria-labelledby=saved-charts-title]').isVisible(),'late startup must not take over user navigation');
  console.log('Synthetic browser flow passed: save-before-failure, retry, sky navigation, update, election, search, startup and cancelled startup.');
} finally {await browser.close();}
