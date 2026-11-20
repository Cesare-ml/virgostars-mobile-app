import {chromium} from '../../astrological-charts/node_modules/playwright-core/index.mjs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve('dist/virgostars-mobile/browser');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage({viewport:{width:390,height:844},locale:'it-IT'});
  const fetched=[];
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url()); fetched.push(url.pathname);
    if(url.hostname!=='fixture.test')return route.abort();
    const file=path.resolve(root,url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1)));
    if(!file.startsWith(root+path.sep))return route.abort();
    try {await route.fulfill({status:200,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]??'application/octet-stream',body:await readFile(file)});}catch{await route.fulfill({status:404,body:''});}
  });
  await page.addInitScript(()=>{
    globalThis.isTauri=true;globalThis.fixtureQueries=[];
    globalThis.__TAURI_INTERNALS__={invoke:async(command,args)=>{
      if(command==='runtime_info')return {schema_version:1,platform:'synthetic',mode:'prototype'};
      if(command==='startup_preference')return {protocolVersion:1,status:'ok',preference:{mode:'sky',chartId:null}};
      if(command==='device_preferences')return {protocolVersion:1,status:'ok',ui:null,chart:null};
      if(command==='calculate_chart')return {protocolVersion:1,status:'provider_unavailable'};
      if(command==='chart_archive')return {protocolVersion:1,status:'ok',charts:[],legacyPresent:false};
      if(command==='search_offline_places') {
        globalThis.fixtureQueries.push(args.query);
        if(args.query.startsWith('Slow'))await new Promise(r=>setTimeout(r,1000));
        if(args.query.startsWith('Missing'))throw 'PLACE_CATALOG_UNAVAILABLE';
        const name=args.query.startsWith('Slow')?'Slowtown':'Example';
        return {protocolVersion:1,items:[{id:1,name,italianName:null,latMicro:1000000,lngMicro:2000000,population:null,stateId:1,region:'Region',timeZone:'UTC',countryName:'Italy',countryCode:'IT'}]};
      }
      throw Error('unsupported fixture command');
    }};
  });
  await page.goto('http://fixture.test/',{waitUntil:'domcontentloaded'});
  await page.getByRole('alert').filter({hasText:'Effemeridi non disponibili'}).waitFor();
  assert.equal(await page.locator('.chart-form').count(),0);
  await page.getByRole('button',{name:'Archivio',exact:true}).click();
  await page.getByRole('button',{name:'Nuovo tema'}).click();
  const field=page.getByLabel('Cerca luogo (facoltativo)');await field.waitFor();
  await field.fill('Slow');await page.waitForFunction(()=>globalThis.fixtureQueries.includes('Slow'));
  await field.fill('Example, Italia');await page.waitForFunction(()=>document.querySelector('.chart-form .place-results button')?.textContent.includes('Example'));
  await page.waitForTimeout(1100);
  assert.match(await page.locator('.chart-form .place-results button').first().innerText(),/Example/);
  assert.ok((await page.evaluate(()=>globalThis.fixtureQueries)).includes('Example, IT'));
  await page.locator('.chart-form .place-results button').first().click();
  assert.equal(await page.getByLabel('Fuso orario IANA (es. Europe/Rome)').inputValue(),'UTC');
  await field.fill('Missing');await page.getByRole('alert').filter({hasText:'Catalogo luoghi non disponibile'}).waitFor();
  assert.ok(!fetched.some(x=>/cities(?:1000|5000)\.json/.test(x)));
  console.log('Locality smoke passed: native search, latest result, manual fallback and no legacy data request.');
} finally {await browser.close();}
