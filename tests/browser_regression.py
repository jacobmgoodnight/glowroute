"""Browser regression without network: exercises Leaflet alternate-CDN loading and bulk importer."""
import os,re
from playwright.sync_api import sync_playwright
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
html=open(ROOT+'/index.html').read()
html=re.sub(r'<script type="module" src="\./app.js"></script>','',html)
html=re.sub(r'<link rel="stylesheet" href="https://unpkg.com/leaflet.*?/>','',html)
html=html.replace('<link rel="stylesheet" href="./styles.css"/>','<style>'+open(ROOT+'/styles.css').read()+'</style>')
script='\n'.join(open(ROOT+'/'+f).read() for f in ['data.js','optimizer.mjs','importer.mjs','projects.mjs','catalogs.mjs','directory.mjs','app.js'])
script=re.sub(r'^import .*?;\n','',script,flags=re.M).replace('export const ','const ').replace('export function ','function ')
MOCK_MAP='''window.L={
 map:()=>({setView(){return this},on(){},flyTo(){return this},fitBounds(){return this}}),
 control:{zoom:()=>({addTo(){}})},tileLayer:()=>({addTo(){}}),
 layerGroup:()=>({addTo(){return this},clearLayers(){},getLayers(){return[]}}),
 marker:()=>({bindPopup(){return this},addTo(){return this}}),
 circleMarker:()=>({addTo(){return this}}),divIcon:()=>({}),polyline:()=>({addTo(){return this}}),
 latLngBounds:()=>({extend(){},isValid(){return false},pad(){return this}})
};'''
bootstrap='''window.__cdn=[];
const originalAppend=document.head.appendChild.bind(document.head);
document.head.appendChild=function(el){
 if(el.src?.includes('/leaflet.js')){
  window.__cdn.push(el.src);
  if(window.__cdn.length===1)queueMicrotask(()=>el.onerror?.());
  else queueMicrotask(()=>{MOCK_MAP; el.onload?.();});
  return el;
 }
 return originalAppend(el);
};'''.replace('MOCK_MAP',MOCK_MAP)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for viewport in [{'width':1366,'height':768},{'width':390,'height':844}]:
  page=browser.new_page(viewport=viewport);errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
  page.set_content(html)
  page.evaluate('(()=>{'+bootstrap+'})()')
  page.evaluate('(()=>{'+script+'})()')
  page.wait_for_function('!!window.L && window.__cdn.length===2')
  page.wait_for_timeout(50)
  assert page.locator('#status').inner_text().find('Could not load the map library')==-1
  assert page.locator('.stop').count()==25
  page.locator('#bulk-toggle').click()
  page.locator('#bulk-text').fill('Haunted House — 1201 N Maple St\nHalloween Drive — 1333 S Cherry Ave\nMcBlackton Manor — 5543 Julian Ave')
  page.locator('#import-preview').click()
  preview=page.locator('#bulk-preview').inner_text()
  assert '3 unique addresses' in preview,preview
  assert '1 already listed' in preview,preview
  page.locator('#import-confirm').click()
  assert page.locator('.stop').count()==27,page.locator('.stop').count()
  assert page.locator('#stop-count').inner_text()=='12/27'
  assert not errors,errors
  print('PASS:',viewport,'CDN fallback, 25 original houses, preview/duplicates, 2 new addresses')
  page.close()
 browser.close()
