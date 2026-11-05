/** Real-module Chromium integration tests. All external requests are deterministic mocks. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, extname, sep} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {EXPLORER_SNAPSHOT_URL} from '../source-paste.mjs';
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
 const groups=[];
 const close=()=>document.querySelectorAll('.mock-map-popup').forEach(el=>el.remove());
 window.__openRouteStop=id=>{const marker=groups.flatMap(g=>g.layers).find(m=>m.content?.dataset.stopId===id);if(!marker)throw Error('No mapped stop '+id);marker.openPopup();};
 window.L={map:()=>({setView(coords){window.__initialMapCenter=coords;return this;},on(type,fn){if(type==='click')window.__mapClick=fn;},closePopup:close,flyTo(){return this;},fitBounds(){return this;},invalidateSize(){window.__mapResizes=(window.__mapResizes||0)+1;return this;}}),control:{zoom:()=>({addTo(){}})},tileLayer:()=>({addTo(){}}),layerGroup:()=>{const group={layers:[],addTo(){return this;},clearLayers(){for(const marker of this.layers)marker.content?.parentElement?.classList.contains('mock-map-popup')&&marker.content.parentElement.remove();this.layers=[];},getLayers(){return this.layers;}};groups.push(group);return group;},marker:()=>({on(type,fn){this.events??={};this.events[type]=fn;return this;},getPopup(){return {update(){}};},bindPopup(content){this.content=content;return this;},addTo(group){group.layers.push(this);return this;},openPopup(){close();if(this.content instanceof HTMLElement){const wrapper=document.createElement('div');wrapper.className='mock-map-popup';wrapper.style.cssText='position:absolute;top:75px;left:12px;z-index:750;max-width:280px;background:#1b2434;padding:12px';wrapper.append(this.content);document.querySelector('#map').append(wrapper);}this.events?.popupopen?.();return this;}}),circleMarker:()=>({addTo(){return this;}}),divIcon:()=>({}),polyline:()=>({addTo(){return this;}}),latLngBounds:()=>({extend(){},isValid(){return false;},pad(){return this;}})};
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=text;}}});
};
const displays=Array.from({length:4},(_,i)=>({id:`demo${i+1}`,name:['Denver Art Museum','Colorado State Capitol','Denver Botanic Gardens','Denver Public Library'][i],address:['100 W 14th Avenue Pkwy, Denver, CO','200 E Colfax Ave, Denver, CO','1007 York St, Denver, CO','10 W 14th Ave Pkwy, Denver, CO'][i],lat:39.73+.001*(i+1),lon:-104.95+.001*(i+1),approved:true,geoSource:'manual',rating:3,mustSee:i===0,visitNotes:'PRIVATE NOTE'}));
const fixture=()=>({activeId:'t1',projects:[{id:'t1',name:'Denver example drive',holiday:'Christmas',year:2026,state:{displays:structuredClone(displays),selected:displays.map(d=>d.id),start:'Private start',end:'Private finish',mode:'distance',preset:'custom',endpoints:{start:{address:'Private start',lat:39.73,lon:-104.95},end:{address:'Private finish',lat:39.735,lon:-104.945}},cache:{}}}]});
const indices=url=>url.split('/driving/')[1].split('?')[0].split(';').map(p=>Math.round((Number(p.split(',')[1])-39.73)*1000));
const time=(i,j)=>i===j?0:j>i?(j-i)*60:(i-j)*600;
const distance=(i,j)=>i===j?0:(i===0&&j===4||i===1&&j===5||i>j&&i<5&&j>0)?100:3000;
async function prepare(browser,viewport,{saved=true,storageFail=false,corrupt=false,touch=false,mapFail=false,data=fixture()}={}){
 const context=await browser.newContext({viewport,hasTouch:touch,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const control={fail:false,geometryFail:false,delay:0,calls:[],gpsCalls:0,importDelay:0,snapshotCalls:0,snapshotFail:false};
 if(!mapFail)await context.addInitScript(mapStub);
 await context.addInitScript(({saved,storageFail,corrupt,data})=>{
  if(!sessionStorage.getItem('test-initialized')){
   localStorage.clear();if(saved)localStorage.setItem('glowroute:projects:v2',corrupt?'BROKEN JSON':JSON.stringify(data));sessionStorage.setItem('test-initialized','1');
  }
  if(storageFail)Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError');};
 },{saved,storageFail,corrupt,data});
 await context.route('**/*',async route=>{
  const url=route.request().url();
  if(url===EXPLORER_SNAPSHOT_URL){control.snapshotCalls++;await route.fulfill(control.snapshotFail?{status:503,body:'Unavailable'}:{json:[{id:'old-christmas',name:'Explorer archive fixture',address:'999 Example Rd, Denver, CO',season:'Christmas',year:2025,lastImported:'2026-10-22',sources:[{name:'Permitted test provider',url:'https://example.org/archive',recordId:'old-christmas'}]},{id:'city',name:'Explorer city fixture',town:'Denver',address:'',season:'Halloween',year:2026,sources:[{name:'Permitted test provider',url:'https://example.org/city',recordId:'city'}]}]});return;}
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
 await page.goto(base);await page.locator('#workflow-nav').waitFor();
 return {context,page,control,errors};
}
async function stage(page,name){const tab=page.locator(`#workflow-${name}`);if(await tab.getAttribute('aria-selected')!=='true')await tab.click();assert(await page.locator(`#stage-${name}`).isVisible());}
async function details(page,id){const disclosure=page.locator(`#${id}`);if(await disclosure.getAttribute('open')===null)await disclosure.locator(':scope > summary').click();}
async function planDisplays(page){await stage(page,'plan');await details(page,'plan-displays');}
async function browse(page){await stage(page,'discover');if(await page.locator('#directory-panel').getAttribute('class').then(value=>value.includes('hidden')))await page.locator('#directory-toggle').click();}
async function bulk(page){await stage(page,'discover');if(await page.locator('#bulk-panel').getAttribute('class').then(value=>value.includes('hidden')))await page.locator('#bulk-toggle').click();}
async function importSource(page){await stage(page,'discover');await details(page,'import-source-details');}
async function directoryMore(page){await stage(page,'discover');await details(page,'directory-more');}
async function shareDetails(page){await stage(page,'drive');await details(page,'share-details');}
async function optimize(page){await stage(page,'plan');await page.locator('#optimize').click();await page.waitForFunction(()=>!document.querySelector('#optimize').disabled);assert(await page.locator('#stage-drive').isVisible(),await page.locator('#status').innerText());assert(await page.locator('#results').isVisible(),await page.locator('#status').innerText());}
async function textOrder(page){return page.locator('.itinerary-label').allTextContents();}
async function editOnMap(page){if(await page.locator('body').evaluate(b=>b.classList.contains('editing-map')))await page.locator('#map-edit-back').click();await stage(page,'drive');await page.locator('#edit-on-map').click();}
async function routeIds(page){return page.locator('.itinerary-row').evaluateAll(rows=>rows.map(row=>row.dataset.stopId));}
async function addToRoute(page){await stage(page,'drive');if(await page.locator('#route-add-form').isHidden())await page.locator('#route-add-toggle').click();}
async function endDrive(page){await details(page,'drive-more');await page.locator('#drive-end').click();}
async function navigationEnds(page){return page.locator('#nav-buttons a').evaluateAll(nodes=>['maps.apple.com','www.google.com'].map(host=>{const urls=nodes.map(n=>new URL(n.href)).filter(u=>u.hostname===host);return [urls[0].searchParams.get('origin')||urls[0].searchParams.get('source'),urls.at(-1).searchParams.get('destination')];}));}
let checks=0;
function pass(message){checks++;console.log(`PASS ${message}`);}
const browser=await chromium.launch({headless:true,...(process.env.GLOWROUTE_BROWSER_EXECUTABLE?{executablePath:process.env.GLOWROUTE_BROWSER_EXECUTABLE}:{})});
console.log(`Browser engine: ${browser.version()}`);
try{
 for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
  const {context,page,control,errors}=await prepare(browser,viewport);await stage(page,'plan');await page.locator('#mode').selectOption('duration');await optimize(page);
  const row=()=>page.locator('.itinerary-row[data-stop-id="demo2"]'),order=await routeIds(page),saved=await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),calls=control.calls.length;
  await row().getByRole('button',{name:'Show Colorado State Capitol on map',exact:true}).click();assert.equal(await page.locator('.map-stop-popup').getAttribute('data-stop-id'),'demo2');assert(await page.locator('body').evaluate(el=>el.classList.contains('editing-map')));
  assert(await row().evaluate(el=>el.classList.contains('selected-stop')));assert.equal(await row().locator('.itinerary-label').getAttribute('aria-pressed'),'true');
  await page.locator('.map-stop-popup [data-map-action="itinerary"]').click();assert(await page.locator('#stage-drive').isVisible());assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('editing-map')),false);assert(await row().isVisible());assert.equal(await page.evaluate(()=>document.activeElement.closest('.itinerary-row')?.dataset.stopId),'demo2');
  assert.deepEqual(await routeIds(page),order);assert.equal(await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),saved);assert.equal(control.calls.length,calls);
  await row().getByRole('button',{name:'Move Colorado State Capitol later',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#optimize').disabled);assert(await row().evaluate(el=>el.classList.contains('selected-stop')));assert.equal(await row().locator('.itinerary-label').getAttribute('aria-pressed'),'true');
  await row().locator('.itinerary-label').click();assert.equal(await page.locator('.map-stop-popup').getAttribute('data-stop-id'),'demo2');await page.locator('.map-stop-popup [data-map-action="itinerary"]').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await context.close();pass(`${viewport.width}px: itinerary/map selection links by stable display ID, survives reorder and never changes saved data or requests routes just to select`);
 }
 for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
  const {context,page,control,errors}=await prepare(browser,viewport);await planDisplays(page);await page.locator('.stop input[type=checkbox]').nth(3).uncheck();await optimize(page);
  const order=await routeIds(page),ends=await navigationEnds(page),tables=control.calls.filter(url=>url.includes('/table/')).length;await addToRoute(page);await page.locator('#route-add-saved').selectOption('demo4');await page.locator('#route-add-position').selectOption('1');await page.locator('#route-add-submit').click();
  await page.waitForFunction(()=>document.querySelectorAll('.itinerary-row').length===4&&!document.querySelector('#optimize').disabled);assert.deepEqual(await routeIds(page),[order[0],'demo4',...order.slice(1)]);assert.deepEqual(await navigationEnds(page),ends);assert.equal(control.calls.filter(url=>url.includes('/table/')).length,tables+1);
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('glowroute:projects:v2')).projects[0].state);assert.equal(state.displays.length,4);assert(state.selected.includes('demo4'));assert.equal(state.displays.find(display=>display.id==='demo4').visitNotes,'PRIVATE NOTE');assert.match(await page.locator('#route-detail').innerText(),/Manually arranged/);
  await page.locator('#drive-start').click();assert(await page.locator('#route-add-form').isHidden());assert(await page.locator('#route-add-toggle').isHidden()||await page.locator('#route-add-toggle').isDisabled());await endDrive(page);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await context.close();pass(`${viewport.width}px: insert an excluded saved stop at the chosen position while preserving order, fixed endpoints, saved notes and Live Drive safety`);
 }
 {
  const data=fixture();data.projects[0].state.cache['1200 broadway, denver, co']={lat:39.736,lon:-104.944,source:'OpenStreetMap'};
  const {context,page,control,errors}=await prepare(browser,{width:390,height:844},{data});await optimize(page);const order=await routeIds(page),ends=await navigationEnds(page);
  await addToRoute(page);await page.locator('#route-add-saved').selectOption('');await page.locator('#route-add-name').fill('Public History Museum');await page.locator('#route-add-address').fill('1200 Broadway, Denver, CO');await page.locator('#route-add-position').selectOption('0');await page.locator('#route-add-submit').click();
  await page.waitForFunction(()=>document.querySelectorAll('.itinerary-row').length===5&&!document.querySelector('#optimize').disabled);const inserted=(await routeIds(page))[0];assert.deepEqual((await routeIds(page)).slice(1),order);assert.deepEqual(await navigationEnds(page),ends);
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('glowroute:projects:v2')).projects[0].state);assert.equal(state.displays.find(display=>display.id===inserted).name,'Public History Museum');assert.equal(state.displays.length,5);assert(state.selected.includes(inserted));
  await addToRoute(page);await page.locator('#route-add-saved').selectOption('');await page.locator('#route-add-name').fill('Duplicate name');await page.locator('#route-add-address').fill('1200 Broadway, Denver, CO');const saved=await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),calls=control.calls.length;
  await page.locator('#route-add-submit').click();assert.equal(await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),saved);assert.equal(control.calls.length,calls);assert.equal(await page.locator('.itinerary-row').count(),5);assert.match(await page.locator('#route-add-status').innerText(),/already|duplicate/i);
  await page.locator('#route-add-cancel').click();assert(await page.locator('#route-add-form').isHidden());assert.deepEqual(errors,[]);await context.close();pass('custom route insertion keeps the old order and endpoints, stores only a successful addition and rejects duplicate addresses without a request');
 }
 {
  const {context,page,control,errors}=await prepare(browser,{width:390,height:844});await planDisplays(page);await page.locator('.stop input[type=checkbox]').nth(3).uncheck();await optimize(page);const order=await routeIds(page),saved=await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2'));
  await addToRoute(page);await page.locator('#route-add-saved').selectOption('demo4');control.fail=true;await page.locator('#route-add-submit').click();await page.waitForFunction(()=>!document.querySelector('#optimize').disabled);
  assert.deepEqual(await routeIds(page),order);assert.equal(await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),saved);assert(await page.locator('#route-add-form').isVisible());assert.match(await page.locator('#route-add-status').innerText(),/could not|unavailable|failed|unchanged/i);
  control.fail=false;await page.locator('#route-add-submit').click();await page.waitForFunction(()=>document.querySelectorAll('.itinerary-row').length===4&&!document.querySelector('#optimize').disabled);assert.deepEqual(errors,[]);await context.close();pass('failed insertion is atomic for itinerary and saved displays, keeps its review form and supports retry');
 }
 {
  const {context,page,control,errors}=await prepare(browser,{width:390,height:844});await planDisplays(page);await page.locator('.stop input[type=checkbox]').nth(3).uncheck();await optimize(page);await addToRoute(page);await page.locator('#route-add-saved').selectOption('demo4');control.delay=350;
  const started=page.waitForRequest(request=>request.url().includes('/table/'));await page.locator('#route-add-submit').click();await started;await page.locator('#project-new').click();await page.locator('#project-name').fill('Unrelated outing');await page.locator('#project-create-form button[type=submit]').click();await page.waitForTimeout(700);
  assert.equal(await page.locator('.stop').count(),0);assert(await page.locator('#results').isHidden());assert(await page.locator('#route-add-form').isHidden());const portfolio=await page.evaluate(()=>JSON.parse(localStorage.getItem('glowroute:projects:v2')));assert(!portfolio.projects.find(project=>project.id==='t1').state.selected.includes('demo4'));
  assert.match(await page.locator('#status').innerText(),/Created Unrelated outing/);assert.deepEqual(errors,[]);await context.close();pass('an interrupted insertion cannot add a stop to either the old project or a newly chosen project');
 }
 {
  const {context,page,control,errors}=await prepare(browser,{width:390,height:844});await planDisplays(page);await page.locator('.stop input[type=checkbox]').nth(3).uncheck();control.fail=true;await page.locator('#optimize').click();await page.locator('#estimate').waitFor({state:'visible'});await page.locator('#estimate').click();await page.waitForFunction(()=>!document.querySelector('#optimize').disabled);
  const order=await routeIds(page),calls=control.calls.length;await addToRoute(page);await page.locator('#route-add-saved').selectOption('demo4');await page.locator('#route-add-position').selectOption('1');await page.locator('#route-add-submit').click();await page.waitForFunction(()=>document.querySelectorAll('.itinerary-row').length===4);
  assert.deepEqual(await routeIds(page),[order[0],'demo4',...order.slice(1)]);assert.equal(control.calls.length,calls);assert.match(await page.locator('#route-detail').innerText(),/NOT road-optimized/);assert.match(await page.locator('#metrics').innerText(),/Road time unavailable/);assert(await page.locator('#drive-start').isDisabled());assert.deepEqual(errors,[]);await context.close();pass('rough-route insertion preserves geographic ordering labels and never invents a driving time or calls the unavailable router');
 }
 {
  const {context,page,errors}=await prepare(browser,{width:390,height:844});await optimize(page);await addToRoute(page);await page.locator('#route-add-saved').selectOption('');await page.locator('#route-add-name').fill('Unresolved display');await page.locator('#route-add-address').fill('not an address');
  await page.route(/^https:\/\/nominatim\.openstreetmap\.org\/search\?/,route=>route.fulfill({json:[]}));const saved=await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),order=await routeIds(page);await page.locator('#route-add-submit').click();await page.waitForFunction(()=>!document.querySelector('#optimize').disabled);
  assert.equal(await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),saved);assert.deepEqual(await routeIds(page),order);assert.match(await page.locator('#route-add-status').innerText(),/address|location|valid|could not/i);assert.deepEqual(errors,[]);await context.close();pass('an invalid or unresolved custom address cannot partially change the route or saved displays');
 }
 {
  const {context,page,control,errors}=await prepare(browser,{width:390,height:844});await planDisplays(page);await page.locator('.stop input[type=checkbox]').nth(3).uncheck();await optimize(page);await addToRoute(page);await page.locator('#route-add-saved').selectOption('demo4');const order=await routeIds(page),saved=await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2'));control.delay=350;
  const started=page.waitForRequest(request=>request.url().includes('/table/'));await page.locator('#route-add-submit').click();await started;await page.locator('#route-add-cancel').click();await page.waitForFunction(()=>!document.querySelector('#optimize').disabled);await page.waitForTimeout(450);
  assert(await page.locator('#route-add-form').isHidden());assert.deepEqual(await routeIds(page),order);assert.equal(await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),saved);assert(await page.locator('#route-add-toggle').isEnabled());assert.deepEqual(errors,[]);await context.close();pass('canceling a pending insertion restores controls and prevents a late response from changing itinerary or saved data');
 }
 {
  const {context,page,errors}=await prepare(browser,{width:390,height:844});await optimize(page);await addToRoute(page);await page.locator('#route-add-saved').selectOption('');await page.locator('#route-add-name').fill('Ambiguous display');await page.locator('#route-add-address').fill('123 Example Road, Denver, CO');
  await page.route(/^https:\/\/nominatim\.openstreetmap\.org\/search\?/,route=>route.fulfill({json:[{lat:'39.736',lon:'-104.944',display_name:'First match'},{lat:'39.737',lon:'-104.943',display_name:'Second match'}]}));const order=await routeIds(page),saved=await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2'));await page.locator('#route-add-submit').click();await page.waitForFunction(()=>!document.querySelector('#optimize').disabled);
  assert.deepEqual(await routeIds(page),order);assert.equal(await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),saved);assert.match(await page.locator('#route-add-status').innerText(),/Several locations|multiple|ambiguous/i);assert.deepEqual(errors,[]);await context.close();pass('ambiguous custom addresses require clarification without persisting geocodes, partial displays or route changes');
 }
 {
  const data=fixture();for(let i=4;i<70;i++)data.projects[0].state.displays.push({id:`extra${i}`,name:`Public fixture ${i}`,address:`${100+i} Public St, Denver, CO`,lat:39.736+i*.00001,lon:-104.944,geoSource:'manual',approved:true});data.projects[0].state.selected=data.projects[0].state.displays.slice(0,3).map(display=>display.id);
  const {context,page,control,errors}=await prepare(browser,{width:390,height:844},{data});await optimize(page);await addToRoute(page);await page.locator('#route-add-saved').selectOption('');await page.locator('#route-add-name').fill('Over capacity');await page.locator('#route-add-address').fill('39.738,-104.943');const saved=await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),calls=control.calls.length;await page.locator('#route-add-submit').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),saved);assert.equal(control.calls.length,calls);assert.equal(await page.locator('.itinerary-row').count(),3);assert.match(await page.locator('#route-add-status').innerText(),/70|limit|capacity/i);assert.deepEqual(errors,[]);await context.close();pass('a custom addition cannot exceed 70 saved displays, even when the current route is small');
  data.projects[0].state.selected=data.projects[0].state.displays.slice(0,68).map(display=>display.id);const full=await prepare(browser,{width:1366,height:900},{data});await optimize(full.page);assert.equal(await full.page.locator('.itinerary-row').count(),68);assert(await full.page.locator('#route-add-toggle').isDisabled());assert.deepEqual(full.errors,[]);await full.context.close();pass('a 68-display itinerary disables further insertion before any additional routing request');
 }
 for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
  const {context,page,errors}=await prepare(browser,viewport);await optimize(page);await page.locator('#drive-start').click();assert(await page.locator('#drive-retry').isHidden());assert(await page.locator('#drive-undo').isHidden());assert(await page.locator('#drive-gps').isHidden());assert(await page.locator('#drive-end').isHidden());
  const more=page.locator('#drive-more > summary');await more.focus();await more.press('Enter');assert(await page.locator('#drive-gps').isVisible());assert(await page.locator('#drive-end').isVisible());await more.press('Enter');assert(await page.locator('#drive-end').isHidden());
  const previous=await page.evaluate(()=>JSON.parse(localStorage.getItem('glowroute:projects:v2')).projects[0].state.drive),target=previous.remainingIds[0],name=displays.find(display=>display.id===target).name;
  await page.locator('#drive-rating label').nth(4).click();await page.locator('#drive-visited').click();await page.waitForFunction(()=>!document.querySelector('#drive-visited').disabled);assert(await page.locator('#drive-undo').isVisible());
  await page.locator('#drive-full').click();await planDisplays(page);let stop=page.locator('.stop').filter({has:page.locator('.stop-title',{hasText:name})});await stop.locator('.rating-select').selectOption('4');await stop.locator('.stop-preferences button').first().click();await stop.locator('.stop-actions > summary').click();page.once('dialog',dialog=>dialog.accept('Changed after visiting'));await stop.getByRole('button',{name:'Notes',exact:true}).click();
  await stage(page,'drive');await page.locator('#drive-undo').click();await page.waitForFunction(()=>!document.querySelector('#optimize').disabled);const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('glowroute:projects:v2')).projects[0].state),item=restored.displays.find(display=>display.id===target);
  assert.deepEqual(restored.drive.remainingIds,previous.remainingIds);assert.equal(restored.drive.anchorId,previous.anchorId);for(const field of ['visited','visitedAt','skipped'])assert.equal(Object.hasOwn(item,field),false);assert.equal(item.rating,4);assert.equal(item.favorite,true);assert.equal(item.visitNotes,'Changed after visiting');assert.equal(await page.locator('#drive-feedback').getAttribute('data-display-id'),target);assert(await page.locator('#drive-undo').isHidden());assert(await page.locator('#drive-retry').isHidden());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await endDrive(page);assert.deepEqual(errors,[]);await context.close();pass(`${viewport.width}px: healthy Live Drive shows primary actions, keyboard More reveals secondary actions, visit undo restores the stop/status while preserving later rating/favorite/note edits`);
 }
 {
  const {context,page,control,errors}=await prepare(browser,{width:390,height:844});await optimize(page);await page.locator('#drive-start').click();const order=await routeIds(page),session=await page.evaluate(()=>JSON.parse(localStorage.getItem('glowroute:projects:v2')).projects[0].state.drive);
  control.delay=350;const started=page.waitForRequest(request=>request.url().includes('/table/'));await page.locator('#drive-skip').click();await started;assert(await page.locator('#drive-undo').isVisible());assert(await page.locator('#drive-undo').isEnabled());await page.locator('#drive-undo').click();await page.waitForFunction(()=>!document.querySelector('#drive-visited').disabled);await page.waitForTimeout(450);
  const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('glowroute:projects:v2')).projects[0].state);assert.deepEqual(restored.drive.remainingIds,session.remainingIds);assert.deepEqual(await routeIds(page),order);assert.equal(Object.hasOwn(restored.displays.find(display=>display.id===session.remainingIds[0]),'skipped'),false);assert(await page.locator('#drive-retry').isHidden());assert(await page.locator('#drive-undo').isHidden());
  await endDrive(page);assert.deepEqual(errors,[]);await context.close();pass('undo remains available during rerouting and a delayed skipped-route response cannot replace the restored itinerary');
 }
 {
  const {context,page,control,errors}=await prepare(browser,{width:390,height:844});await optimize(page);await page.locator('#drive-start').click();const previous=await page.evaluate(()=>JSON.parse(localStorage.getItem('glowroute:projects:v2')).projects[0].state.drive);control.fail=true;await page.locator('#drive-skip').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Could not reroute'));
  assert(await page.locator('#drive-retry').isVisible());assert(await page.locator('#drive-undo').isEnabled());await page.locator('#drive-undo').click();await page.waitForFunction(()=>!document.querySelector('#drive-visited').disabled);assert.deepEqual((await page.evaluate(()=>JSON.parse(localStorage.getItem('glowroute:projects:v2')).projects[0].state.drive)).remainingIds,previous.remainingIds);assert(await page.locator('#drive-retry').isHidden());assert(await page.locator('#drive-undo').isHidden());
  await endDrive(page);assert.deepEqual(errors,[]);await context.close();pass('after a failed skip reroute, undo restores the prior valid itinerary and clears the recovery-only Retry action without another request');
 }
 {
  const {context,page,errors}=await prepare(browser,{width:390,height:844});await planDisplays(page);for(let i=1;i<4;i++)await page.locator('.stop input[type=checkbox]').nth(i).uncheck();await optimize(page);await page.locator('#drive-start').click();const session=await page.evaluate(()=>JSON.parse(localStorage.getItem('glowroute:projects:v2')).projects[0].state.drive);
  await page.locator('#drive-visited').click();await page.waitForFunction(()=>document.querySelector('#drive-current').textContent.includes('All displays completed'));assert(await page.locator('#drive-undo').isVisible());await page.locator('#drive-undo').click();await page.waitForFunction(()=>!document.querySelector('#drive-visited').disabled);
  assert.deepEqual((await page.evaluate(()=>JSON.parse(localStorage.getItem('glowroute:projects:v2')).projects[0].state.drive)).remainingIds,session.remainingIds);assert.equal(await page.locator('.itinerary-row').count(),1);assert(await page.locator('#drive-feedback').isVisible());assert(await page.locator('#drive-undo').isHidden());await endDrive(page);assert.deepEqual(errors,[]);await context.close();pass('undo also restores the last visited display after completion has cleared the saved session');
 }
 {
  const {context,page,errors}=await prepare(browser,{width:390,height:844});await page.locator('details[aria-label="Optional time budget"] summary').click();await page.locator('#budget-enabled').check();await page.locator('#budget-minutes').fill('90');await page.locator('details[aria-label="Optional visit schedule"] summary').click();await page.locator('#departure').fill('2026-12-20T18:00');await page.locator('#departure-zone').fill('America/Denver');await page.locator('#departure-zone').press('Tab');await optimize(page);assert.equal(await page.locator('.itinerary-row').count(),4);await page.locator('#drive-start').click();
  const id=await page.locator('#drive-feedback').getAttribute('data-display-id'),name=displays.find(display=>display.id===id).name;
  await page.locator('#drive-visited').click();await page.waitForFunction(()=>!document.querySelector('#drive-visited').disabled);await page.locator('#drive-full').click();await planDisplays(page);const stop=()=>page.locator('.stop').filter({has:page.locator('.stop-title',{hasText:name})});await stop().locator('.stop-actions > summary').click();await stop().locator('input[type=number]').fill('12');await stop().locator('input[type=number]').press('Tab');
  await stage(page,'drive');await page.locator('#drive-undo').click();await page.waitForFunction(()=>!document.querySelector('#drive-visited').disabled);assert.match(await page.locator('#schedule-summary').innerText(),/24 min viewing/);assert.match(await page.locator('#route-detail').innerText(),/24 min viewing/);
  await planDisplays(page);await stop().locator('.stop-actions > summary').click();await stop().locator('input[type=number]').fill('7');await stop().locator('input[type=number]').press('Tab');await stage(page,'drive');assert.match(await page.locator('#schedule-summary').innerText(),/19 min viewing/);assert.match(await page.locator('#route-detail').innerText(),/19 min viewing/);
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('glowroute:projects:v2')).projects[0].state);assert.equal(state.displays.find(display=>display.id===id).viewingOverride,7);await endDrive(page);assert.deepEqual(errors,[]);await context.close();pass('Live Drive undo rebinds saved display identities so viewing edits before and after undo update both schedule and restored budget totals');
 }
 // Fast iteration may target the new scenarios; CI always runs the full suite.
 if(!process.env.GLOWROUTE_BROWSER_NEW_ONLY){
 for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
  const {context,page,control,errors}=await prepare(browser,viewport),requests=[];
  assert.equal(await page.locator('#workflow-plan').getAttribute('aria-selected'),'true');assert.deepEqual(await page.evaluate(()=>window.__initialMapCenter),[39.73,-104.95]);
  const saved=await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2'));
  await page.evaluate(()=>{window.__workflowWrites=[];const write=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(this===localStorage)window.__workflowWrites.push(key);return write.call(this,key,value);};});
  page.on('request',request=>requests.push(request.url()));
  await page.locator('#workflow-plan').focus();
  for(const [key,name] of [['ArrowLeft','discover'],['ArrowRight','plan'],['End','drive'],['Home','discover']]){
   await page.keyboard.press(key);assert.equal(await page.locator(`#workflow-${name}`).getAttribute('aria-selected'),'true');
   assert.equal(await page.evaluate(()=>document.activeElement.id),`workflow-${name}`);
   for(const other of ['discover','plan','drive']){
    assert.equal(await page.locator(`#stage-${other}`).evaluate(el=>el.hidden),other!==name);
    assert.equal(await page.locator(`#workflow-${other}`).getAttribute('tabindex'),other===name?'0':'-1');
   }
   assert(await page.locator('#status').isVisible());assert(await page.locator('#project-picker').isVisible());
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await stage(page,'plan');const heading=await page.locator('#plan-heading').boundingBox(),nav=await page.locator('#workflow-nav').boundingBox();
  assert(heading.y+1>=nav.y+nav.height,'stage heading remains below the sticky workflow navigation');
  if(viewport.width>850){const topbar=await page.locator('.topbar').boundingBox();assert(topbar.y>=-1&&topbar.y+topbar.height<=viewport.height,'desktop stage navigation preserves the page header');}
  assert.equal(await page.locator('#plan-displays').getAttribute('open'),null);assert.equal(await page.locator('#project-tools').getAttribute('open'),null);
  assert.equal(await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),saved);assert.deepEqual(await page.evaluate(()=>window.__workflowWrites),[]);
  assert.deepEqual(requests,[]);assert.equal(control.calls.length,0);assert.equal(control.snapshotCalls,0);assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('driving')),false);
  assert.deepEqual(errors,[]);await context.close();pass(`${viewport.width}px: keyboard stage tabs, one visible pane, progressive disclosure, no background requests/storage writes and no horizontal overflow`);
 }
 {
  const {context,page,errors}=await prepare(browser,{width:390,height:844});await bulk(page);
  await page.locator('#bulk-text').fill('First display — 301 New St, Portland, OR\nSecond display — 302 New St, Portland, OR');await page.locator('#import-preview').click();
  const name=page.locator('.import-review-row').first().locator('input[aria-label^="Display name"]');await name.fill('My reviewed label');await page.locator('.import-review-row').nth(1).locator('input[type=checkbox]').uncheck();
  const saved=await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),paste=await page.locator('#bulk-text').inputValue();
  await stage(page,'plan');await stage(page,'drive');await stage(page,'discover');
  assert.equal(await name.inputValue(),'My reviewed label');assert.equal(await page.locator('.import-review-row').nth(1).locator('input[type=checkbox]').isChecked(),false);assert.equal(await page.locator('#bulk-text').inputValue(),paste);
  assert.equal(await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),saved);
  await page.locator('#import-confirm').click();assert(await page.locator('#stage-plan').isVisible());assert.equal(await page.locator('.stop').count(),5);
  assert.deepEqual(errors,[]);await context.close();pass('switching stages preserves edited import previews and typed input; applying reviewed displays continues to Plan');
 }
 {
  const {context,page,control,errors}=await prepare(browser,{width:390,height:844});control.importDelay=250;await bulk(page);await importSource(page);
  await page.locator('#website-url').fill('https://listing.example.test/displays');const saved=await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2'));
  const started=page.waitForRequest('https://listing.example.test/displays');await page.locator('#website-load').click();await started;await stage(page,'plan');
  await page.waitForFunction(()=>document.querySelectorAll('.import-review-row').length===1);assert(await page.locator('#stage-plan').isVisible());assert.equal(await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),saved);
  await stage(page,'discover');assert(await page.locator('.import-review-row').isVisible());assert.match(await page.locator('.import-review-row input[aria-label^="Display name"]').inputValue(),/Late display/);
  assert.deepEqual(errors,[]);await context.close();pass('switching stages keeps a pending website import alive without applying data or stealing the chosen view');
 }
 {
  const {context,page,control,errors}=await prepare(browser,{width:390,height:844});control.delay=250;
  const started=page.waitForRequest(request=>request.url().includes('/table/'));await page.locator('#optimize').click();await started;await stage(page,'discover');
  await page.waitForFunction(()=>!document.querySelector('#optimize').disabled);assert(await page.locator('#stage-discover').isVisible());assert.equal(await page.locator('.itinerary-row').count(),4);
  assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('driving')),false);await stage(page,'drive');assert(await page.locator('#results').isVisible());assert(await page.locator('#drive-start').isEnabled());
  assert.deepEqual(errors,[]);await context.close();pass('pending optimization respects a later stage choice while keeping the completed route available without starting Live Drive');
 }
 {
  const {context,page,control,errors}=await prepare(browser,{width:390,height:844});await optimize(page);await page.locator('#drive-start').click();
  await page.locator('#drive-note-details summary').click();await page.locator('#drive-notes').fill('Resume this private memory');await page.reload();control.fail=true;
  await page.locator('#drive-resume').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Could not reroute'));
  assert(await page.locator('#stage-drive').isVisible());assert(await page.locator('#drive-retry').isVisible());assert(await page.locator('#drive-retry').isEnabled());await details(page,'drive-more');assert(await page.locator('#drive-end').isVisible());assert(await page.locator('#drive-end').isEnabled());
  assert.equal(await page.locator('#drive-notes').inputValue(),'Resume this private memory');assert.match(await page.locator('#drive-current').innerText(),/4 remaining/);assert.equal(await page.locator('#metrics .metric').count(),0);
  control.fail=false;await page.locator('#drive-retry').click();await page.waitForFunction(()=>!document.querySelector('#drive-visited').disabled);await endDrive(page);
  assert.deepEqual(errors,[]);await context.close();pass('resume during road-service outage exposes Retry/End and preserves remaining stops and rider feedback; retry recovers');
 }
 {
  const {context,page,errors}=await prepare(browser,{width:390,height:844});await optimize(page);await page.locator('#drive-start').click();
  await page.evaluate(()=>{const saved=JSON.parse(localStorage.getItem('glowroute:projects:v2'));const state=saved.projects.find(project=>project.id===saved.activeId).state;delete state.endpoints.start;state.cache={};localStorage.setItem('glowroute:projects:v2',JSON.stringify(saved));});
  await page.route(/^https:\/\/nominatim\.openstreetmap\.org\/search\?/,async route=>{await new Promise(resolve=>setTimeout(resolve,350));await route.fulfill({json:[{lat:'39.73',lon:'-104.95',display_name:'Saved starting point'}]});});
  await page.reload();const requested=page.waitForRequest(request=>request.url().startsWith('https://nominatim.openstreetmap.org/search?'));await page.locator('#drive-resume').click();await requested;await stage(page,'discover');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Rerouted 4 remaining'));assert(await page.locator('#stage-discover').isVisible());assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('driving')),false);
  await stage(page,'drive');await details(page,'drive-more');assert(await page.locator('#drive-end').isVisible());await endDrive(page);assert.deepEqual(errors,[]);await context.close();pass('delayed resume geocoding respects a newer stage choice while restoring the session and keeping controls reachable');
 }
 {
  const {context,page,errors}=await prepare(browser,{width:390,height:844});await planDisplays(page);await page.locator('.stop-actions summary').first().click();await page.locator('.stop-menu button[title="Place or correct this stop on the map"]').first().click();
  assert(await page.locator('#pin-toolbar').isVisible());await page.locator('#map-edit-back').click();assert(await page.locator('#stage-plan').isVisible());assert.equal(await page.locator('#pin-toolbar').count(),0);
  await optimize(page);await editOnMap(page);await page.locator('#map-edit-back').click();assert(await page.locator('#stage-drive').isVisible());
  assert.deepEqual(errors,[]);await context.close();pass('map editing returns to the invoking Plan or Drive stage and cancels unfinished pin placement');
 }
 {
  const {context,page,control,errors}=await prepare(browser,{width:390,height:844});await optimize(page);
  control.delay=350;await editOnMap(page);const started=page.waitForRequest(r=>r.url().includes('/route/'));await page.locator('.map-stop-popup').getByRole('button',{name:'Move later'}).click();await started;
  await page.locator('#map-edit-back').click();await page.waitForFunction(()=>!document.querySelector('#optimize').disabled);
  assert.equal(await page.locator('body').evaluate(b=>b.classList.contains('editing-map')),false);assert(await page.locator('.controls').isVisible());
  control.delay=0;await editOnMap(page);await page.locator('.map-stop-popup').getByRole('button',{name:'Adjust map pin'}).click();
  const before=await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2'));
  await page.evaluate(()=>window.__mapClick({latlng:{lat:95,lng:181}}));assert.match(await page.locator('#pin-instructions').innerText(),/Invalid map location/);
  await page.locator('#pin-toolbar').getByRole('button',{name:'Save pin'}).click();assert.equal(await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),before);
  await page.evaluate(()=>window.__mapClick({latlng:{lat:39.73,lng:181}}));await page.locator('#pin-toolbar').getByRole('button',{name:'Save pin'}).click();await page.waitForFunction(()=>!document.querySelector('#optimize').disabled);
  const displays=await page.evaluate(()=>JSON.parse(localStorage.getItem('glowroute:projects:v2')).projects[0].state.displays);assert(displays.some(d=>d.lon===-179));assert.deepEqual(errors,[]);await context.close();pass('late map edit cannot reopen the editor after Back; invalid pins are rejected and wrapped longitude saves canonically');
 }
 {
  const {context,page,errors}=await prepare(browser,{width:390,height:844},{mapFail:true});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Could not load the map library'));await optimize(page);
  assert(await page.locator('#edit-on-map').isDisabled());assert.match(await page.locator('#edit-on-map').getAttribute('title'),/Map unavailable/);assert.equal(await page.locator('body').evaluate(b=>b.classList.contains('editing-map')),false);
  assert.equal(await page.locator('.itinerary-row').count(),4);assert.deepEqual(errors,[]);await context.close();pass('unavailable map library keeps itinerary usable and disables entry to map-only editing');
 }
 for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
  const {context,page,control,errors}=await prepare(browser,viewport);
  const project=async()=>page.evaluate(()=>JSON.parse(localStorage.getItem('glowroute:projects:v2')).projects[0].state);
  const open=async id=>{await page.evaluate(id=>window.__openRouteStop(id),id);return page.locator('.map-stop-popup');};
  await stage(page,'plan');await page.locator('details[aria-label="Optional visit schedule"] summary').click();await page.locator('#departure').fill('2026-12-20T18:00');await page.locator('#departure-zone').fill('America/Denver');await page.locator('#departure-zone').press('Tab');
  await stage(page,'plan');await page.locator('#mode').selectOption('duration');await optimize(page);
  const before=await textOrder(page),tableCalls=()=>control.calls.filter(u=>u.includes('/table/')).length,baseline=tableCalls();
  const fixedEndpoints=await navigationEnds(page);
  await editOnMap(page);assert.match(await page.locator('.map-stop-popup').innerText(),/Stop 1 of 4/);
  let popup=await open('demo2');await popup.getByRole('button',{name:'Move earlier'}).click();await page.waitForFunction(()=>!document.querySelector('#optimize').disabled);
  assert.match((await textOrder(page))[0],/Capitol/);assert.equal(tableCalls(),baseline);assert(await page.locator('#map-edit-undo').isVisible());
  await page.locator('#map-edit-undo').click();await page.waitForFunction(()=>!document.querySelector('#optimize').disabled);assert.deepEqual(await textOrder(page),before);
  popup=await open('demo1');page.once('dialog',d=>d.dismiss());await popup.getByRole('button',{name:'Remove from drive'}).click();assert.equal(await page.locator('.itinerary-row').count(),4);
  page.once('dialog',d=>d.accept());await popup.getByRole('button',{name:'Remove from drive'}).click();await page.waitForFunction(()=>!document.querySelector('#optimize').disabled);
  assert.equal(await page.locator('.itinerary-row').count(),3);assert.equal(await page.locator('.stop').count(),4);assert.equal(await page.locator('#schedule-list li').count(),3);assert.match(await page.locator('#schedule-summary').innerText(),/12 min viewing/);
  let saved=await project();assert(!saved.selected.includes('demo1'));assert.equal(saved.displays.find(d=>d.id==='demo1').mustSee,false);assert.equal(saved.displays.find(d=>d.id==='demo1').visitNotes,'PRIVATE NOTE');assert.equal(tableCalls(),baseline);
  const links=await page.locator('#nav-buttons a').evaluateAll(nodes=>nodes.map(n=>n.href));assert(links.every(u=>!u.includes('39.731000')));
  assert.deepEqual(await navigationEnds(page),fixedEndpoints);
  await page.locator('#map-edit-undo').click();await page.waitForFunction(()=>!document.querySelector('#optimize').disabled);saved=await project();assert(saved.selected.includes('demo1'));assert.equal(saved.displays.find(d=>d.id==='demo1').mustSee,true);assert.deepEqual(await textOrder(page),before);
  popup=await open('demo2');await popup.getByRole('button',{name:'Adjust map pin'}).click();await page.evaluate(()=>window.__mapClick({latlng:{lat:39.7322,lng:-104.9478}}));await page.locator('#pin-toolbar').getByRole('button',{name:'Cancel'}).click();assert.equal((await project()).displays.find(d=>d.id==='demo2').lat,displays[1].lat);assert.deepEqual(await textOrder(page),before);
  popup=await open('demo2');await popup.getByRole('button',{name:'Adjust map pin'}).click();await page.evaluate(()=>window.__mapClick({latlng:{lat:39.7322,lng:-104.9478}}));await page.locator('#pin-toolbar').getByRole('button',{name:'Save pin'}).click();await page.waitForFunction(()=>!document.querySelector('#optimize').disabled);
  saved=await project();const corrected=saved.displays.find(d=>d.id==='demo2');assert.equal(corrected.lat,39.7322);assert.equal(corrected.geoSource,'manual');assert.equal(corrected.address,displays[1].address);assert.deepEqual(await textOrder(page),before);assert.equal(tableCalls(),baseline+1);assert.match(await page.locator('#route-detail').innerText(),/Totals use the mapped itinerary/);
  control.fail=true;popup=await open('demo2');await popup.getByRole('button',{name:'Move later'}).click();await page.waitForFunction(()=>!document.querySelector('#optimize').disabled);assert.match(await page.locator('#status').innerText(),/drawing failed/);assert.equal(await page.locator('.itinerary-row').count(),4);assert.match(await page.locator('#route-detail').innerText(),/road-matrix legs/);
  control.fail=false;await page.locator('#map-edit-back').click();await page.locator('#drive-start').click();popup=await open('demo2');assert.equal(await popup.getByRole('button',{name:'Remove from drive'}).count(),0);assert.equal(await popup.getByRole('button',{name:'Open Live Drive',includeHidden:true}).count(),1);assert(await page.locator('#map-edit-notice').isHidden());
  await endDrive(page);assert.deepEqual(errors,[]);await context.close();pass(`${viewport.width}px: map move/remove/undo, must-see confirmation, saved display preservation, fixed navigation endpoints, pin cancel/save, outage and Live Drive safety`);
 }
 {
  const {context,page,control,errors}=await prepare(browser,{width:390,height:844});
  await planDisplays(page);await page.locator('.stop input[type=checkbox]').nth(1).uncheck();await page.locator('.stop input[type=checkbox]').nth(2).uncheck();await page.locator('.stop input[type=checkbox]').nth(3).uncheck();await optimize(page);
  await editOnMap(page);page.once('dialog',d=>d.accept());await page.locator('.map-stop-popup').getByRole('button',{name:'Remove from drive'}).click();await page.waitForFunction(()=>!document.querySelector('#map-edit-undo').disabled);
  assert.equal(await page.locator('.itinerary-row').count(),0);assert.equal(await page.locator('#metrics .metric strong').first().innerText(),'0');assert(await page.locator('#edit-on-map').isDisabled());assert.equal(await page.locator('.stop').count(),4);
  await page.locator('#map-edit-undo').click();await page.waitForFunction(()=>!document.querySelector('#optimize').disabled);assert.equal(await page.locator('.itinerary-row').count(),1);
  // A moved pin has no valid old matrix: failure must not retain old time estimates.
  await editOnMap(page);await page.locator('.map-stop-popup').getByRole('button',{name:'Adjust map pin'}).click();await page.evaluate(()=>window.__mapClick({latlng:{lat:39.7312,lng:-104.9488}}));control.fail=true;
  await page.locator('#pin-toolbar').getByRole('button',{name:'Save pin'}).click();await page.waitForFunction(()=>!document.querySelector('#optimize').disabled);assert.equal(await page.locator('#metrics .metric').count(),0);assert.match(await page.locator('#status').innerText(),/edit is kept.*could not be updated/);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('glowroute:projects:v2')).projects[0].state);assert.equal(saved.displays[0].lat,39.7312);assert(saved.selected.includes('demo1'));
  assert.deepEqual(errors,[]);await context.close();pass('last mapped stop removal/undo and corrected-pin outage never retain old travel estimates');
 }
 {
  const {context,page,control,errors}=await prepare(browser,{width:1366,height:900});await optimize(page);
  await editOnMap(page);await page.locator('.map-stop-popup').getByRole('button',{name:'Adjust map pin'}).click();await page.keyboard.press('Escape');assert.equal(await page.locator('#pin-toolbar').count(),0);await page.locator('#map-edit-back').click();
  await editOnMap(page);await page.locator('.map-stop-popup').getByRole('button',{name:'Adjust map pin'}).click();await page.evaluate(()=>window.__mapClick({latlng:{lat:39.7342,lng:-104.9458}}));control.delay=500;
  const started=page.waitForRequest(u=>u.url().includes('/table/'));await page.locator('#pin-toolbar').getByRole('button',{name:'Save pin'}).click();await started;
  await page.locator('#map-edit-back').click();await page.locator('#project-new').click();await page.locator('#project-name').fill('Independent drive');await page.locator('#project-create-form button[type=submit]').click();await page.waitForTimeout(900);
  assert(await page.locator('#results').isHidden());assert(await page.locator('#map-edit-notice').isHidden());assert.equal(await page.locator('.stop').count(),0);assert.match(await page.locator('#status').innerText(),/Created Independent drive/);assert.equal(await page.locator('#pin-toolbar').count(),0);
  assert.deepEqual(errors,[]);await context.close();pass('Escape cancels map-pin mode; interrupted map edits cannot overwrite another project');
 }
 {
  const {context,page,errors}=await prepare(browser,{width:390,height:844});
  await page.locator('details[aria-label="Optional time budget"] summary').click();await page.locator('#budget-enabled').check();await page.locator('#budget-minutes').fill('20');await optimize(page);
  const count=await page.locator('.itinerary-row').count();assert(count>0&&count<4);
  await editOnMap(page);page.on('dialog',d=>d.accept());await page.locator('.map-stop-popup').getByRole('button',{name:'Remove from drive'}).click();await page.waitForFunction(()=>!document.querySelector('#optimize').disabled);
  assert.equal(await page.locator('.itinerary-row').count(),count-1);const detail=await page.locator('#route-detail').innerText();assert(detail.includes(`${4-count} optional house(s) left out`));assert(detail.includes(`${(count-1)*4} min viewing`));
  await page.locator('#map-edit-undo').click();await page.waitForFunction(()=>!document.querySelector('#optimize').disabled);assert.equal(await page.locator('.itinerary-row').count(),count);assert.match(await page.locator('#route-detail').innerText(),new RegExp(`${count*4} min viewing`));
  assert.deepEqual(errors,[]);await context.close();pass('map exclusions and undo keep budget exclusions and viewing totals consistent');
 }
 for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
  const {context,page,control,errors}=await prepare(browser,viewport);
  await browse(page);await page.waitForFunction(()=>document.querySelector('#directory-status').textContent.includes('31 catalog entries'));assert.equal(control.snapshotCalls,0);
  const original=await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2'));await directoryMore(page);await page.locator('#explorer-load').click();await page.waitForFunction(()=>document.querySelector('#explorer-status').textContent.includes('older discoveries loaded'));assert.equal(control.snapshotCalls,1);assert.equal(await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),original);
  await page.locator('#directory-search').fill('Explorer archive fixture');await page.locator('.directory-row input').check();await page.locator('#directory-review-selected').click();assert(await page.locator('#directory-apply').isDisabled());await page.locator('#directory-review-items input[type=checkbox]').check();page.once('dialog',d=>d.accept());await page.locator('#directory-apply').click();assert.equal(await page.locator('.stop').count(),5);
  let project=await page.evaluate(()=>JSON.parse(localStorage.getItem('glowroute:projects:v2')).projects[0].state);const archive=project.displays.find(d=>d.name==='Explorer archive fixture');assert.equal(archive.sourceYear,2025);assert.equal(archive.needsSeasonCheck,true);assert.equal(project.displays[0].visitNotes,'PRIVATE NOTE');
  await directoryMore(page);await page.locator('#source-paste-open').click();await details(page,'import-source-details');await page.locator('#source-directories .source-directory').filter({hasText:'Indy with Kids · Christmas'}).getByRole('button',{name:'Paste listings'}).click();
  await page.locator('#bulk-text').fill('Christmas Lights List for Example County | 2025\nExample Lights\nExample County\nAdd to Route\nFree\nAddress & Details\nAddress\n123 Example Road, Denver, CO\nCost\nFree\nFull details');await page.locator('#import-preview').click();assert.equal(await page.locator('.import-review-row').count(),1);assert.equal(await page.locator('.import-review-row input[aria-label^="Display name"]').inputValue(),'Example Lights');assert.equal(await page.locator('#import-source-year').inputValue(),'2025');await page.locator('#import-confirm').click();assert.equal(await page.locator('.stop').count(),6);
  project=await page.evaluate(()=>JSON.parse(localStorage.getItem('glowroute:projects:v2')).projects[0].state);const pasted=project.displays.find(d=>d.name==='Example Lights');assert.equal(pasted.sourceYear,2025);assert.equal(pasted.sourceHoliday,'Christmas');assert.match(pasted.sourceUrl,/indywithkids/);
  await bulk(page);await importSource(page);await page.locator('#website-url').fill('https://indywithkids.com/christmas-lights-list-indianapolis-central-indiana/');await page.locator('#import-source-year').fill('2025');await page.locator('#bulk-text').fill('Example Lights — 123 Example Road, Denver, CO\nNew Lights — 124 Example Road, Denver, CO');await page.locator('#import-preview').click();assert.match(await page.locator('#import-review-summary').innerText(),/1 selected · 1 already listed/);await page.locator('#import-confirm').click();assert.equal(await page.locator('.stop').count(),7);
  control.snapshotFail=true;await directoryMore(page);await page.locator('#explorer-load').click();await page.waitForFunction(()=>document.querySelector('#explorer-status').textContent.includes('Existing data retained'));assert.equal(await page.locator('.stop').count(),7);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await context.close();pass(`${viewport.width}px: action-only old snapshot, explicit unverified archive import, visible-guide paste, retained source season, weekly duplicate-safe append and snapshot failure recovery`);
 }
 {
  const {context,page,errors}=await prepare(browser,{width:390,height:844});
  await page.evaluate(async()=>{
   localStorage.setItem('hde-displays',JSON.stringify([{id:'old-one',name:'Personal display',address:'100 Main St'}]));localStorage.setItem('hde-plan',JSON.stringify({ids:['old-one'],progress:1}));
   const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('hde-memories',1);r.onupgradeneeded=()=>r.result.createObjectStore('displays');r.onsuccess=()=>resolve(r.result);r.onerror=reject;});
   const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;
   await new Promise((resolve,reject)=>{const tx=db.transaction('displays','readwrite');tx.objectStore('displays').put({rating:5,comments:[{id:'comment',text:'Private memory',date:'2025-12-20'}],photos:[{id:'photo',image:canvas.toDataURL('image/jpeg'),caption:'Private photo'}]},'old-one');tx.oncomplete=resolve;tx.onerror=reject;});db.close();
  });
  const before=await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),downloadPromise=page.waitForEvent('download');
  const result=await page.evaluate(await readFile(resolve(root,'tools/hde-export.js'),'utf8')),download=await downloadPromise,archive=JSON.parse(await readFile(await download.path(),'utf8'));
  assert.equal(result.photos,1);assert.equal(archive.memories.keys[0],'old-one');assert.equal(archive.memories.values[0].comments[0].date,'2025-12-20');assert.equal(archive.memories.values[0].rating,5);assert.match(archive.memories.values[0].photos[0].image,/^data:image\/jpeg;base64,/);assert.equal(JSON.parse(archive.localStorage['hde-plan']).progress,1);
  assert.equal(await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),before);assert.equal(await page.evaluate(()=>!!localStorage.getItem('hde-displays')),true);assert.deepEqual(errors,[]);await context.close();pass('read-only Explorer archive utility downloads original tour settings, dated comments, ratings and IndexedDB photo data without deleting either app data');
 }
 for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
  const {context,page,control,errors}=await prepare(browser,viewport);
  await browse(page);await page.waitForFunction(()=>document.querySelector('#directory-status').textContent.includes('31 catalog entries'));
  await page.locator('.nearby-options summary').click();await page.locator('#discovery-radius').selectOption('5');assert.equal(await page.locator('.directory-row').count(),0);assert.match(await page.locator('#directory-summary').innerText(),/Set a search location/);
  await page.locator('#discovery-gps').click();await page.waitForFunction(()=>document.querySelector('#discovery-location-status').textContent.includes('permission denied'));assert.match(await page.locator('#discovery-location-status').innerText(),/Enter an address/);
  await page.locator('#discovery-address').fill('39.730000,-104.950000');await page.locator('#discovery-find').click();await page.locator('#directory-sort').selectOption('nearest');assert.equal(await page.locator('.directory-row').count(),4);assert.match(await page.locator('.directory-row').first().innerText(),/approximate geographic distance/);
  assert.equal(control.calls.length,0);const before=await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2'));
  await page.locator('#discovery-suggest').click();assert(await page.locator('#directory-review').isVisible());assert.equal(await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),before);
  page.once('dialog',d=>d.accept());await page.locator('#directory-apply').click();await page.waitForFunction(()=>!document.querySelector('#optimize').disabled);assert(await page.locator('#results').isVisible());assert.equal(await page.locator('.itinerary-row').count(),4);
  await stage(page,'plan');await page.locator('details[aria-label="Optional visit schedule"] summary').click();await page.locator('#departure').fill('2026-12-20T18:00');await page.locator('#departure-zone').fill('America/Denver');await page.locator('#departure-zone').press('Tab');
  await stage(page,'drive');assert(await page.locator('#schedule-panel').isVisible());assert.equal(await page.locator('#schedule-list li').count(),4);assert.match(await page.locator('#schedule-summary').innerText(),/driving.*viewing.*Finish/);assert.match(await page.locator('#schedule-list').innerText(),/Hours unknown/);
  await stage(page,'plan');await page.locator('#departure').fill('2026-03-08T02:30');await page.locator('#departure').press('Tab');assert.match(await page.locator('#schedule-summary').innerText(),/does not exist/);
  await page.locator('#departure').fill('2026-12-20T18:00');await page.locator('#departure').press('Tab');await planDisplays(page);await page.locator('.stop-actions summary').first().click();const duration=page.locator('.stop-actions input[type=number]').first(),calls=control.calls.length;await duration.fill('12');await duration.press('Tab');await stage(page,'drive');assert(await page.locator('#results').isVisible());
  assert.match(await page.locator('#schedule-summary').innerText(),/24 min viewing/);assert.equal(control.calls.length,calls);assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('glowroute:projects:v2')).projects[0].state.displays[0])).visitNotes,'PRIVATE NOTE');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  await page.screenshot({path:`test-results/v17-planning-${viewport.width}.png`,fullPage:true});await context.close();pass(`${viewport.width}px: radius/no-location, denied GPS, nearest saved pins, private suggested tour review, road routing, schedule, DST gap and per-stop viewing override`);
 }
 {
  const {context,page,errors}=await prepare(browser,{width:390,height:844});await browse(page);await page.waitForFunction(()=>document.querySelector('#directory-status').textContent.includes('31 catalog entries'));await page.locator('.nearby-options summary').click();
  const entries=[{id:'city',name:'City-only discovery',town:'Denver',address:'',season:'Halloween',year:2026,lat:39.73,lng:-104.95,sources:[{name:'Permitted fixture',url:'https://example.org/city',recordId:'city'}]},{id:'archive',name:'Archived fixture',address:'999 Test St, Denver, CO',season:'Christmas',year:2025,sources:[{name:'Permitted fixture',url:'https://example.org/archive',recordId:'archive'}]}];
  const saved=await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2'));
  await page.locator('#discovery-snapshot').setInputFiles({name:'review.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(entries))});await page.waitForFunction(()=>document.querySelector('#discovery-snapshot-status').textContent.includes('2 unreviewed'));
  await page.locator('#directory-search').fill('City-only discovery');assert(await page.locator('.directory-row input').isDisabled());assert.match(await page.locator('.directory-row').innerText(),/City-level only/);
  await page.locator('#directory-search').fill('Archived fixture');assert.match(await page.locator('.directory-row').innerText(),/Archive/);await page.locator('.directory-row input').check();await page.locator('#directory-review-selected').click();assert(await page.locator('#directory-apply').isDisabled());
  assert.equal(await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),saved);assert.deepEqual(errors,[]);await context.close();pass('local discovery snapshots preserve city-only privacy and historical seasons without mutating projects');
 }
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
  assert(await page.locator('#drive-feedback').isHidden());await stage(page,'plan');await page.locator('#mode').selectOption('duration');await optimize(page);
  assert(await page.locator('#drive-feedback').isHidden());await page.locator('#drive-start').click();
  const feedback=page.locator('#drive-feedback'),rating=page.locator('#drive-rating'),notes=page.locator('#drive-notes');
  const project=async()=>page.evaluate(()=>JSON.parse(localStorage.getItem('glowroute:projects:v2')).projects[0].state);
  assert.equal(await feedback.getAttribute('data-display-id'),'demo1');assert.match(await page.locator('#drive-feedback-name').innerText(),/Art Museum/);
  const calls=control.calls.length;
  for(let n=1;n<=5;n++){await rating.locator('label').nth(n-1).click();assert.equal((await project()).displays.find(d=>d.id==='demo1').rating,n);assert.equal(await rating.locator('.filled').count(),n);}
  await rating.locator('input:checked').focus();await page.keyboard.press('ArrowLeft');assert.equal(await rating.locator('input:checked').inputValue(),'4');await page.keyboard.press('ArrowRight');assert.equal((await project()).displays.find(d=>d.id==='demo1').rating,5);
  await page.locator('#drive-favorite').click();await page.locator('#drive-note-details summary').click();
  const note='RIDER PRIVATE NOTE <img src=x onerror="window.injected=true">';await notes.fill(note);
  const stored=await project(),first=stored.displays.find(d=>d.id==='demo1');assert.equal(first.rating,5);assert.equal(first.favorite,true);assert.equal(first.visitNotes,note);assert.equal(stored.drive.remainingIds.length,4);assert.equal(control.calls.length,calls);
  assert.equal(await page.locator('#drive-favorite').getAttribute('aria-pressed'),'true');assert.match(await page.locator('#drive-feedback-status').innerText(),/Saved on this device/);
  await page.reload();await page.locator('#drive-resume').click();await page.waitForFunction(()=>!document.querySelector('#drive-visited').disabled);
  assert.equal(await feedback.getAttribute('data-display-id'),'demo1');assert.equal(await rating.locator('input:checked').inputValue(),'5');assert.equal(await notes.inputValue(),note);
  await page.locator('#drive-full').click();await planDisplays(page);assert.equal(await page.locator('.stop .rating-select').first().inputValue(),'5');assert.match(await page.locator('.stop').first().innerText(),/RIDER PRIVATE NOTE/);
  await shareDetails(page);await page.locator('#share-text').click();assert(!(await page.evaluate(()=>window.__copied)).includes('RIDER PRIVATE NOTE'));
  // Existing list edits must be reflected when returning to the current stop.
  await planDisplays(page);await page.locator('.stop .rating-select').first().selectOption('4');await stage(page,'drive');await page.locator('#drive-full').click();assert.equal(await rating.locator('input:checked').inputValue(),'4');
  await page.locator('#drive-note-details summary').click();await notes.fill('Last keystroke before Visited');control.delay=250;await page.locator('#drive-visited').click();
  assert(await rating.locator('input').first().isDisabled());assert.equal((await project()).displays.find(d=>d.id==='demo1').visitNotes,'Last keystroke before Visited');
  await page.waitForFunction(()=>!document.querySelector('#drive-visited').disabled);assert.notEqual(await feedback.getAttribute('data-display-id'),'demo1');assert.equal(await rating.locator('input:checked').inputValue(),'3');assert.equal(await notes.inputValue(),'PRIVATE NOTE');
  assert.equal(await page.locator('#drive-favorite').getAttribute('aria-pressed'),'false');assert.equal(await page.locator('#drive-note-details').getAttribute('open'),null);
  const nextId=await feedback.getAttribute('data-display-id');await rating.locator('label').nth(1).click();control.fail=true;await page.locator('#drive-skip').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Could not reroute'));
  assert.notEqual(await feedback.getAttribute('data-display-id'),nextId);assert.equal((await project()).displays.find(d=>d.id===nextId).rating,2);assert.equal(await rating.locator('input:checked').inputValue(),'3');
  // Personal feedback remains available after a routing-service failure.
  await page.locator('#drive-note-details summary').click();await notes.fill('Available after outage');assert.match(await page.locator('#drive-feedback-status').innerText(),/Saved on this device/);
  await page.locator('#drive-full').click();await shareDetails(page);await page.locator('#share-link').click();assert(!(await page.evaluate(()=>window.__copied)).includes('Available after outage'));await page.locator('#drive-full').click();
  assert.equal(await page.evaluate(()=>window.injected),undefined);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#drive-visited').click();await page.waitForFunction(()=>!document.querySelector('#drive-visited').disabled);await page.locator('#drive-visited').click();await page.waitForFunction(()=>document.querySelector('#drive-current').textContent.includes('All displays completed'));
  assert(await feedback.isHidden());assert(await rating.locator('input').first().isDisabled());await endDrive(page);assert(await feedback.isHidden());assert.deepEqual(errors,[]);await context.close();
  pass(`${viewport.width}px: current-stop rating/favorite/notes, immediate save, reload/resume, list sync, visit/skip binding, outage editing and sharing privacy`);
 }
 {
  const {context,page,errors}=await prepare(browser,{width:320,height:844},{touch:true});await optimize(page);await page.locator('#drive-start').click();
  const stars=page.locator('#drive-rating label');assert.equal(await page.getByRole('radiogroup',{name:'Your rating',exact:true}).count(),1);
  for(const star of await stars.all()){const box=await star.boundingBox();assert(box.width>=44&&box.height>=44);}
  await stars.nth(4).tap();assert(await page.getByRole('radio',{name:'5 stars',exact:true}).isChecked());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await context.close();pass('320px touch: one-tap five-star vote, labeled radio group, 44px targets and no horizontal overflow');
 }
 {
  const {context,page,errors}=await prepare(browser,{width:390,height:844});await optimize(page);await page.locator('#drive-start').click();
  const original=await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2'));
  await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError');};});
  await page.locator('#drive-rating label').nth(4).click();assert.match(await page.locator('#drive-feedback-status').innerText(),/only in this tab/);assert.match(await page.locator('#storage-status').innerText(),/only in memory/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),original);assert.deepEqual(errors,[]);await context.close();pass('Live Drive feedback storage failure is explicit, never claims a successful save');
 }
 for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
  const {context,page,control,errors}=await prepare(browser,viewport);
  assert(await page.locator('#welcome').isHidden());await optimize(page);
  let order=await textOrder(page);assert.match(order[0],/Public Library/);assert.match(order.at(-1),/Art Museum/);
  await details(page,'route-comparison-details');const chosen=page.locator('.route-choice').filter({has:page.locator('button:disabled')});assert.match(await chosen.innerText(),/Shortest modeled driving distance/);
  const metricTime=(await page.locator('#metrics .metric').nth(1).innerText()).split('\n')[0];assert((await chosen.innerText()).includes(metricTime));assert.match(await page.locator('#route-detail').innerText(),/Totals use the mapped itinerary/);
  assert.equal(control.calls.filter(x=>x.includes('/route/')).length,2); // no third draw request
  await shareDetails(page);await page.locator('#share-text').click();let copied=await page.evaluate(()=>window.__copied);assert(!copied.includes('Private start')&&!copied.includes('Private finish')&&!copied.includes('PRIVATE NOTE'));
  await shareDetails(page);await page.locator('#share-link').click();const share=await page.evaluate(()=>window.__copied);assert(share.includes('#tour='));
  await page.locator('#share-endpoints').check();await shareDetails(page);await page.locator('#share-text').click();assert.match(await page.evaluate(()=>window.__copied),/Private start/);
  await page.locator('.itinerary-row').first().locator('button').last().click();await page.waitForFunction(()=>document.querySelector('#route-detail').textContent.includes('Manually arranged'));
  assert.equal(await page.locator('.itinerary-row').count(),4);
  const links=await page.locator('#nav-buttons a').evaluateAll(links=>links.map(a=>a.href));
  for(const link of links){const u=new URL(link);assert(['maps.apple.com','www.google.com'].includes(u.hostname));}
  pass(`${viewport.width}px: nationwide distance selection, cached geometry, manual order, sharing privacy, Maps links`);
  await stage(page,'plan');await page.locator('#mode').selectOption('duration');await optimize(page);order=await textOrder(page);assert.match(order[0],/Art Museum/);
  // The current matrix is cached, so fail the next (smaller) reroute.
  await page.locator('#drive-start').click();assert(await page.locator('body').evaluate(e=>e.classList.contains('driving')));
  control.fail=true;await page.locator('#drive-skip').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Could not reroute'));
  assert.match(await page.locator('#drive-current').innerText(),/3 remaining/);assert(!/Next: Denver Art Museum/.test(await page.locator('#drive-current').innerText()));assert.equal(await page.locator('#metrics .metric').count(),0);
  let stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('glowroute:projects:v2')));assert.equal(stored.projects[0].state.drive.remainingIds.length,3);
  control.fail=false;await page.reload();await page.locator('#drive-resume').click();await page.waitForFunction(()=>document.querySelector('#drive-current').textContent.includes('3 remaining')&&!document.querySelector('#drive-visited').disabled);
  await page.locator('#drive-visited').click();await page.waitForFunction(()=>document.querySelector('#drive-current').textContent.includes('2 remaining')&&!document.querySelector('#drive-visited').disabled);
  await page.locator('#drive-full').click();assert(await page.locator('#itinerary').isVisible());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await endDrive(page);
  pass(`${viewport.width}px: focused drive, failed skip recovery, reload/resume, visited progress, full itinerary, no horizontal overflow`);
  // Shared import creates a separate project and leaves omitted endpoints blank.
  await page.goto(share);await page.locator('#shared-import').click();assert.equal(await page.locator('#project-picker option').count(),2);assert.equal(await page.locator('#start-input').inputValue(),'');assert.equal(await page.locator('.stop').count(),4);
  await page.locator('#project-picker').selectOption('t1');assert.equal(await page.locator('.stop').count(),4);
  // Import into the actual project using an explicit city, with formatting duplicates.
  await bulk(page);await page.locator('#bulk-text').fill('Example A — 100 Test Street, Portland, OR\nExample B — 100 Test St, Portland OR\nExample C — 102 Test Ave, Portland, OR');await page.locator('#import-preview').click();assert.equal(await page.locator('.import-review-row').count(),2);await page.locator('#import-confirm').click();assert.equal(await page.locator('.stop').count(),6);
  // Malformed restore is rejected before confirmation or mutation.
  stored=await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2'));
  await details(page,'project-tools');await page.locator('#projects-import').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:2,projects:[{}]}))});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Could not restore'));
  assert.equal(await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),stored);
  page.once('dialog',dialog=>dialog.accept());await details(page,'project-tools');await page.locator('#projects-import').setInputFiles({name:'valid-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...JSON.parse(stored),version:2}))});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Projects restored successfully'));assert.equal(await page.locator('.stop').count(),6);
  pass(`${viewport.width}px: safe shared import, independent projects, import deduplication, atomic restore validation`);
  await bulk(page);await page.locator('#import-file').setInputFiles({name:'review.csv',mimeType:'text/csv',buffer:Buffer.from('Name,Address\nA,"301 New St, Portland, OR"\nB,"302 New St, Portland, OR"\nBad,no numbered address')});
  assert.equal(await page.locator('.import-review-row').count(),2);assert.match(await page.locator('.import-diagnostics summary').innerText(),/1 ignored/);
  await page.locator('.import-review-row').first().locator('input[aria-label^="Display name"]').fill('Edited label');await page.locator('.import-review-row').nth(1).locator('input[type=checkbox]').uncheck();
  await page.locator('#import-mode').selectOption('replace');assert.equal(await page.locator('.import-review-row').first().locator('input[aria-label^="Display name"]').inputValue(),'Edited label');assert.equal(await page.locator('.import-review-row').nth(1).locator('input[type=checkbox]').isChecked(),false);
  await page.locator('#import-mode').selectOption('append');await page.locator('#import-select-none').click();assert(await page.locator('#import-confirm').isDisabled());await page.locator('#import-select-all').click();assert.match(await page.locator('#import-review-summary').innerText(),/2 selected/);
  const firstAddress=page.locator('.import-review-row').first().locator('input[aria-label^="Street address"]');await firstAddress.fill(displays[0].address);assert.match(await page.locator('#import-review-summary').innerText(),/1 already listed/);assert(await page.locator('.import-review-row').first().locator('input[type=checkbox]').isDisabled());await firstAddress.fill('301 New St, Portland, OR');await page.locator('.import-review-row').nth(1).locator('input[type=checkbox]').uncheck();await page.locator('#import-confirm').click();assert.equal(await page.locator('.stop').count(),7);
  pass(`${viewport.width}px: rejected-row diagnostics, stable edited preview across modes, bulk selection and append duplicate safety`);
  await browse(page);await page.waitForFunction(()=>document.querySelector('#directory-status').textContent.includes('31 catalog entries'));
  await page.locator('#directory-sort').selectOption('year');assert.match(await page.locator('.directory-row').first().innerText(),/2026.*Check operation/);await page.locator('#directory-year').selectOption('2025');assert.match(await page.locator('.directory-row').first().innerText(),/Archive/);assert.match(await page.locator('.directory-row').first().innerText(),/Source reviewed/);
  await page.locator('#directory-select-visible').click();assert.match(await page.locator('#directory-summary').innerText(),/12 selected/);await page.locator('#directory-year').selectOption('2026');assert.match(await page.locator('#directory-summary').innerText(),/12 outside/);const currentListings=await page.locator('.directory-row').count();await page.locator('#directory-select-visible').click();assert.match(await page.locator('#directory-summary').innerText(),new RegExp(`${12+currentListings} selected`));await page.locator('#directory-select-visible').click();assert.match(await page.locator('#directory-summary').innerText(),/12 selected/);await page.locator('#directory-clear-selection').click();
  const firstCheckbox=page.locator('.directory-row input').first();await firstCheckbox.check();assert.equal(await firstCheckbox.getAttribute('id'),await page.evaluate(()=>document.activeElement.id));
  await directoryMore(page);await page.locator('#submission-toggle').click();await page.locator('#submit-address').fill('PRIVATE ADDRESS');await page.locator('#submit-source').fill('https://private.example');await page.locator('#submit-type').selectOption('removal');await page.locator('#submit-name').fill('indy-halloween-01');assert(await page.locator('#submit-address').isDisabled());await page.evaluate(()=>{window.open=url=>{window.__suggestion=url;return null;};});page.once('dialog',dialog=>dialog.accept());await page.locator('#submission-form button[type=submit]').click();const suggestion=new URL(await page.evaluate(()=>window.__suggestion));assert.match(suggestion.searchParams.get('title'),/Removal request/);assert(!suggestion.searchParams.get('body').includes('PRIVATE ADDRESS'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  pass(`${viewport.width}px: seasonal directory labels, source review dates, filtered bulk selection, keyboard focus and ID-only removal drafts`);
  assert.deepEqual(errors,[]);await context.close();
 }
 // Full outage keeps an explicit rough fallback with no invented driving time.
 for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
  const {context,page,errors}=await prepare(browser,viewport);
  await planDisplays(page);await page.locator('.stop').first().locator('.stop-preferences button').first().click();await page.locator('.stop').first().locator('.rating-select').selectOption('5');await page.locator('.stop').first().locator('summary').click();await page.locator('.stop').first().locator('button[title="Mark this house visited on this drive"]').click();await page.locator('.stop').nth(1).locator('input[type=checkbox]').uncheck();
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-json').click()]);const exported=await readFile(await download.path());
  await page.locator('#project-new').click();await page.locator('#project-name').fill('Round trip');await page.locator('#project-holiday').selectOption('Christmas');await page.locator('#project-create-form button[type=submit]').click();await bulk(page);await page.locator('#import-file').setInputFiles({name:'stops.json',mimeType:'application/json',buffer:exported});await page.locator('#import-confirm').click();
  assert.equal(await page.locator('#stop-count').innerText(),'3/4');const restored=await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('glowroute:projects:v2'));return p.projects.find(d=>d.id===p.activeId).state;});
  const first=restored.displays.find(d=>d.name==='Denver Art Museum');assert.equal(first.favorite,true);assert.equal(first.rating,5);assert.equal(first.mustSee,true);assert.equal(first.visited,true);assert.equal(first.visitNotes,'PRIVATE NOTE');assert.equal(first.approved,true);assert.equal(first.geoSource,'manual');assert.notEqual(first.id,displays[0].id);
  await bulk(page);await page.locator('#bulk-text').fill(Array.from({length:71},(_,i)=>`${301+i} New St, Portland, OR`).join('\n'));await page.locator('#import-preview').click();assert.equal(await page.locator('.import-review-row').count(),71);assert(await page.locator('#import-confirm').isDisabled());await page.locator('#import-select-none').click();await page.locator('.import-review-row input[type=checkbox]').nth(0).check();await page.locator('.import-review-row input[type=checkbox]').nth(1).check();await page.locator('#import-confirm').click();assert.equal(await page.locator('.stop').count(),6);
  assert.deepEqual(errors,[]);await context.close();pass(`${viewport.width}px: actual export/import preserves personal metadata and manual pins; oversized list reduced to a valid subset`);
 }
 {
  const {context,page,control,errors}=await prepare(browser,{width:390,height:844});control.importDelay=700;
  await bulk(page);await importSource(page);await page.locator('#website-url').fill('https://listing.example.test/displays');const requested=page.waitForRequest('https://listing.example.test/displays');await page.locator('#website-load').click();await requested;await page.locator('#project-new').click();await page.locator('#project-name').fill('Different drive');await page.locator('#project-create-form button[type=submit]').click();await page.waitForTimeout(900);
  assert(await page.locator('#bulk-panel').isHidden());assert.equal(await page.locator('.stop').count(),0);assert.match(await page.locator('#status').innerText(),/Created Different drive/);assert.deepEqual(errors,[]);await context.close();pass('interrupted website import cannot reopen or populate a different project');
 }
 {
  const {context,page,errors}=await prepare(browser,{width:390,height:844});
  await page.locator('details[aria-label="Optional time budget"] summary').click();await page.locator('#budget-enabled').check();await page.locator('#budget-minutes').fill('20');await optimize(page);
  assert.match(await page.locator('#route-detail').innerText(),/Time-budget selection/);assert.match(await page.locator('#itinerary').innerText(),/Art Museum/);
  const count=await page.locator('.itinerary-row').count();assert(count>0&&count<4);
  await planDisplays(page);await page.locator('#preset').selectOption('top5');assert.equal(await page.locator('#stop-count').innerText(),'1/4');
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
  await page.locator('#welcome-sample').click();await planDisplays(page);await page.locator('.stop-actions summary').first().click();
  page.once('dialog',dialog=>dialog.accept());await page.locator('.stop-menu button[aria-label^="Remove"]').first().click();assert.equal(await page.locator('.stop').count(),24);
  await details(page,'project-tools');await page.locator('#project-duplicate').click();await page.locator('#project-create-form button[type=submit]').click();assert.equal(await page.locator('.stop').count(),24);assert.equal(await page.locator('.verify-season').count(),24);
  await page.locator('#project-new').click();await page.locator('#project-name').fill('Directory review');await page.locator('#project-holiday').selectOption('Halloween');await page.locator('#project-year').fill('2026');await page.locator('#project-create-form button[type=submit]').click();
  await browse(page);await page.waitForFunction(()=>document.querySelector('#directory-status').textContent.includes('31 catalog entries'));
  await page.locator('#directory-season').selectOption('Halloween');await page.locator('#directory-search').fill('Ritter');assert((await page.locator('.directory-row').count())>0);await page.locator('.directory-row input').first().check();await page.locator('#directory-review-selected').click();
  page.once('dialog',dialog=>dialog.accept());await page.locator('#directory-apply').click();assert.equal(await page.locator('.stop').count(),1);assert.equal(await page.locator('.verify-season').count(),1);
  await bulk(page);await importSource(page);await page.locator('#website-url').fill('https://indywithkids.com/christmas-lights-list-indianapolis-central-indiana/');await page.locator('#website-load').click();assert.equal(await page.locator('.import-review-row').count(),12);assert.match(await page.locator('#bulk-preview').innerText(),/2025/);
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
  const {context,page,control,errors}=await prepare(browser,{width:1366,height:900});control.delay=400;await page.locator('#optimize').click();await page.waitForFunction(()=>document.querySelector('#optimize').disabled);await stage(page,'plan');await page.locator('#mode').selectOption('duration');await page.waitForTimeout(600);assert(await page.locator('#results').isHidden());assert(await page.locator('#optimize').isEnabled());assert.deepEqual(errors,[]);await context.close();pass('interrupted routing: stale response cannot overwrite changed planning state');
 }
 for(const options of [{storageFail:true},{corrupt:true}]){
  const {context,page,errors}=await prepare(browser,{width:390,height:844},options);await planDisplays(page);await page.locator('.stop-preferences button').first().click();assert(await page.locator('#storage-status').isVisible());if(options.corrupt)assert.equal(await page.evaluate(()=>localStorage.getItem('glowroute:projects:v2')),'BROKEN JSON');assert.deepEqual(errors,[]);await context.close();pass(`storage ${options.corrupt?'corruption preserved':'quota failure announced persistently'}`);
 }
 {
  const {context,page,errors}=await prepare(browser,{width:390,height:844},{saved:false});assert(await page.locator('#welcome').isVisible());await page.locator('#welcome-own').click();await page.locator('#project-name').fill('Our Christmas outing');await page.locator('#project-holiday').selectOption('Christmas');await page.locator('#project-create-form button[type=submit]').click();assert(await page.locator('#stage-discover').isVisible());assert.equal(await page.locator('.stop').count(),0);assert.equal(await page.locator('#start-input').inputValue(),'');assert.deepEqual(errors,[]);await context.close();pass('first visit: custom holiday drive, discovery empty state, no inherited Indianapolis endpoints');
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
 }
 console.log(`All ${checks} ${process.env.GLOWROUTE_BROWSER_NEW_ONLY?'new ':''}browser scenario groups passed.`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
