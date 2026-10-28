/** Real-module Chromium integration tests. All external requests are deterministic mocks. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, extname, sep} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.GLOWROUTE_PLAYWRIGHT_PATH||'playwright');
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const currentShell=(await readFile(resolve(root,'sw.js'),'utf8')).match(/const CACHE='glowroute-shell-([^']+)'/)[1];
let swRelease=currentShell,failDirectory=false;
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
 try{
  let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(path.endsWith('/'))path+='index.html';
  const file=resolve(root,'.'+path);if(!file.startsWith(root+sep))throw Error('outside root');
  if(failDirectory&&path.endsWith('/directory/catalog.json')){res.writeHead(503);res.end();return;}
  let bytes=await readFile(file);
  if(path==='/sw.js')bytes=Buffer.from(bytes.toString().replace(/const CACHE='glowroute-shell-[^']+';/,`const CACHE='glowroute-shell-${swRelease}';`));
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
 }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://localhost:${server.address().port}`;
const mapStub=()=>{
 window.L={map:()=>({setView(){return this;},on(){},flyTo(){return this;},fitBounds(){return this;},invalidateSize(){window.__mapResizes=(window.__mapResizes||0)+1;return this;}}),control:{zoom:()=>({addTo(){}})},tileLayer:()=>({addTo(){}}),layerGroup:()=>({addTo(){return this;},clearLayers(){},getLayers(){return [];}}),marker:()=>({bindPopup(){return this;},addTo(){return this;}}),circleMarker:()=>({addTo(){return this;}}),divIcon:()=>({}),polyline:()=>({addTo(){return this;}}),latLngBounds:()=>({extend(){},isValid(){return false;},pad(){return this;}})};
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=text;}}});
};
const displays=Array.from({length:4},(_,i)=>({id:`demo${i+1}`,name:['Denver Art Museum','Colorado State Capitol','Denver Botanic Gardens','Denver Public Library'][i],address:['100 W 14th Avenue Pkwy, Denver, CO','200 E Colfax Ave, Denver, CO','1007 York St, Denver, CO','10 W 14th Ave Pkwy, Denver, CO'][i],lat:39.73+.001*(i+1),lon:-104.95+.001*(i+1),approved:true,geoSource:'manual',rating:3,mustSee:i===0,visitNotes:'PRIVATE NOTE'}));
const fixture=()=>({activeId:'t1',projects:[{id:'t1',name:'Denver example drive',holiday:'Christmas',year:2026,state:{displays:structuredClone(displays),selected:displays.map(d=>d.id),start:'Private start',end:'Private finish',mode:'distance',preset:'custom',endpoints:{start:{address:'Private start',lat:39.73,lon:-104.95},end:{address:'Private finish',lat:39.735,lon:-104.945}},cache:{}}}]});
const indices=url=>url.split('/driving/')[1].split('?')[0].split(';').map(p=>Math.round((Number(p.split(',')[1])-39.73)*1000));
const time=(i,j)=>i===j?0:j>i?(j-i)*60:(i-j)*600;
const distance=(i,j)=>i===j?0:(i===0&&j===4||i===1&&j===5||i>j&&i<5&&j>0)?100:3000;
async function prepare(browser,viewport,{saved=true,storageFail=false,corrupt=false}={}){
 const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const control={fail:false,geometryFail:false,delay:0,calls:[],gpsCalls:0,importDelay:0};
 await context.addInitScript(mapStub);
 await context.addInitScript(({saved,storageFail,corrupt,data})=>{
  if(!sessionStorage.getItem('test-initialized')){
   localStorage.clear();if(saved)localStorage.setItem('glowroute:projects:v2',corrupt?'BROKEN JSON':JSON.stringify(data));sessionStorage.setItem('test-initialized','1');
  }
  if(storageFail)Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError');};
 },{saved,storageFail,corrupt,data:fixture()});
 await context.route('**/*',async route=>{
  const url=route.request().url();
  if(url==='https://listing.example.test/displays'){if(control.importDelay)await new Promise(r=>setTimeout(r,control.importDelay));await route.fulfill({contentType:'text/plain',body:'Late display — 888 Test St, Portland, OR'}).catch(()=>{});return;}
  if(url.includes('router.project-osrm.org')){
   control.calls.push(url);if(control.delay)await new Promise(r=>setTimeout(r,control.delay));
   if(control.fail||control.geometryFail&&url.includes('/route/')&&(control.geometryFail===true||indices(url)[1]===4)){await route.fulfill({status:503,body:'Unavailable'});return;}
   const ids=indices(url),matrix=fn=>ids.map(i=>ids.map(j=>fn(i,j)));
   const data=url.includes('/table/')?{code:'Ok',durations:matrix(time),distances:matrix(distance)}:{code:'Ok',routes:[{duration:120+ids.slice(1).reduce((s,j,k)=>s+time(ids[k],j),0),distance:50+ids.slice(1).reduce((s,j,k)=>s+distance(ids[k],j),0),geometry:{coordinates:url.split('/driving/')[1].split('?')[0].split(';').map(p=>p.split(',').map(Number))}}]};
   await route.fulfill({json:data});return;
  }
  if(!url.startsWith(base)){await route.abort();return;}
  await route.continue();
 });
 await page.goto(base);await page.waitForSelector('.stop, .empty-state');
 return {context,page,control,errors};
}
async function optimize(page){await page.locator('#optimize').click();await page.waitForFunction(()=>!document.querySelector('#optimize').disabled);assert(await page.locator('#results').isVisible(),await page.locator('#status').innerText());}
async function textOrder(page){return page.locator('.itinerary-label').allTextContents();}
let checks=0;
function pass(message){checks++;console.log(`PASS ${message}`);}
const browser=await chromium.launch({headless:true,...(process.env.GLOWROUTE_BROWSER_EXECUTABLE?{executablePath:process.env.GLOWROUTE_BROWSER_EXECUTABLE}:{})});
console.log(`Browser engine: ${browser.version()}`);
try{
 {
  const {context,page,errors}=await prepare(browser,{width:1366,height:900});
  const handle=page.getByRole('separator',{name:'Resize route planner and map'}),planner=page.locator('#planner-panel');
  const width=async()=>Math.round((await planner.boundingBox()).width);
  const saved=await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2'));
  assert.equal(await width(),490);
  const grip=await handle.boundingBox();await page.mouse.move(grip.x+grip.width/2,grip.y+80);await page.mouse.down();await page.mouse.move(grip.x+grip.width/2+150,grip.y+80,{steps:5});await page.mouse.up();
  assert.equal(await width(),640);assert.match(await handle.getAttribute('aria-valuetext'),/640 pixels/);
  await page.waitForFunction(()=>window.__mapResizes>1);
  await handle.press('ArrowLeft');assert.equal(await width(),620);await handle.press('Shift+ArrowRight');assert.equal(await width(),720);
  await page.reload();assert.equal(await width(),720);
  await page.setViewportSize({width:900,height:900});await page.waitForFunction(()=>document.querySelector('#planner-panel').getBoundingClientRect().width<600);assert.equal(await width(),556);assert((await page.locator('.map-area').boundingBox()).width>=320);
  await page.setViewportSize({width:390,height:844});assert(await handle.isHidden());assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.setViewportSize({width:1366,height:900});await page.waitForFunction(()=>document.querySelector('#planner-panel').getBoundingClientRect().width===720);
  await handle.press('Home');assert.equal(await width(),355);await handle.press('End');assert.equal(await width(),887);await handle.press('Enter');assert.equal(await width(),490);
  assert.equal(await page.evaluate(()=>localStorage.getItem('glowroute:planner-width:v1')),null);
  assert.equal(await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),saved);
  assert.deepEqual(errors,[]);await context.close();pass('resizable desktop panes: drag, keyboard, persistence, viewport limits, mobile layout, map redraw and untouched projects');
 }
 {
  const {context,page,errors}=await prepare(browser,{width:1366,height:900});const handle=page.locator('#panel-resizer');
  await handle.press('ArrowRight');let grip=await handle.boundingBox();await page.mouse.move(grip.x+12,grip.y+80);await page.mouse.down();await page.mouse.move(grip.x+112,grip.y+80);await page.keyboard.press('Escape');await page.mouse.up();
  assert.equal(Math.round((await page.locator('#planner-panel').boundingBox()).width),510);assert.equal(await page.locator('html').evaluate(e=>e.classList.contains('resizing-panels')),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('glowroute:planner-width:v1')),'510');
  await handle.dblclick();assert.equal(Math.round((await page.locator('#planner-panel').boundingBox()).width),490);assert.equal(await page.evaluate(()=>localStorage.getItem('glowroute:planner-width:v1')),null);
  assert.deepEqual(errors,[]);await context.close();pass('cancelled divider drag restores width and clears pointer state; double-click resets');
 }
 {
  const {context,page,errors}=await prepare(browser,{width:1366,height:900},{storageFail:true});
  await page.locator('#panel-resizer').press('ArrowRight');assert.equal(Math.round((await page.locator('#planner-panel').boundingBox()).width),510);await page.locator('#panel-resizer').press('Enter');
  assert.deepEqual(errors,[]);await context.close();pass('pane resizing remains usable when preference storage is unavailable');
 }
 for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
  const {context,page,control,errors}=await prepare(browser,viewport);
  assert(await page.locator('#drive-feedback').isHidden());await page.locator('#mode').selectOption('duration');await optimize(page);
  assert(await page.locator('#drive-feedback').isHidden());await page.locator('#drive-start').click();
  const feedback=page.locator('#drive-feedback'),rating=page.locator('#drive-rating'),notes=page.locator('#drive-notes');
  const project=async()=>page.evaluate(()=>JSON.parse(localStorage.getItem('glowroute:projects:v2')).projects[0].state);
  assert.equal(await feedback.getAttribute('data-display-id'),'demo1');assert.match(await page.locator('#drive-feedback-name').innerText(),/Art Museum/);
  const calls=control.calls.length;await rating.selectOption('5');await page.locator('#drive-favorite').click();await page.locator('#drive-note-details summary').click();
  const note='RIDER PRIVATE NOTE <img src=x onerror="window.injected=true">';await notes.fill(note);
  const stored=await project(),first=stored.displays.find(d=>d.id==='demo1');assert.equal(first.rating,5);assert.equal(first.favorite,true);assert.equal(first.visitNotes,note);assert.equal(stored.drive.remainingIds.length,4);assert.equal(control.calls.length,calls);
  assert.equal(await page.locator('#drive-favorite').getAttribute('aria-pressed'),'true');assert.match(await page.locator('#drive-feedback-status').innerText(),/Saved on this device/);
  await page.reload();await page.locator('#drive-resume').click();await page.waitForFunction(()=>!document.querySelector('#drive-visited').disabled);
  assert.equal(await feedback.getAttribute('data-display-id'),'demo1');assert.equal(await rating.inputValue(),'5');assert.equal(await notes.inputValue(),note);
  await page.locator('#drive-full').click();assert.equal(await page.locator('.stop .rating-select').first().inputValue(),'5');assert.match(await page.locator('.stop').first().innerText(),/RIDER PRIVATE NOTE/);
  await page.locator('#share-text').click();assert(!(await page.evaluate(()=>window.__copied)).includes('RIDER PRIVATE NOTE'));
  // Existing list edits must be reflected when returning to the current stop.
  await page.locator('.stop .rating-select').first().selectOption('4');await page.locator('#drive-full').click();assert.equal(await rating.inputValue(),'4');
  await page.locator('#drive-note-details summary').click();await notes.fill('Last keystroke before Visited');control.delay=250;await page.locator('#drive-visited').click();
  assert(await rating.isDisabled());assert.equal((await project()).displays.find(d=>d.id==='demo1').visitNotes,'Last keystroke before Visited');
  await page.waitForFunction(()=>!document.querySelector('#drive-visited').disabled);assert.notEqual(await feedback.getAttribute('data-display-id'),'demo1');assert.equal(await rating.inputValue(),'3');assert.equal(await notes.inputValue(),'PRIVATE NOTE');
  assert.equal(await page.locator('#drive-favorite').getAttribute('aria-pressed'),'false');assert.equal(await page.locator('#drive-note-details').getAttribute('open'),null);
  const nextId=await feedback.getAttribute('data-display-id');await rating.selectOption('2');control.fail=true;await page.locator('#drive-skip').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Could not reroute'));
  assert.notEqual(await feedback.getAttribute('data-display-id'),nextId);assert.equal((await project()).displays.find(d=>d.id===nextId).rating,2);assert.equal(await rating.inputValue(),'3');
  // Personal feedback remains available after a routing-service failure.
  await page.locator('#drive-note-details summary').click();await notes.fill('Available after outage');assert.match(await page.locator('#drive-feedback-status').innerText(),/Saved on this device/);
  await page.locator('#drive-full').click();await page.locator('#share-link').click();assert(!(await page.evaluate(()=>window.__copied)).includes('Available after outage'));await page.locator('#drive-full').click();
  assert.equal(await page.evaluate(()=>window.injected),undefined);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#drive-visited').click();await page.waitForFunction(()=>!document.querySelector('#drive-visited').disabled);await page.locator('#drive-visited').click();await page.waitForFunction(()=>document.querySelector('#drive-current').textContent.includes('All displays completed'));
  assert(await feedback.isHidden());assert(await rating.isDisabled());await page.locator('#drive-end').click();assert(await feedback.isHidden());assert.deepEqual(errors,[]);await context.close();
  pass(`${viewport.width}px: current-stop rating/favorite/notes, immediate save, reload/resume, list sync, visit/skip binding, outage editing and sharing privacy`);
 }
 {
  const {context,page,errors}=await prepare(browser,{width:390,height:844});await optimize(page);await page.locator('#drive-start').click();
  const original=await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2'));
  await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError');};});
  await page.locator('#drive-rating').selectOption('5');assert.match(await page.locator('#drive-feedback-status').innerText(),/only in this tab/);assert.match(await page.locator('#storage-status').innerText(),/only in memory/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),original);assert.deepEqual(errors,[]);await context.close();pass('Live Drive feedback storage failure is explicit, never claims a successful save');
 }
 for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
  const {context,page,control,errors}=await prepare(browser,viewport);
  assert(await page.locator('#welcome').isHidden());await optimize(page);
  let order=await textOrder(page);assert.match(order[0],/Public Library/);assert.match(order.at(-1),/Art Museum/);
  const chosen=page.locator('.route-choice').filter({has:page.locator('button:disabled')});assert.match(await chosen.innerText(),/Shortest modeled driving distance/);
  const metricTime=(await page.locator('#metrics .metric').nth(1).innerText()).split('\n')[0];assert((await chosen.innerText()).includes(metricTime));assert.match(await page.locator('#route-detail').innerText(),/Totals use the mapped itinerary/);
  assert.equal(control.calls.filter(x=>x.includes('/route/')).length,2); // no third draw request
  await page.locator('#share-text').click();let copied=await page.evaluate(()=>window.__copied);assert(!copied.includes('Private start')&&!copied.includes('Private finish')&&!copied.includes('PRIVATE NOTE'));
  await page.locator('#share-link').click();const share=await page.evaluate(()=>window.__copied);assert(share.includes('#tour='));
  await page.locator('#share-endpoints').check();await page.locator('#share-text').click();assert.match(await page.evaluate(()=>window.__copied),/Private start/);
  await page.locator('.itinerary-row').first().locator('button').last().click();await page.waitForFunction(()=>document.querySelector('#route-detail').textContent.includes('Manually arranged'));
  assert.equal(await page.locator('.itinerary-row').count(),4);
  const links=await page.locator('#nav-buttons a').evaluateAll(links=>links.map(a=>a.href));
  for(const link of links){const u=new URL(link);assert(['maps.apple.com','www.google.com'].includes(u.hostname));}
  pass(`${viewport.width}px: nationwide distance selection, cached geometry, manual order, sharing privacy, Maps links`);
  await page.locator('#mode').selectOption('duration');await optimize(page);order=await textOrder(page);assert.match(order[0],/Art Museum/);
  // The current matrix is cached, so fail the next (smaller) reroute.
  await page.locator('#drive-start').click();assert(await page.locator('body').evaluate(e=>e.classList.contains('driving')));
  control.fail=true;await page.locator('#drive-skip').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Could not reroute'));
  assert.match(await page.locator('#drive-current').innerText(),/3 remaining/);assert(!/Next: Denver Art Museum/.test(await page.locator('#drive-current').innerText()));assert.equal(await page.locator('#metrics .metric').count(),0);
  let stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('glowroute:projects:v2')));assert.equal(stored.projects[0].state.drive.remainingIds.length,3);
  control.fail=false;await page.reload();await page.locator('#drive-resume').click();await page.waitForFunction(()=>document.querySelector('#drive-current').textContent.includes('3 remaining')&&!document.querySelector('#drive-visited').disabled);
  await page.locator('#drive-visited').click();await page.waitForFunction(()=>document.querySelector('#drive-current').textContent.includes('2 remaining')&&!document.querySelector('#drive-visited').disabled);
  await page.locator('#drive-full').click();assert(await page.locator('#itinerary').isVisible());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#drive-end').click();
  pass(`${viewport.width}px: focused drive, failed skip recovery, reload/resume, visited progress, full itinerary, no horizontal overflow`);
  // Shared import creates a separate project and leaves omitted endpoints blank.
  await page.goto(share);await page.locator('#shared-import').click();assert.equal(await page.locator('#project-picker option').count(),2);assert.equal(await page.locator('#start-input').inputValue(),'');assert.equal(await page.locator('.stop').count(),4);
  await page.locator('#project-picker').selectOption('t1');assert.equal(await page.locator('.stop').count(),4);
  // Import into the actual project using an explicit city, with formatting duplicates.
  await page.locator('#bulk-toggle').click();await page.locator('#bulk-text').fill('Example A — 100 Test Street, Portland, OR\nExample B — 100 Test St, Portland OR\nExample C — 102 Test Ave, Portland, OR');await page.locator('#import-preview').click();assert.equal(await page.locator('.import-review-row').count(),2);await page.locator('#import-confirm').click();assert.equal(await page.locator('.stop').count(),6);
  // Malformed restore is rejected before confirmation or mutation.
  stored=await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2'));
  await page.locator('#projects-import').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:2,projects:[{}]}))});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Could not restore'));
  assert.equal(await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),stored);
  page.once('dialog',dialog=>dialog.accept());await page.locator('#projects-import').setInputFiles({name:'valid-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...JSON.parse(stored),version:2}))});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Projects restored successfully'));assert.equal(await page.locator('.stop').count(),6);
  pass(`${viewport.width}px: safe shared import, independent projects, import deduplication, atomic restore validation`);
  await page.locator('#bulk-toggle').click();await page.locator('#import-file').setInputFiles({name:'review.csv',mimeType:'text/csv',buffer:Buffer.from('Name,Address\nA,"301 New St, Portland, OR"\nB,"302 New St, Portland, OR"\nBad,no numbered address')});
  assert.equal(await page.locator('.import-review-row').count(),2);assert.match(await page.locator('.import-diagnostics summary').innerText(),/1 ignored/);
  await page.locator('.import-review-row').first().locator('input[aria-label^="Display name"]').fill('Edited label');await page.locator('.import-review-row').nth(1).locator('input[type=checkbox]').uncheck();
  await page.locator('#import-mode').selectOption('replace');assert.equal(await page.locator('.import-review-row').first().locator('input[aria-label^="Display name"]').inputValue(),'Edited label');assert.equal(await page.locator('.import-review-row').nth(1).locator('input[type=checkbox]').isChecked(),false);
  await page.locator('#import-mode').selectOption('append');await page.locator('#import-select-none').click();assert(await page.locator('#import-confirm').isDisabled());await page.locator('#import-select-all').click();assert.match(await page.locator('#import-review-summary').innerText(),/2 selected/);
  const firstAddress=page.locator('.import-review-row').first().locator('input[aria-label^="Street address"]');await firstAddress.fill(displays[0].address);assert.match(await page.locator('#import-review-summary').innerText(),/1 already listed/);assert(await page.locator('.import-review-row').first().locator('input[type=checkbox]').isDisabled());await firstAddress.fill('301 New St, Portland, OR');await page.locator('.import-review-row').nth(1).locator('input[type=checkbox]').uncheck();await page.locator('#import-confirm').click();assert.equal(await page.locator('.stop').count(),7);
  pass(`${viewport.width}px: rejected-row diagnostics, stable edited preview across modes, bulk selection and append duplicate safety`);
  await page.locator('#directory-toggle').click();await page.waitForFunction(()=>document.querySelector('#directory-status').textContent.includes('31 catalog entries'));
  await page.locator('#directory-sort').selectOption('year');assert.match(await page.locator('.directory-row').first().innerText(),/2026.*Check operation/);await page.locator('#directory-year').selectOption('2025');assert.match(await page.locator('.directory-row').first().innerText(),/Archive/);assert.match(await page.locator('.directory-row').first().innerText(),/Source reviewed/);
  await page.locator('#directory-select-visible').click();assert.match(await page.locator('#directory-summary').innerText(),/12 selected/);await page.locator('#directory-year').selectOption('2026');assert.match(await page.locator('#directory-summary').innerText(),/12 outside/);await page.locator('#directory-select-visible').click();assert.match(await page.locator('#directory-summary').innerText(),/31 selected/);await page.locator('#directory-select-visible').click();assert.match(await page.locator('#directory-summary').innerText(),/12 selected/);await page.locator('#directory-clear-selection').click();
  const firstCheckbox=page.locator('.directory-row input').first();await firstCheckbox.check();assert.equal(await firstCheckbox.getAttribute('id'),await page.evaluate(()=>document.activeElement.id));
  await page.locator('#submission-toggle').click();await page.locator('#submit-address').fill('PRIVATE ADDRESS');await page.locator('#submit-source').fill('https://private.example');await page.locator('#submit-type').selectOption('removal');await page.locator('#submit-name').fill('indy-halloween-01');assert(await page.locator('#submit-address').isDisabled());await page.evaluate(()=>{window.open=url=>{window.__suggestion=url;return null;};});page.once('dialog',dialog=>dialog.accept());await page.locator('#submission-form button[type=submit]').click();const suggestion=new URL(await page.evaluate(()=>window.__suggestion));assert.match(suggestion.searchParams.get('title'),/Removal request/);assert(!suggestion.searchParams.get('body').includes('PRIVATE ADDRESS'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  pass(`${viewport.width}px: seasonal directory labels, source review dates, filtered bulk selection, keyboard focus and ID-only removal drafts`);
  assert.deepEqual(errors,[]);await context.close();
 }
 // Full outage keeps an explicit rough fallback with no invented driving time.
 for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
  const {context,page,errors}=await prepare(browser,viewport);
  await page.locator('.stop').first().locator('.stop-preferences button').first().click();await page.locator('.stop').first().locator('.rating-select').selectOption('5');await page.locator('.stop').first().locator('summary').click();await page.locator('.stop').first().locator('button[title="Mark this house visited on this drive"]').click();await page.locator('.stop').nth(1).locator('input[type=checkbox]').uncheck();
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-json').click()]);const exported=await readFile(await download.path());
  await page.locator('#project-new').click();await page.locator('#project-name').fill('Round trip');await page.locator('#project-holiday').selectOption('Christmas');await page.locator('#project-create-form button[type=submit]').click();await page.locator('#bulk-toggle').click();await page.locator('#import-file').setInputFiles({name:'stops.json',mimeType:'application/json',buffer:exported});await page.locator('#import-confirm').click();
  assert.equal(await page.locator('#stop-count').innerText(),'3/4');const restored=await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('glowroute:projects:v2'));return p.projects.find(d=>d.id===p.activeId).state;});
  const first=restored.displays.find(d=>d.name==='Denver Art Museum');assert.equal(first.favorite,true);assert.equal(first.rating,5);assert.equal(first.mustSee,true);assert.equal(first.visited,true);assert.equal(first.visitNotes,'PRIVATE NOTE');assert.equal(first.approved,true);assert.equal(first.geoSource,'manual');assert.notEqual(first.id,displays[0].id);
  await page.locator('#bulk-toggle').click();await page.locator('#bulk-text').fill(Array.from({length:71},(_,i)=>`${301+i} New St, Portland, OR`).join('\n'));await page.locator('#import-preview').click();assert.equal(await page.locator('.import-review-row').count(),71);assert(await page.locator('#import-confirm').isDisabled());await page.locator('#import-select-none').click();await page.locator('.import-review-row input[type=checkbox]').nth(0).check();await page.locator('.import-review-row input[type=checkbox]').nth(1).check();await page.locator('#import-confirm').click();assert.equal(await page.locator('.stop').count(),6);
  assert.deepEqual(errors,[]);await context.close();pass(`${viewport.width}px: actual export/import preserves personal metadata and manual pins; oversized list reduced to a valid subset`);
 }
 {
  const {context,page,control,errors}=await prepare(browser,{width:390,height:844});control.importDelay=700;
  await page.locator('#bulk-toggle').click();await page.locator('#website-url').fill('https://listing.example.test/displays');const requested=page.waitForRequest('https://listing.example.test/displays');await page.locator('#website-load').click();await requested;await page.locator('#project-new').click();await page.locator('#project-name').fill('Different drive');await page.locator('#project-create-form button[type=submit]').click();await page.waitForTimeout(900);
  assert(await page.locator('#bulk-panel').isHidden());assert.equal(await page.locator('.stop').count(),0);assert.match(await page.locator('#status').innerText(),/Created Different drive/);assert.deepEqual(errors,[]);await context.close();pass('interrupted website import cannot reopen or populate a different project');
 }
 {
  const {context,page,errors}=await prepare(browser,{width:390,height:844});
  await page.locator('.smart-controls summary').click();await page.locator('#budget-enabled').check();await page.locator('#budget-minutes').fill('20');await optimize(page);
  assert.match(await page.locator('#route-detail').innerText(),/Time-budget selection/);assert.match(await page.locator('#itinerary').innerText(),/Art Museum/);
  const count=await page.locator('.itinerary-row').count();assert(count>0&&count<4);
  await page.locator('#preset').selectOption('top5');assert.equal(await page.locator('#stop-count').innerText(),'1/4');
  let gpsCalls=0;await page.exposeFunction('__gpsRequested',()=>{gpsCalls++;});
  await page.evaluate(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(resolve,reject)=>{window.__gpsRequested();reject({code:1});}}}));
  assert.equal(gpsCalls,0);await page.locator('#use-location').click();await page.waitForFunction(()=>document.querySelector('#location-status').textContent.includes('denied'));assert.equal(await page.locator('#start-input').inputValue(),'Private start');
  // GPS is explicit and temporary; the manually entered address remains in storage.
  await page.evaluate(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:resolve=>resolve({coords:{latitude:40.1234567,longitude:-105.9876543}})}}));
  await page.locator('#use-location').click();await page.waitForFunction(()=>document.querySelector('#location-status').textContent.includes('this tab only'));
  assert.equal(await page.locator('#start-input').inputValue(),'Private start');const data=await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2'));assert(!data.includes('40.1234567')&&!data.includes('-105.9876543'));await page.reload();assert.equal(await page.locator('#use-location').innerText(),'Use my location');
  assert.deepEqual(errors,[]);await context.close();pass('budget subset, must-see presets, GPS denial, action-only permission and no persisted GPS');
 }
 {
  const {context,page,errors}=await prepare(browser,{width:390,height:844},{saved:false});
  await page.locator('#welcome-sample').click();await page.locator('.stop-actions summary').first().click();
  page.once('dialog',dialog=>dialog.accept());await page.locator('.stop-menu button[aria-label^="Remove"]').first().click();assert.equal(await page.locator('.stop').count(),24);
  await page.locator('#project-duplicate').click();await page.locator('#project-create-form button[type=submit]').click();assert.equal(await page.locator('.stop').count(),24);assert.equal(await page.locator('.verify-season').count(),24);
  await page.locator('#project-new').click();await page.locator('#project-name').fill('Directory review');await page.locator('#project-holiday').selectOption('Halloween');await page.locator('#project-year').fill('2026');await page.locator('#project-create-form button[type=submit]').click();
  await page.locator('#directory-toggle').click();await page.waitForFunction(()=>document.querySelector('#directory-status').textContent.includes('31 catalog entries'));
  await page.locator('#directory-season').selectOption('Halloween');await page.locator('#directory-search').fill('Ritter');assert((await page.locator('.directory-row').count())>0);await page.locator('.directory-row input').first().check();await page.locator('#directory-review-selected').click();
  page.once('dialog',dialog=>dialog.accept());await page.locator('#directory-apply').click();assert.equal(await page.locator('.stop').count(),1);assert.equal(await page.locator('.verify-season').count(),1);
  await page.locator('#bulk-toggle').click();await page.locator('#website-url').fill('https://indywithkids.com/christmas-lights-list-indianapolis-central-indiana/');await page.locator('#website-load').click();assert.equal(await page.locator('.import-review-row').count(),12);assert.match(await page.locator('#bulk-preview').innerText(),/2025/);
  await page.locator('#import-mode').selectOption('replace');await page.locator('.import-review-row input[type=checkbox]').first().uncheck();page.once('dialog',dialog=>dialog.accept());await page.locator('#import-confirm').click();assert.equal(await page.locator('.stop').count(),11);
  assert.deepEqual(errors,[]);await context.close();pass('sample removal, next-season duplication, searchable directory review, historical website snapshot and confirmed replacement');
 }
 {
  const {context,page,control,errors}=await prepare(browser,{width:390,height:844});control.fail=true;await page.locator('#optimize').click();await page.locator('#estimate').waitFor({state:'visible'});await page.locator('#estimate').click();await page.waitForFunction(()=>!document.querySelector('#optimize').disabled);assert.match(await page.locator('#route-detail').innerText(),/NOT road-optimized/);assert.match(await page.locator('#metrics').innerText(),/Road time unavailable/);assert(await page.locator('#drive-start').isDisabled());assert.deepEqual(errors,[]);await context.close();pass('service outage: explicit rough ordering and no fabricated driving time');
 }
 // Superseded routing requests must not render into a changed trip.
 {
  const {context,page,control,errors}=await prepare(browser,{width:1366,height:900});control.geometryFail='distance';await optimize(page);
  assert.match((await textOrder(page))[0],/Public Library/);assert.match(await page.locator('#route-detail').innerText(),/matrix legs/);assert.equal(await page.locator('.route-choice button:disabled').count(),0);assert.equal(control.calls.filter(url=>url.includes('/route/')).length,2);assert.deepEqual(errors,[]);await context.close();pass('preferred geometry failure: distance order retained, comparison not misselected, no redundant failed draw request');
 }
 {
  const {context,page,control,errors}=await prepare(browser,{width:1366,height:900});control.delay=400;await page.locator('#optimize').click();await page.waitForFunction(()=>document.querySelector('#optimize').disabled);await page.locator('#mode').selectOption('duration');await page.waitForTimeout(600);assert(await page.locator('#results').isHidden());assert(await page.locator('#optimize').isEnabled());assert.deepEqual(errors,[]);await context.close();pass('interrupted routing: stale response cannot overwrite changed planning state');
 }
 for(const options of [{storageFail:true},{corrupt:true}]){
  const {context,page,errors}=await prepare(browser,{width:390,height:844},options);await page.locator('.stop-preferences button').first().click();assert(await page.locator('#storage-status').isVisible());if(options.corrupt)assert.equal(await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),'BROKEN JSON');assert.deepEqual(errors,[]);await context.close();pass(`storage ${options.corrupt?'corruption preserved':'quota failure announced persistently'}`);
 }
 {
  const {context,page,errors}=await prepare(browser,{width:390,height:844},{saved:false});assert(await page.locator('#welcome').isVisible());await page.locator('#welcome-own').click();await page.locator('#project-name').fill('Our Christmas outing');await page.locator('#project-holiday').selectOption('Christmas');await page.locator('#project-create-form button[type=submit]').click();assert(await page.locator('.empty-state').isVisible());assert.equal(await page.locator('#start-input').inputValue(),'');assert.deepEqual(errors,[]);await context.close();pass('first visit: custom holiday drive, empty state, no inherited Indianapolis endpoints');
 }
 // Actual service worker lifecycle (external network still blocked).
 {
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();let cdnCalls=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{const url=route.request().url();if(url.includes('/leaflet.js')){cdnCalls++;await route.fulfill(cdnCalls===1?{status:503,body:'Unavailable'}:{contentType:'text/javascript',body:`(${mapStub.toString()})();`});}else if(!url.startsWith(base)){await route.abort();}else await route.continue();});
  await page.goto(base);await page.waitForFunction(()=>!!window.L);assert.equal(cdnCalls,2);assert.deepEqual(errors,[]);await context.close();pass('map library alternate-CDN fallback in actual module application');
 }
 {
  swRelease='previous-release-test';const context=await browser.newContext({serviceWorkers:'allow'});await context.addInitScript(mapStub);await context.route(/https:\/\/.*/,route=>route.abort());
  const page=await context.newPage();await page.goto(base);await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.evaluate(()=>{localStorage.setItem('keep-this-project','unchanged');return caches.open('unrelated-cache').then(c=>c.put('/unrelated',new Response('keep')));});
  swRelease=currentShell;await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
  await page.waitForFunction(async name=> (await caches.keys()).includes(name),'glowroute-shell-'+currentShell);
  await page.locator('#update-notice').waitFor({state:'visible'});await page.reload();assert.equal(await page.evaluate(()=>localStorage.getItem('keep-this-project')),'unchanged');
  const keys=await page.evaluate(()=>caches.keys());assert(keys.includes('unrelated-cache'));assert(!keys.includes('glowroute-shell-previous-release-test'));
  failDirectory=true;const cached=await page.evaluate(async()=>{const r=await fetch('./directory/catalog.json');return r.headers.get('X-GlowRoute-Cached');});assert.equal(cached,'true');failDirectory=false;
  await context.setOffline(true);await page.reload();assert.match(await page.title(),/GlowRoute/);assert.equal(await page.evaluate(()=>localStorage.getItem('keep-this-project')),'unchanged');await context.close();pass('PWA: release update, cache cleanup scoped to GlowRoute, local data retained, marked cached directory, offline shell');
 }
 console.log(`All ${checks} browser scenario groups passed.`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
