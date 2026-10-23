"""End-to-end browser flow with deterministic road-service fixtures; no real API requests."""
from playwright.sync_api import sync_playwright
import json, os, re
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
html=open(root+'/index.html').read()
html=re.sub(r'<script type="module" src="\./app.js"></script>','',html)
html=re.sub(r'<link rel="stylesheet" href="https://unpkg.com/leaflet.*?/>','',html)
html=html.replace('<link rel="stylesheet" href="./styles.css"/>','<style>'+open(root+'/styles.css').read()+'</style>')
sources=['data.js','optimizer.mjs','importer.mjs','projects.mjs','catalogs.mjs','directory.mjs','tour.mjs','app.js']
script='\n'.join(open(root+'/'+f).read() for f in sources)
script=re.sub(r'^import .*?;\n','',script,flags=re.M)
script=re.sub(r'\bexport (const|function) ',r'\1 ',script)
script+='\nwindow.__showShared=inspectSharedLink;'

STUB=r"""
window.L={
 map:()=>({setView(){return this},on(){},flyTo(){return this},fitBounds(){return this}}),
 control:{zoom:()=>({addTo(){}})},tileLayer:()=>({addTo(){}}),
 layerGroup:()=>({addTo(){return this},clearLayers(){},getLayers(){return[]}}),
 marker:()=>({bindPopup(){return this},addTo(){return this}}),
 circleMarker:()=>({addTo(){return this}}),divIcon:()=>({}),polyline:()=>({addTo(){return this}}),
 latLngBounds:()=>({extend(){},isValid(){return false},pad(){return this}})
};
const __store={};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:(k)=>__store[k]??null,setItem:(k,v)=>{__store[k]=v},removeItem:(k)=>{delete __store[k]}}});
const houses=Array.from({length:4},(_,i)=>({id:'demo'+i,name:'House '+i,address:`${100+i} N Test St, Indianapolis, IN`,lat:39.77+.001*i,lon:-86.11+.001*i,approved:true,rating:3,favorite:i===0,visited:false,featured:i===0}));
localStorage.setItem('glowroute:projects:v2',JSON.stringify({activeId:'t1',projects:[{id:'t1',name:'Halloween test',holiday:'Halloween',year:2026,createdAt:new Date().toISOString(),state:{displays:houses,selected:houses.map(x=>x.id),start:'Zoo',end:'New Palestine, Indiana',mode:'duration',preset:'custom',budgetEnabled:false,budgetMinutes:44,viewMinutes:4,endpoints:{start:{address:'Zoo',lat:39.75,lon:-86.14},end:{address:'New Palestine, Indiana',lat:39.76,lon:-86.06}},cache:{}}}]}));
history.replaceState=()=>{window.location.hash='';};window.__copied='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async txt=>{window.__copied=txt}}});
"""
STUB+=r'''
window.fetch=async(url)=>{
 if(!String(url).includes('router.project-osrm.org'))throw Error('Unexpected URL '+url);
 const args=String(url).split('/driving/')[1].split('?')[0].split(';');const n=args.length;
 if(String(url).includes('/table/')){
  return {ok:true,json:async()=>({code:'Ok',durations:Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?0:480)),distances:Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?0:2000))})};
 }
 return {ok:true,json:async()=>({code:'Ok',routes:[{duration:(n-1)*480,distance:(n-1)*2000,geometry:{coordinates:args.map(x=>x.split(',').map(Number))}}]})};
};
'''
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width,height in [(1350,850),(390,844)]:
   context=browser.new_context(viewport={'width':width,'height':height})
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.set_content(html)
   page.evaluate('(()=>{'+STUB+'})()')
   page.evaluate('(()=>{'+script+'})()')
   page.wait_for_selector('.stop')
   assert page.locator('.stop').count()==4
   page.locator('.stop-preferences button').first.click()
   page.locator('.stop').first.locator('.rating-select').select_option('5')
   page.locator('.stop').first.locator('.stop-preferences button').nth(1).click()
   page.locator('#budget-enabled').check();page.locator('#budget-minutes').fill('44')
   page.locator('#optimize').click()
   page.wait_for_function("document.querySelector('#results').classList.contains('hidden')===false")
   page.wait_for_function("document.querySelector('#route-choices').textContent.includes('min')")
   assert 'Time-budget selection' in page.locator('#route-detail').inner_text()
   assert page.locator('.itinerary-row').count()==3, page.locator('#itinerary').inner_text()
   page.locator('#share-link').click()
   page.wait_for_function("window.__copied.includes('#tour=')")
   share=page.evaluate('window.__copied')
   assert '#tour=' in share
   assert 'New Palestine' not in share  # not included in the default share URL payload
   page.locator('#drive-start').click()
   assert 'remaining' in page.locator('#drive-current').inner_text()
   page.locator('#drive-skip').click()
   page.wait_for_function("document.querySelector('#drive-current').textContent.includes('2 remaining')")
   saved=page.evaluate("JSON.parse(localStorage.getItem('glowroute:projects:v2'))")
   assert any(d.get('skipped') for d in saved['projects'][0]['state']['displays'])
   page.locator('#drive-visited').click()
   page.wait_for_function("document.querySelector('#drive-current').textContent.includes('1 remaining')")
   page.locator('#drive-end').click()
   # Shared route preview imports to new project, without modifying the prior one.
   page.evaluate('(value)=>{window.location.hash=value.split("#")[1];window.__showShared();}',share)
   page.wait_for_selector('#shared-preview:not(.hidden)')
   assert page.locator('#shared-stops p').count()==3
   page.locator('#shared-import').click()
   names=page.locator('#project-picker option').all_text_contents()
   assert len(names)==2 and any('Halloween test' in name for name in names)
   assert not errors,errors
   print('PASS',width,'ratings, budget, road comparison, drive skip/visit, share redaction and import')
   context.close()
  browser.close()
finally:
 pass
