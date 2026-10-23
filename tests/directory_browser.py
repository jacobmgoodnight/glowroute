"""Offline browser tests for directory and project-year isolation (no external network)."""
import os,re,json
from playwright.sync_api import sync_playwright
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
html=open(ROOT+'/index.html').read();html=re.sub(r'<script type="module" src="\./app.js"></script>','',html)
html=re.sub(r'<link rel="stylesheet" href="https://unpkg.com/leaflet.*?/>','',html)
html=html.replace('<link rel="stylesheet" href="./styles.css"/>','<style>'+open(ROOT+'/styles.css').read()+'</style>')
sources=['data.js','optimizer.mjs','importer.mjs','projects.mjs','catalogs.mjs','directory.mjs','app.js']
script='\n'.join(open(ROOT+'/'+f).read() for f in sources)
script=re.sub(r'^import .*?;\n','',script,flags=re.M)
script=re.sub(r'\bexport (const|function) ',r'\1 ',script)
entries=json.loads(open(ROOT+'/directory/catalog.json').read())
STUB="""window.L={
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
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width,height in [(1380,820),(390,844)]:
  page=b.new_page(viewport={'width':width,'height':height});errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
  page.set_content(html)
  page.evaluate('(()=>{'+STUB+'window.__catalog='+json.dumps(entries)+';window.fetch=async()=>({ok:true,json:async()=>window.__catalog});})()')
  page.evaluate('(()=>{'+script+'})()')
  assert page.locator('.stop').count()==25
  page.locator('#directory-toggle').click()
  assert page.locator('.directory-row').count()==31
  page.locator('#directory-season').select_option('Halloween')
  page.locator('#directory-year').select_option('2026')
  assert page.locator('.directory-row').count()==19
  page.locator('.directory-row input[type=checkbox]').first.check()
  page.locator('#directory-review-selected').click()
  assert page.locator('.directory-review-row').count()==1
  assert page.locator('#directory-apply').is_disabled()
  page.locator('#directory-cancel').click()
  page.locator('#directory-refresh-project').click()
  assert page.locator('.directory-review-row').count()==19
  assert page.locator('#directory-apply').is_enabled()
  page.once('dialog',lambda d:d.accept())
  page.locator('#directory-apply').click()
  assert page.locator('.stop').count()==25
  page.locator('#project-new').click()
  page.locator('#project-name').fill('Fresh Xmas 2025')
  page.locator('#project-holiday').select_option('Christmas')
  page.locator('#project-year').fill('2025')
  page.locator('#project-create-form button[type=submit]').click()
  assert page.locator('.stop').count()==0
  page.locator('#directory-season').select_option('Christmas')
  page.locator('#directory-year').select_option('2025')
  assert page.locator('.directory-row').count()==12
  page.locator('#directory-refresh-project').click()
  assert page.locator('#directory-apply').is_enabled()
  page.once('dialog',lambda d:d.accept())
  page.locator('#directory-apply').click()
  assert page.locator('.stop').count()==12
  assert page.locator('.verify-season').count()==12
  page.once('dialog',lambda d:d.accept('Test parking notes'))
  page.locator('.stop-menu button',has_text='Notes').first.click()
  assert 'Test parking notes' in page.locator('.stop').first.inner_text()
  page.locator('.stop-menu button',has_text='Visited').first.click()
  assert '✓ Visited' in page.locator('.stop').first.inner_text()
  page.locator('#project-duplicate').click()
  page.locator('#project-create-form button[type=submit]').click()
  assert page.locator('.stop').count()==12
  assert not page.locator('.stop').first.locator('.stop-tag.ready').count()
  assert 'Test parking notes' in page.locator('.stop').first.inner_text()
  assert not errors,errors
  print('PASS',width,'directory review and import, matched refresh, notes, visited reset on clone')
  page.close()
 b.close()
