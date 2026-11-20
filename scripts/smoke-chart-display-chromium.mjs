import {chromium} from '../../astrological-charts/node_modules/playwright-core/index.mjs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from '../../astrological-charts/node_modules/sharp/lib/index.js';

const root=path.resolve('dist/virgostars-mobile/browser');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
async function assertBlendedBackground(page,canvas) {
  await canvas.scrollIntoViewIfNeeded();
  const box=await canvas.boundingBox();assert.ok(box && box.x>4 && box.y>=0);
  const shot=await page.screenshot({scale:'css'});
  const {data,info}=await sharp(shot).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const pixel=(x,y)=>[0,1,2].map(i=>data[(Math.floor(y)*info.width+Math.floor(x))*info.channels+i]);
  const outside=pixel(box.x-3,box.y+3),inside=pixel(box.x+3,box.y+3);
  assert.ok(inside.every((v,i)=>Math.abs(v-outside[i])<12),`Canvas background does not blend: ${outside} / ${inside}`);
}
try {
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2.25,locale:'it-IT'});
  const missingAssets=[];
  page.on('response', response=>{const url=new URL(response.url());if(url.pathname.startsWith('/assets/') && response.status()>=400)missingAssets.push(url.pathname);});
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());if(url.hostname!=='localhost')return route.abort();
    const file=path.resolve(root,url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1)));
    if(!file.startsWith(root+path.sep))return route.abort();
    try {await route.fulfill({status:200,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]??'application/octet-stream',body:await readFile(file)});}catch{await route.fulfill({status:404,body:''});}
  });
  await page.addInitScript(()=>{
    globalThis.isTauri=true;
    globalThis.__TAURI_INTERNALS__={invoke:async(command,args)=>{
      if(command==='runtime_info')return {schema_version:1,platform:'synthetic',mode:'prototype'};
      if(command==='startup_preference')return {protocolVersion:1,status:'ok',preference:{mode:'sky',chartId:null}};
      if(command==='device_preferences') {
        const {section,operation}=args.request,key='fixture-device-'+section;
        if(operation==='set')localStorage.setItem(key,JSON.stringify(args.request[section]));
        const value=JSON.parse(localStorage.getItem(key)||'null');
        return {protocolVersion:1,status:'ok',ui:section==='ui'?value:null,chart:section==='chart'?value:null};
      }
      if(command==='chart_archive')return {protocolVersion:1,status:'ok',charts:[],legacyPresent:false};
      if(command==='search_offline_places')return {protocolVersion:1,items:[{id:1,name:'Example',italianName:null,latMicro:1000000,lngMicro:2000000,population:null,stateId:1,region:'Region',timeZone:'UTC',countryName:'Italy',countryCode:'IT'}]};
      if(command==='calculate_chart') {
        if(globalThis.delayNextCalculation) {globalThis.delayNextCalculation=false;await new Promise(resolve=>globalThis.releaseCalculation=resolve);}
        const ids=['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];
        const house=id=>({id,cuspsDeg:Array.from({length:12},(_,i)=>(100+i*30)%360),ascendantDeg:100,mcDeg:10,armcDeg:10,vertexDeg:200});
        const shift=((Math.floor(Date.parse(args.request.utcIso)/86400000)%360)+360)%360;
        return {protocolVersion:1,status:'ok',provider:{id:'fixture',engineVersion:'test'},chart:{julianDayUt:2451545,
          bodies:ids.map((id,i)=>({id,longitudeDeg:(i*31+shift)%360,latitudeDeg:i+0.1,distanceAu:1,longitudeSpeed:1,latitudeSpeed:0,distanceSpeed:0,rightAscensionDeg:i*31%360,declinationDeg:i,ephemerisSource:'moshier'})),
          houses:[house('egizia'),house('placido'),house('koch')],unavailableBodies:[],unavailableHouseSystems:[]}};
      }
      throw Error('unsupported fixture command');
    }};
  });
  await page.goto('http://localhost/',{waitUntil:'domcontentloaded'});
  const canvas=page.locator('vs-chart-wheel canvas');
  try {
    await page.waitForFunction(()=>{const c=document.querySelector('vs-chart-wheel canvas');return c&&getComputedStyle(c).visibility==='visible'&&c.width>c.getBoundingClientRect().width*2;},null,{timeout:45000});
  } catch(error) {
    if(missingAssets.length) throw Error('Chart assets unavailable: '+[...new Set(missingAssets)].join(', '));
    throw error;
  }
  assert.deepEqual(missingAssets,[],'chart assets must load from the clean build');
  assert.equal(await page.getByLabel('Sistema di case').count(),0);
  assert.equal(await page.getByRole('button',{name:'Prepara PNG'}).count(),0);
  assert.doesNotMatch(await page.locator('body').innerText(),/Selezionato:/);
  assert.doesNotMatch(await page.locator('body').innerText(),/Powered by VirgoStars|cifrat|encrypted/i);
  const size=()=>canvas.evaluate(c=>({pixels:c.width,css:c.getBoundingClientRect().width,ratio:window.devicePixelRatio}));
  let before=await size();assert.ok(Math.abs(before.pixels/before.css-before.ratio*1.5)<0.03);
  await assertBlendedBackground(page,canvas);
  await page.getByRole('button',{name:'Ingrandisci carta'}).click();
  await page.waitForFunction(()=>{const c=document.querySelector('vs-chart-wheel canvas');return c&&c.getBoundingClientRect().width>400&&c.width>c.getBoundingClientRect().width*2;});
  await page.waitForFunction(previous=>document.querySelector('vs-chart-wheel canvas')?.width>previous,before.pixels);
  const zoomed=await size();assert.ok(zoomed.pixels>before.pixels);
  await page.setViewportSize({width:360,height:800});
  await page.waitForTimeout(600);const resized=await size();assert.ok(Math.abs(resized.pixels/resized.css-resized.ratio*1.5)<0.03);
  if(process.env.VIRGOSTARS_CHART_SCREENSHOT)await page.screenshot({path:process.env.VIRGOSTARS_CHART_SCREENSHOT});
  const menu=page.getByRole('navigation',{name:'Sezioni della carta'});
  assert.equal(await menu.getByRole('button',{name:'Dati'}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Home',exact:true}).count(),0);
  await page.getByRole('button',{name:'Archivio',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Aggiorna elenco'}).count(),0);
  await page.getByRole('button',{name:'Nuovo tema'}).click();
  await page.getByRole('button',{name:'Annulla',exact:true}).click();
  await page.getByRole('heading',{name:'Cielo attuale'}).waitFor();
  await page.getByRole('button',{name:'Archivio',exact:true}).click();
  await page.getByRole('button',{name:'Nuovo tema'}).click();
  await page.getByLabel('Nome del tema',{exact:true}).fill('Prova sintetica');
  await page.getByLabel('Data e ora locali').fill('2000-01-01T12:00');
  await page.getByLabel('Fuso orario IANA (es. Europe/Rome)').fill('UTC');
  await page.getByLabel('Latitudine (nord positiva)').fill('0');
  await page.getByLabel('Longitudine (est positiva)').fill('0');
  await page.getByRole('button',{name:'Salva',exact:true}).click();
  await page.locator('vs-chart-wheel canvas').waitFor({state:'visible',timeout:45000});
  await page.getByRole('heading',{name:'Prova sintetica'}).waitFor();
  assert.match(await page.locator('.chart-heading').innerText(),/01\/01\/2000 12:00 · GMT\+00:00/);
  assert.match(await page.locator('.chart-heading').innerText(),/0°, 0°/);
  assert.equal(await menu.getByRole('button',{name:'Grafico'}).getAttribute('aria-current'),'page');
  await page.getByLabel('Passo').fill('1');await page.getByLabel('Unità di tempo').selectOption('day');
  await page.evaluate(()=>{const c=document.querySelector('vs-chart-wheel canvas');window.scrollTo(0,window.scrollY+c.getBoundingClientRect().top-10);});
  const visible=await page.evaluate(()=>{const c=document.querySelector('vs-chart-wheel canvas').getBoundingClientRect(),n=document.querySelector('.sky-navigation').getBoundingClientRect(),bar=document.querySelector('.bottom-nav').getBoundingClientRect();return {canvasTop:c.top,canvasBottom:c.bottom,navigationBottom:n.bottom,barTop:bar.top};});
  assert.ok(visible.canvasTop>=0 && visible.canvasBottom<=visible.barTop && visible.navigationBottom<=visible.barTop,JSON.stringify(visible));
  const originalImage=await page.locator('vs-chart-wheel canvas').screenshot();
  await page.evaluate(()=>{globalThis.delayNextCalculation=true;globalThis.originalCanvas=document.querySelector('vs-chart-wheel canvas');globalThis.hiddenDuringUpdate=false;globalThis.canvasObserver=new MutationObserver(()=>{if(getComputedStyle(globalThis.originalCanvas).visibility!=='visible')globalThis.hiddenDuringUpdate=true;});globalThis.canvasObserver.observe(globalThis.originalCanvas,{attributes:true,attributeFilter:['style']});});
  await page.getByRole('button',{name:'Avanti nel tempo'}).click();
  await page.waitForFunction(()=>typeof globalThis.releaseCalculation==='function');
  assert.ok(await page.locator('vs-chart-wheel canvas').isVisible());
  await page.evaluate(()=>globalThis.releaseCalculation());
  await page.waitForFunction(()=>document.querySelector('.sky-current-time')?.textContent.includes('02/01/2000 12:00'));
  await page.waitForTimeout(1400);
  assert.equal(await page.evaluate(()=>document.querySelector('vs-chart-wheel canvas')===globalThis.originalCanvas && !globalThis.hiddenDuringUpdate),true);
  assert.notDeepEqual(await page.locator('vs-chart-wheel canvas').screenshot(),originalImage,'the wheel must redraw for the new instant');
  await page.getByRole('button',{name:'Ripristina',exact:true}).click();
  await menu.getByRole('button',{name:'Pianeti'}).click();
  await page.getByRole('heading',{name:'Pianeti'}).waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('.planet-summary img')].every(image=>image.complete && image.naturalWidth>0));
  assert.equal(await page.locator('.planet-summary .celestial-glyph').count(),20);
  assert.doesNotMatch(await page.locator('.planet-summary').first().innerText(),/Sole|Ariete|Toro|Gemelli/);
  assert.equal(await page.locator('.chart-results ol').count(),0);
  await menu.getByRole('button',{name:'Aspetti'}).click();
  await page.getByRole('heading',{name:'Aspetti',exact:true}).waitFor();
  await menu.getByRole('button',{name:'Elementi'}).click();
  await page.getByRole('heading',{name:'Elementi',exact:true}).waitFor();
  const counts=await page.locator('.element-count').allTextContents();assert.equal(counts.map(Number).reduce((a,b)=>a+b,0),10);
  const toggle=page.getByRole('button',{name:'Mostra dodecatemori'});
  assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  await toggle.click();
  assert.equal(await page.locator('.dodecatemoria-list li').count(),7);
  assert.equal(await page.getByRole('button',{name:'Nascondi dodecatemori'}).getAttribute('aria-expanded'),'true');
  if(process.env.VIRGOSTARS_DODECATEMORIA_SCREENSHOT) await page.locator('.elements-card').screenshot({path:process.env.VIRGOSTARS_DODECATEMORIA_SCREENSHOT});
  await page.getByRole('button',{name:'Nascondi dodecatemori'}).click();
  assert.equal(await page.locator('#dodecatemoria-list').isVisible(),false);
  await menu.getByRole('button',{name:'Latitudini'}).click();
  await page.locator('vs-chart-wheel canvas').waitFor({state:'visible',timeout:45000});
  await menu.getByRole('button',{name:'Strumenti'}).click();
  await page.getByRole('heading',{name:'Luogo ed elettiva'}).waitFor();
  assert.equal(await page.locator('.sky-navigation').count(),0);
  await page.locator('details.relocation summary').click();
  await page.getByLabel('Cerca luogo di destinazione').fill('Example');
  await page.locator('.relocation .place-results button').first().click({timeout:10000});
  await page.getByRole('button',{name:'Applica nuovo luogo'}).click();
  await page.waitForFunction(()=>!document.querySelector('details.relocation')?.open,null,{timeout:10000});
  assert.match(await page.locator('.chart-heading').innerText(),/Example/);
  await page.getByRole('button',{name:'Archivio',exact:true}).click();
  assert.doesNotMatch(await page.locator('body').innerText(),/cifrat|encrypted/i);
  assert.doesNotMatch(await page.locator('body').innerText(),/Temi della sessione|non sono recuperabili|dopo la disinstallazione/);
  await page.getByRole('button',{name:'Carta',exact:true}).click();
  await menu.getByRole('button',{name:'Strumenti'}).click();
  assert.ok(await page.getByRole('heading',{name:'Salva tema'}).isVisible());
  assert.doesNotMatch(await page.locator('body').innerText(),/Transiti|Sinastria/);
  if(process.env.VIRGOSTARS_MENU_SCREENSHOT) {
    await menu.getByRole('button',{name:'Grafico'}).click();
    await page.screenshot({path:process.env.VIRGOSTARS_MENU_SCREENSHOT});
  }
  await page.getByRole('button',{name:'Opzioni',exact:true}).click();
  await page.getByLabel('Cerca nelle opzioni').fill('domificazione');
  await page.getByRole('button',{name:'Domificazione'}).click();
  assert.ok(await page.getByLabel('Placido').isChecked());
  await page.getByLabel('Koch').check();
  await page.getByRole('button',{name:'‹ Opzioni'}).click();
  await page.getByLabel('Cerca nelle opzioni').fill('aspetto');
  await page.getByRole('button',{name:'Aspetto',exact:true}).click();
  assert.ok(await page.getByLabel('Chiaro').isChecked());
  await page.getByLabel('Scuro').check();
  await page.getByLabel('Chiaro').check();
  await page.getByRole('button',{name:'Carta',exact:true}).click();
  await menu.getByRole('button',{name:'Grafico'}).click();
  await page.waitForFunction(()=>{const c=document.querySelector('vs-chart-wheel canvas');return c&&getComputedStyle(c).visibility==='visible';},null,{timeout:45000});
  await assertBlendedBackground(page,page.locator('vs-chart-wheel canvas'));
  if(process.env.VIRGOSTARS_LIGHT_SCREENSHOT) await page.screenshot({path:process.env.VIRGOSTARS_LIGHT_SCREENSHOT});
  async function makeDatedChart(civil) {
    await page.getByRole('button',{name:'Archivio',exact:true}).click();
    await page.getByRole('button',{name:'Nuovo tema'}).click();
    await page.getByLabel('Nome del tema',{exact:true}).fill('Prova cambio ora');
    await page.getByLabel('Data e ora locali').fill(civil);
    await page.getByLabel('Fuso orario IANA (es. Europe/Rome)').fill('Europe/Rome');
    await page.getByLabel('Latitudine (nord positiva)').fill('0');await page.getByLabel('Longitudine (est positiva)').fill('0');
    await page.getByRole('button',{name:'Salva',exact:true}).click();
    await page.locator('vs-chart-wheel canvas').waitFor({state:'visible',timeout:45000});
    await page.getByLabel('Passo').fill('1');await page.getByLabel('Unità di tempo').selectOption('day');
  }
  await makeDatedChart('2024-03-30T02:30');
  await page.getByRole('button',{name:'Avanti nel tempo'}).click();
  await page.getByText('L’ora locale non esiste',{exact:false}).waitFor();
  assert.ok(await page.locator('vs-chart-wheel canvas').isVisible());
  await page.getByRole('button',{name:'Annulla passo'}).click();
  await makeDatedChart('2024-10-26T02:30');
  await page.getByRole('button',{name:'Avanti nel tempo'}).click();
  await page.getByText('L’ora locale è ripetuta',{exact:false}).waitFor();
  assert.ok(await page.locator('vs-chart-wheel canvas').isVisible());
  await page.getByRole('button',{name:'Prima occorrenza',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.sky-current-time')?.textContent.includes('27/10/2024 02:30 · GMT+02:00'));
  await page.getByRole('button',{name:'Ripristina',exact:true}).click();
  await page.getByRole('button',{name:'Avanti nel tempo'}).click();
  await page.getByRole('button',{name:'Seconda occorrenza',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.sky-current-time')?.textContent.includes('27/10/2024 02:30 · GMT+01:00'));
  assert.equal(await page.locator('.sky-indicator.live').count(),0);
  await page.getByRole('button',{name:'Torna al cielo in tempo reale'}).click();
  await page.getByRole('heading',{name:'Cielo attuale'}).waitFor();
  await page.locator('.sky-indicator.live').waitFor();
  await page.getByRole('button',{name:'Cielo in tempo reale: metti in pausa'}).click();
  assert.equal(await page.locator('.sky-indicator.live').count(),0);
  await page.getByRole('button',{name:'Cielo in pausa: riprendi'}).click();
  await page.locator('.sky-indicator.live').waitFor();
  console.log('Chart display smoke passed: visible chart during navigation, redraw, DST resolution, glyphs, live sky, zoom and settings.');
} finally {await browser.close();}
