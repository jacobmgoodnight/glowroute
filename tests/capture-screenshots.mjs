/** Optional real-browser capture using public civic landmarks, never residential samples. */
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('..',import.meta.url));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;const file=resolve(root,'.'+(path==='/'?'/index.html':path));if(!file.startsWith(root))throw Error('outside root');res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.GLOWROUTE_BROWSER_EXECUTABLE?{executablePath:process.env.GLOWROUTE_BROWSER_EXECUTABLE}:{})});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 const locations=[['Denver Art Museum','100 W 14th Avenue Pkwy, Denver, CO',39.7372,-104.9893],['Colorado State Capitol','200 E Colfax Ave, Denver, CO',39.7392,-104.9849],['Denver Botanic Gardens','1007 York St, Denver, CO',39.7321,-104.9610]];
 await context.addInitScript(locations=>{
  const displays=locations.map(([name,address,lat,lon],i)=>({id:`public-${i}`,name,address,lat,lon,geoSource:'manual',approved:true,rating:3}));
  const start='Denver Union Station',end='Denver City Park';
  localStorage.setItem('glowroute:projects:v2',JSON.stringify({activeId:'public-demo',projects:[{id:'public-demo',name:'Denver public landmarks · example',holiday:'Other',year:2026,state:{displays,selected:displays.map(d=>d.id),start,end,mode:'duration',preset:'custom',endpoints:{start:{address:start,lat:39.7527,lon:-104.9992},end:{address:end,lat:39.7476,lon:-104.9490}},cache:{}}}]}));
 },locations);
 const page=await context.newPage();page.on('pageerror',e=>console.log('Page error:',e.message));
 await page.goto(base);await page.locator('#optimize').click();await page.waitForFunction(()=>!document.querySelector('#optimize').disabled,{},{timeout:90000});
 if(!await page.locator('#results').isVisible())throw Error(await page.locator('#status').innerText());
 await page.waitForFunction(()=>!!window.L);await page.waitForTimeout(2500);
 await mkdir(resolve(root,'docs/screenshots'),{recursive:true});
 await page.evaluate(()=>{const controls=document.querySelector('.controls');controls.scrollTop=document.querySelector('#results').offsetTop-controls.offsetTop-16;window.scrollTo(0,0);});await page.screenshot({path:resolve(root,'docs/screenshots/desktop-route.png')});
 await page.setViewportSize({width:390,height:844});await page.locator('#drive-start').click();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:resolve(root,'docs/screenshots/mobile-drive.png'),fullPage:true});
 console.log('Captured genuine app screenshots with real Leaflet/OSM mapping and OSRM routing. Public landmarks are illustrative, not holiday display listings.');
 await context.close();
}finally{await browser.close();await new Promise(r=>server.close(r));}
