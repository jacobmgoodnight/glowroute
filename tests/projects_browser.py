"""Offline Chromium integration test of multi-season state and importer UI."""
import os,re
from playwright.sync_api import sync_playwright
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
html=open(ROOT+'/index.html').read();html=re.sub(r'<script type="module" src="\./app.js"></script>','',html)
html=re.sub(r'<link rel="stylesheet" href="https://unpkg.com/leaflet.*?/>','',html)
html=html.replace('<link rel="stylesheet" href="./styles.css"/>','<style>'+open(ROOT+'/styles.css').read()+'</style>')
sources=['data.js','optimizer.mjs','importer.mjs','projects.mjs','catalogs.mjs','app.js']
script='\n'.join(open(ROOT+'/'+f).read() for f in sources)
script=re.sub(r'^import .*?;\n','',script,flags=re.M)
script=re.sub(r'\bexport (const|function) ',r'\1 ',script)
MAP_STUB="""window.L={
 map:()=>({setView(){return this},on(){},flyTo(){return this},fitBounds(){return this}}),
 control:{zoom:()=>({addTo(){}})},tileLayer:()=>({addTo(){}}),
 layerGroup:()=>({addTo(){return this},clearLayers(){},getLayers(){return[]}}),
 marker:()=>({bindPopup(){return this},addTo(){return this}}),
 circleMarker:()=>({addTo(){return this}}),divIcon:()=>({}),polyline:()=>({addTo(){return this}}),
 latLngBounds:()=>({extend(){},isValid(){return false},pad(){return this}})
};
const __storage={};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:(k)=>__storage[k]??null,setItem:(k,v)=>{__storage[k]=v},removeItem:(k)=>{delete __storage[k]},clear:()=>{for(const k in __storage)delete __storage[k]}}});
window.__readStorage=()=>__storage;
"""
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width,height in [(1366,850),(390,844)]:
  page=browser.new_page(viewport={'width':width,'height':height});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html)
  page.evaluate('(()=>{'+MAP_STUB+'})()')
  page.evaluate('(()=>{'+script+'})()')
  assert page.locator('.stop').count()==25
  page.once('dialog',lambda d:d.accept());page.locator('.stop-menu button[aria-label^="Remove"]').first.click()
  assert page.locator('.stop').count()==24
  page.locator('#project-new').click();page.locator('#project-name').fill('Christmas night 2026')
  page.locator('#project-holiday').select_option('Christmas');page.locator('#project-year').fill('2026')
  page.locator('#project-create-form button[type="submit"]').click()
  assert page.locator('.stop').count()==0
  page.locator('#bulk-toggle').click()
  page.locator('#website-url').fill('https://indywithkids.com/christmas-lights-list-indianapolis-central-indiana/')
  page.locator('#website-load').click()
  assert page.locator('.import-review-row').count()==12
  page.locator('#import-mode').select_option('replace')
  assert page.locator('.import-review-row').count()==12
  page.locator('#import-mode').select_option('append')
  assert page.locator('.import-review-row').count()==12
  page.locator('.import-review-row input[type="checkbox"]').first.uncheck()
  page.locator('#import-confirm').click()
  assert page.locator('.stop').count()==11
  assert page.locator('.verify-season').count()==11
  projects=page.evaluate('JSON.parse(window.__readStorage()["glowroute:projects:v2"])');assert len(projects['projects'])==2
  page.locator('#project-picker').select_option(label='Halloween 2026 · Irvington Halloween 2026')
  assert page.locator('.stop').count()==24
  page.locator('#project-duplicate').click()
  assert page.locator('#project-copy').is_checked()
  page.locator('#project-create-form button[type="submit"]').click()
  assert page.locator('.stop').count()==24
  assert page.locator('.verify-season').count()==24
  assert not errors,errors
  print('PASS',width,'universal stop removal, 2 isolated holidays, website snapshot checkbox review, year duplication')
  page.close()
 browser.close()
