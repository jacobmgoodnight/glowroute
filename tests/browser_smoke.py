import os,re,json
from playwright.sync_api import sync_playwright
ROOT='/mnt/data/glowroute'
html=open(ROOT+'/index.html').read().replace('<script type="module" src="./app.js"></script>','').replace('<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoKnKWNQ5x04=" crossorigin=""/>','')
html=html.replace('<link rel="stylesheet" href="./styles.css"/>','<style>'+open(ROOT+'/styles.css').read()+'</style>')
script='\n'.join(open(ROOT+'/'+f).read() for f in ['data.js','optimizer.mjs','app.js'])
script=re.sub(r'^import .*?;\n','',script,flags=re.M).replace('export const ','const ').replace('export function ','function ')
bootstrap=r'''
window.L={
 map:()=>({setView(){return this},on(){},flyTo(){return this},fitBounds(){return this}}),
 control:{zoom:()=>({addTo(){}})},tileLayer:()=>({addTo(){}}),
 layerGroup:()=>({addTo(){return this},clearLayers(){},getLayers(){return[]}}),
 marker:()=>({bindPopup(){return this},addTo(){return this}}),
 circleMarker:()=>({addTo(){return this}}),
 divIcon:()=>({}),polyline:()=>({addTo(){return this}}),
 latLngBounds:()=>({extend(){},isValid(){return false},pad(){return this}})
};
const origAppend=document.head.appendChild.bind(document.head);
document.head.appendChild=function(el){
 if(el.src?.includes('geocoding.geo.census.gov')){
  const name=new URL(el.src).searchParams.get('callback');
  const seed=[...el.src].reduce((n,c)=>n+c.charCodeAt(0),0)%500;
  queueMicrotask(()=>window[name]?.({result:{addressMatches:[{coordinates:{x:-86.112+seed/16000,y:39.75+seed/30000},matchedAddress:'Indianapolis IN'}]}}));
  return el;
 }
 return origAppend(el);
};
const jsonBody=data=>({ok:true,json:async()=>data});
window.fetch=async function(url){
 url=String(url);
 if(url.includes('geocoding.geo.census.gov')) {
  const seed=[...url].reduce((n,c)=>n+c.charCodeAt(0),0)%500;
  return jsonBody({result:{addressMatches:[{coordinates:{x:-86.112+seed/16000,y:39.75+seed/30000},matchedAddress:'Indianapolis IN'}]}});
 }
 if(url.includes('nominatim.openstreetmap.org'))return jsonBody([{lat:'39.78',lon:'-86.08',display_name:'Indiana'}]);
 if(url.includes('router.project-osrm.org/table')){
  const n=url.split('/driving/')[1].split('?')[0].split(';').length;
  const durations=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?0:210+Math.abs(i-j)*38+(i*7+j*11)%50));
  return jsonBody({code:'Ok',durations,distances:durations.map(r=>r.map(v=>v*13))});
 }
 if(url.includes('router.project-osrm.org/route'))return jsonBody({code:'Ok',routes:[{geometry:{coordinates:[[-86.1,39.78],[-86.05,39.75]]}}]});
 throw Error('Unexpected fetch '+url);
};
'''
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':960},device_scale_factor=1)
 errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
 page.set_content(html)
 page.evaluate("(()=>{"+bootstrap+";return null;})()")
 page.evaluate('(()=>{'+script+'})()')
 print('title:',page.title(),'stop cards:',page.locator('.stop').count())
 print('selected:',page.locator('.stop input:checked').count())
 page.locator('#optimize').click()
 page.wait_for_selector('#results:not(.hidden)',timeout=20000)
 print('metrics:',page.locator('#metrics').inner_text())
 print('nav segments:',page.locator('.nav-segment').count())
 print('itinerary:',page.locator('.itinerary-row').count())
 print('status:',page.locator('#status').inner_text())
 page.screenshot(path='/mnt/data/glowroute-preview.png',full_page=True)
 page.locator('#preset').select_option('all')
 page.locator('#optimize').click()
 page.wait_for_function("document.querySelectorAll('.itinerary-row').length===25",timeout=20000)
 print('all25:',page.locator('.itinerary-row').count(),'nav:',page.locator('.nav-segment').count())
 print('page errors:',errors)
 if errors:raise RuntimeError(errors)
 browser.close()
