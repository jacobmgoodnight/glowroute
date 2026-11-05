/** Optional real-browser capture using public civic landmarks, never residential samples. */
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('..',import.meta.url));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;const file=resolve(root,'.'+(path==='/'?'/index.html':path));if(!file.startsWith(root))throw Error('outside root');res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.GLOWROUTE_BROWSER_EXECUTABLE?{executablePath:process.env.GLOWROUTE_BROWSER_EXECUTABLE}:{})});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 const locations=[['Denver Art Museum','100 W 14th Avenue Pkwy, Denver, CO',39.7372,-104.9893],['Colorado State Capitol','200 E Colfax Ave, Denver, CO',39.7392,-104.9849],['Denver Botanic Gardens','1007 York St, Denver, CO',39.7321,-104.9610],['Denver Public Library','10 W 14th Ave Pkwy, Denver, CO',39.7371,-104.9888]];
 await context.addInitScript(locations=>{
  const displays=locations.map(([name,address,lat,lon],i)=>({id:`public-${i}`,name,address,lat,lon,geoSource:'manual',approved:true,rating:3}));
  const start='Denver Union Station',end='Denver City Park';
  localStorage.setItem('glowroute:projects:v2',JSON.stringify({activeId:'public-demo',projects:[{id:'public-demo',name:'Denver public landmarks · example',holiday:'Other',year:2026,state:{displays,selected:displays.slice(0,3).map(d=>d.id),start,end,mode:'duration',preset:'custom',endpoints:{start:{address:start,lat:39.7527,lon:-104.9992},end:{address:end,lat:39.7476,lon:-104.9490}},cache:{}}}]}));
 },locations);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('#optimize').click();await page.waitForFunction(()=>!document.querySelector('#optimize').disabled,{},{timeout:90000});
 if(!await page.locator('#results').isVisible())throw Error(await page.locator('#status').innerText());
 await page.waitForFunction(()=>!!window.L);await page.waitForTimeout(2500);
 const ids=()=>page.locator('.itinerary-row').evaluateAll(rows=>rows.map(row=>row.dataset.stopId));
 const original=await ids();await page.locator('.itinerary-label').first().click();assert(await page.locator('.marker-pin.is-selected').isVisible());
 await page.locator('.map-stop-popup [data-map-action="itinerary"]').click();assert(await page.locator('.itinerary-row.selected-stop').isVisible());
 await page.locator('#route-add-toggle').click();await page.locator('#route-add-saved').selectOption('public-3');await page.locator('#route-add-position').selectOption('1');await page.locator('#route-add-submit').click();
 await page.waitForFunction(()=>document.querySelectorAll('.itinerary-row').length===4&&!document.querySelector('#optimize').disabled,{},{timeout:90000});assert.deepEqual(await ids(),[original[0],'public-3',...original.slice(1)]);
 await mkdir(resolve(root,'docs/screenshots'),{recursive:true});
 await page.locator('#workflow-drive').click();await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(2000);await page.screenshot({path:resolve(root,'docs/screenshots/desktop-route.png')});
 await page.setViewportSize({width:390,height:844});await page.locator('#drive-start').click();assert(await page.locator('#drive-retry').isHidden());assert(await page.locator('#drive-end').isHidden());
 await page.locator('#drive-rating label').nth(4).click();await page.locator('#drive-visited').click();await page.waitForFunction(()=>!document.querySelector('#drive-visited').disabled,{},{timeout:90000});
 await page.locator('#drive-undo').click();await page.waitForFunction(()=>!document.querySelector('#drive-visited').disabled,{},{timeout:90000});assert.equal(await page.locator('#drive-rating input:checked').inputValue(),'5');
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:resolve(root,'docs/screenshots/mobile-drive.png'),fullPage:true});assert.deepEqual(errors,[]);
 console.log('Real desktop/mobile smoke passed: linked selection, fixed-order insertion, Live Drive rating and undo. Captured genuine Leaflet/OSM/OSRM app screenshots. Public landmarks are illustrative, not holiday display listings.');
 await context.close();
}finally{await browser.close();await new Promise(r=>server.close(r));}
