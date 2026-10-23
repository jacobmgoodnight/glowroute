import {SEED_DISPLAYS,DEFAULT_START,DEFAULT_END} from './data.js';
import {optimize,routeCost,splitLegs,googleDirections,appleDirections} from './optimizer.mjs';

const $=id=>document.getElementById(id);
const defaultTop5=['ouija','lady','mcblackton','studio','circus'];
const STORE='glowroute:v1';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const createId=()=>`own-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const cloneSeed=()=>SEED_DISPLAYS.map(d=>({...d,lat:null,lon:null,geoSource:null,approved:false}));
const seedSelections=()=>new Set(SEED_DISPLAYS.filter(d=>d.featured).map(d=>d.id));
let state={displays:cloneSeed(),selected:seedSelections(),start:DEFAULT_START,end:DEFAULT_END,mode:'duration',preset:'top10',endpoints:{},cache:{}};
try {
  const v=JSON.parse(localStorage.getItem(STORE)||'null');
  if(v && Array.isArray(v.displays) && v.displays.length<=70) {
    state={...state,...v,selected:new Set(Array.isArray(v.selected)?v.selected:[])};
    state.displays=state.displays.filter(d=>d&&typeof d.id==='string'&&typeof d.address==='string');
    state.cache=state.cache||{};state.endpoints=state.endpoints||{};
  }
} catch(e){console.warn('Could not restore saved route',e)}
function save(){try{localStorage.setItem(STORE,JSON.stringify({...state,selected:[...state.selected]}));}catch(e){console.warn('Could not save locally',e)}}
let map,markerLayer,routeLayer,currentRoute=null,lastMatrix=null,currentPoints=null,lastGeoStatus=0,pinTarget=null,pinLatLon=null,busy=false;

function status(message,tone='') {const el=$('status');el.textContent=message;el.className='status '+tone;}
function mapLabel(message){$('map-label').textContent=message;}
function getSelected(){return state.displays.filter(x=>state.selected.has(x.id));}
function showResults(visible){$('results').classList.toggle('hidden',!visible)}
function invalidate(){currentRoute=null;lastMatrix=null;currentPoints=null;routeLayer?.clearLayers();showResults(false);$('estimate').classList.add('hidden');updatePins();}

function initMap(){
 if (!window.L){status('Could not load the map library. Check your connection.','error');return;}
 map=L.map('map',{zoomControl:false}).setView([39.775,-86.101],12);
 L.control.zoom({position:'bottomleft'}).addTo(map);
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19}).addTo(map);
 markerLayer=L.layerGroup().addTo(map);routeLayer=L.layerGroup().addTo(map);
 map.on('click',event=>{
   if(pinTarget===null)return;
   pinLatLon={lat:event.latlng.lat,lon:event.latlng.lng};
   L.circleMarker(event.latlng,{radius:9,color:'#fff',weight:2,fillColor:'#f59e0b',fillOpacity:1}).addTo(markerLayer);
   $('pin-info').textContent=`Pin selected: ${pinLatLon.lat.toFixed(6)}, ${pinLatLon.lon.toFixed(6)}`;
 });
 updatePins();
}
function icon(number,kind='stop',isExtra=false){const extra=isExtra?' extra':'';const label=number===null?'●':number;return L.divIcon({html:`<span class="marker-pin ${kind}${extra}">${label}</span>`,className:'',iconSize:[30,30],iconAnchor:[15,15]});}
function updatePins(){
 if(!markerLayer)return;
 markerLayer.clearLayers();const bounds=[];
 const order=currentRoute?currentRoute.order.map(i=>currentPoints[i]):getSelected();
 for(let i=0;i<order.length;i++){
   const d=order[i];if(!Number.isFinite(d?.lat)||!Number.isFinite(d?.lon))continue;
   const m=L.marker([d.lat,d.lon],{icon:icon(currentRoute?i+1:null,'stop',!d.featured)});
   const container=document.createElement('div'); const title=document.createElement('strong');title.textContent=d.name;
   const address=document.createElement('p');address.textContent=d.address;
   container.append(title,address);
   m.bindPopup(container);m.addTo(markerLayer);bounds.push([d.lat,d.lon]);
 }
 for(const [key,color] of [['start','start'],['end','end']]){
   const obj=state.endpoints[key];if(obj?.address!==state[key]||!Number.isFinite(obj.lat))continue;
   const m=L.marker([obj.lat,obj.lon],{icon:icon(null,color)});m.bindPopup(key==='start'?'Start':'Finish');m.addTo(markerLayer);bounds.push([obj.lat,obj.lon]);
 }
 if(bounds.length)mapLabel(`${bounds.length} locations mapped. Tap any pin for its address.`);
 else mapLabel('Optimize a route to locate and map the displays.');
}
function fitMap(){if(!map)return;const layers=[...markerLayer.getLayers(),...routeLayer.getLayers()];const bounds=L.latLngBounds([]);for(const layer of layers){if(layer.getLatLng)bounds.extend(layer.getLatLng());else if(layer.getBounds)bounds.extend(layer.getBounds());}if(bounds.isValid())map.fitBounds(bounds.pad(.14),{maxZoom:15});}
function renderStops(){
 const container=$('stop-list');container.replaceChildren();
 for(const item of state.displays){
   const active=state.selected.has(item.id),row=document.createElement('div');row.className='stop'+(active?' selected':'');
   const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=active;checkbox.setAttribute('aria-label',`Include ${item.name}`);
   checkbox.addEventListener('change',()=>{if(checkbox.checked)state.selected.add(item.id);else state.selected.delete(item.id);state.preset='custom';$('preset').value='custom';save();invalidate();renderStops();});
   const info=document.createElement('div');info.className='stop-content';
   const title=document.createElement('p');title.className='stop-title';title.textContent=item.name;
   const address=document.createElement('p');address.className='stop-address';address.textContent=item.address;
   info.append(title,address);
   const side=document.createElement('div');side.className='stop-menu';
   if(item.featured){const tag=document.createElement('span');tag.className='stop-tag highlight';tag.textContent='★';tag.title='Editorial highlight';side.append(tag)}
   if(Number.isFinite(item.lat)&&Number.isFinite(item.lon)){
     const tag=document.createElement('span');tag.className='stop-tag '+(item.approved?'ready':'warn');tag.textContent=item.approved?'✓':'≈';tag.title=item.approved?'Confirmed map pin':'Automatic pin: verify accuracy';side.append(tag);
   }
   const pin=document.createElement('button');pin.textContent='Pin';pin.title='Place or correct this stop on the map';pin.addEventListener('click',()=>beginPin(item.id));side.append(pin);
   if(item.id.startsWith('own-')){const remove=document.createElement('button');remove.textContent='×';remove.title='Delete stop';remove.addEventListener('click',()=>{state.displays=state.displays.filter(d=>d.id!==item.id);state.selected.delete(item.id);save();invalidate();renderStops();});side.append(remove)}
   row.append(checkbox,info,side);container.append(row);
 }
 $('stop-count').textContent=`${getSelected().length}/${state.displays.length}`;
}
function beginPin(id){
 if(!map){status('Map is not available; cannot set a pin.','error');return;}
 pinTarget=id;pinLatLon=null;
 const item=state.displays.find(d=>d.id===id);
 $('pin-info').textContent=`${item.name} · ${item.address}. Tap the correct location on the map.`;
 $('pin-dialog').showModal();
 // On mobile the map is visible above the dialog. Close dialog temporarily for clicking.
 $('pin-dialog').close();
 status(`Pin mode: tap the correct location for ${item.name} on the map, then tap Done below.`,'working');
 const toolbar=document.createElement('div');toolbar.id='pin-toolbar';toolbar.style.cssText='position:fixed;bottom:20px;left:20px;z-index:9999;display:flex;gap:8px;background:#121827;padding:9px;border-radius:12px;border:1px solid #f59e0b';
 const ok=document.createElement('button');ok.className='primary';ok.textContent='Done';ok.addEventListener('click',()=>{
   if(!pinLatLon){status('Tap the map first, then press Done.','error');return;}
   item.lat=pinLatLon.lat;item.lon=pinLatLon.lon;item.approved=true;item.geoSource='manual';
   delete state.cache[item.address.toLowerCase()];save();endPin();invalidate();renderStops();status(`${item.name} location saved on this device.`,'good');
 });
 const cancel=document.createElement('button');cancel.className='secondary';cancel.textContent='Cancel';cancel.addEventListener('click',endPin);
 toolbar.append(ok,cancel);document.body.append(toolbar);
 if(Number.isFinite(item.lat))map.flyTo([item.lat,item.lon],17);else map.flyTo([39.772,-86.105],14);
}
function endPin(){pinTarget=null;pinLatLon=null;$('pin-toolbar')?.remove();updatePins();}

async function lookupNominatim(address){
 const params=new URLSearchParams({q:address,format:'jsonv2',limit:'1',addressdetails:'1',countrycodes:'us'});
 const response=await fetch(`https://nominatim.openstreetmap.org/search?${params}`,{headers:{Accept:'application/json'}});
 if(!response.ok)throw Error(`Nominatim returned ${response.status}`);
 const results=await response.json();
 if(!results.length)throw Error(`Address not found: ${address}`);
 const p=results[0];return {lat:Number(p.lat),lon:Number(p.lon),source:'OpenStreetMap',display:p.display_name};
}
let censusCounter=0;
async function lookupCensus(address){
 // Census does not allow cross-origin fetch. Its officially documented JSONP option works from static GitHub Pages.
 // Coordinates are often street-interpolated and must be treated as approximate.
 const callback=`__glowCensus_${Date.now()}_${++censusCounter}`;
 const params=new URLSearchParams({address,benchmark:'Public_AR_Current',format:'jsonp',callback});
 const result=await new Promise((resolve,reject)=>{
   const script=document.createElement('script');let settled=false;
   const cleanup=()=>{clearTimeout(timer);script.remove();delete window[callback];};
   const finish=(error,data)=>{if(settled)return;settled=true;cleanup();if(error)reject(error);else resolve(data);};
   const timer=setTimeout(()=>finish(new Error('Census timed out')),4500);
   window[callback]=data=>finish(null,data);
   script.onerror=()=>finish(new Error('Census unavailable'));
   script.src=`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params}`;
   document.head.appendChild(script);
 });
 const hit=result?.result?.addressMatches?.[0];
 if(!hit?.coordinates)throw Error('No Census match');
 return {lat:Number(hit.coordinates.y),lon:Number(hit.coordinates.x),source:'Census (approximate)',display:hit.matchedAddress};
}
async function geocode(address,house=false){
 const key=address.trim().toLowerCase();if(state.cache[key])return state.cache[key];
 let result=null;
 // Use Census first for street addresses; landmarks and town centers prefer Nominatim.
 if(house && /\d/.test(address)){
   try{result=await lookupCensus(address)}catch(e){console.info('Census location unavailable',e.message)}
 }
 if(!result){
   const since=Date.now()-lastGeoStatus;if(since<1150)await delay(1150-since);
   lastGeoStatus=Date.now();result=await lookupNominatim(address);
 }
 if(!Number.isFinite(result.lat)||!Number.isFinite(result.lon))throw Error(`Invalid coordinates for ${address}`);
 state.cache[key]=result;save();return result;
}
async function resolvePoints(selected){
 const total=selected.length+2;let done=0;
 const endpoints=[];
 for(const key of ['start','end']){
   const address=state[key].trim();
   if(!address)throw Error(`Enter a ${key} address.`);
   if(state.endpoints[key]?.address!==address){
     status(`Finding ${key} location (${++done}/${total})…`,'working');
     const point=await geocode(address,false);
     state.endpoints[key]={...point,address};save();
   } else done++;
   endpoints.push(state.endpoints[key]);
 }
 for(const item of selected){
   if(!Number.isFinite(item.lat)||!Number.isFinite(item.lon)){
     status(`Finding ${item.name} (${++done}/${total})…`,'working');
     const p=await geocode(item.address,true);
     item.lat=p.lat;item.lon=p.lon;item.geoSource=p.source;item.approved=false;save();
   }else done++;
 }
 updatePins();renderStops();
 const points=[{name:'Start',address:state.start,...endpoints[0]},...selected,{name:'Finish',address:state.end,...endpoints[1]}];
 const inRange=points.every(p=>p.lat>39.1&&p.lat<40.5&&p.lon >-87.5&&p.lon< -84.5);
 if(!inRange)throw Error('One or more pins are outside the Indianapolis area. Verify addresses or reposition a pin.');
 return points;
}
const locationPath=points=>points.map(p=>`${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
async function roadMatrix(points){
 const url=`https://router.project-osrm.org/table/v1/driving/${locationPath(points)}?annotations=duration,distance`;
 const response=await fetch(url);
 if(!response.ok)throw Error(`Road routing service returned ${response.status}`);
 const json=await response.json();if(json.code!=='Ok'||!json.durations||!json.distances)throw Error(`Routing service: ${json.message||json.code||'unknown failure'}`);
 if(!json.durations.every(row=>row.every(Number.isFinite)) || !json.distances.every(row=>row.every(Number.isFinite)))throw Error('Some selected addresses cannot be connected by driving roads. Verify your map pins.');
 return json;
}
function haversine(a,b){const R=6371000;const rad=x=>x*Math.PI/180;const dlat=rad(b.lat-a.lat),dlon=rad(b.lon-a.lon);const q=Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlon/2)**2;return 2*R*Math.asin(Math.sqrt(q));}
function straightMatrix(points){return points.map(a=>points.map(b=>haversine(a,b)));}

const miles=meters=>`${(meters/1609.344).toFixed(1)} mi`;
const minutes=seconds=>`${Math.round(seconds/60)} min`;
function sumMetric(matrix,order){return routeCost(order,matrix)}
function renderMetrics(){
 if(!currentRoute||!lastMatrix)return;
 const {order,approx}=currentRoute;
 const travelDist=sumMetric(lastMatrix.distances,order);
 const travelTime=lastMatrix.durations?sumMetric(lastMatrix.durations,order):null;
 const originalMetric=approx?sumMetric(lastMatrix.distances,Array.from({length:order.length},(_,i)=>i+1)):sumMetric(lastMatrix[state.mode==='distance'?'distances':'durations'],Array.from({length:order.length},(_,i)=>i+1));
 const selectedMetric=approx?travelDist:sumMetric(lastMatrix[state.mode==='distance'?'distances':'durations'],order);
 const saved=Math.max(0,originalMetric-selectedMetric);
 const cells=[
  {number:String(order.length),label:'Stops'},
  {number:approx?'—':minutes(travelTime),label:approx?'Road time unavailable':'Est. driving time'},
  {number:approx?miles(travelDist):miles(travelDist),label:approx?'Straight-line total':'Driving distance'}
 ];
 $('metrics').replaceChildren();for(const c of cells){const el=document.createElement('div');el.className='metric';const strong=document.createElement('strong');strong.textContent=c.number;const small=document.createElement('span');small.textContent=c.label;el.append(strong,small);$('metrics').append(el)}
 const method=approx?'Straight-line fallback — NOT road-optimized':currentRoute.method==='exact'?'Exact best stop order for the road matrix':'Road-aware heuristic for larger routes';
 $('route-detail').textContent=`${method}. ${saved>0.01?'Improvement over list order: '+(approx?miles(saved):state.mode==='distance'?miles(saved):minutes(saved))+'. ':'Your existing order was already competitive. '}Estimates exclude time spent visiting displays and live traffic.`;
}
function waypointValue(item){
 if(item.geoSource==='manual')return `${item.lat.toFixed(6)},${item.lon.toFixed(6)}`;
 return item.address;
}
function renderNavigation(){
 const fullOrder=[...currentRoute.order,currentPoints.length-1];
 const googleLegs=splitLegs(fullOrder,4),appleLegs=splitLegs(fullOrder,13);
 $('segment-summary').textContent=`Apple: ${appleLegs.length} parts · Google: ${googleLegs.length} parts`;
 const out=$('nav-buttons');out.replaceChildren();
 for(const [label,legs,fn] of [['Apple Maps',appleLegs,appleDirections],['Google Maps',googleLegs,googleDirections]]){
   for(let i=0;i<legs.length;i++){
     const leg=legs[i];const origin=leg.start===null?currentPoints[0]:currentPoints[leg.start];
     const targets=leg.stops.map(j=>currentPoints[j]);
     const card=document.createElement('div');card.className='nav-segment';
     const info=document.createElement('div');const title=document.createElement('strong');title.textContent=`${label} · Part ${i+1}`;
     const sub=document.createElement('small');sub.textContent=`${targets.length} destination${targets.length===1?'':'s'} · Ends: ${targets.at(-1).name}`;info.append(title,sub);
     const link=document.createElement('a');link.className=label==='Google Maps'?'google':'';
     link.href=fn(waypointValue(origin),targets.map(waypointValue));link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open ↗';
     card.append(info,link);out.append(card);
   }
 }
}
function renderItinerary(){
 const container=$('itinerary');container.replaceChildren();
 const heading=document.createElement('h3');heading.textContent='Your optimized stop order';container.append(heading);
 currentRoute.order.forEach((index,pos)=>{
  const item=currentPoints[index],row=document.createElement('div');row.className='itinerary-row';
  const number=document.createElement('span');number.className='itinerary-index';number.textContent=pos+1;
  const label=document.createElement('div');label.className='itinerary-label';label.textContent=item.name;
  const small=document.createElement('small');small.textContent=item.address;label.append(small);
  const up=document.createElement('button');up.textContent='↑';up.title='Move earlier';up.disabled=pos===0;
  up.addEventListener('click',()=>swapStops(pos,pos-1));
  const down=document.createElement('button');down.textContent='↓';down.title='Move later';down.disabled=pos===currentRoute.order.length-1;
  down.addEventListener('click',()=>swapStops(pos,pos+1));
  row.append(number,label,up,down);container.append(row);
 });
 const last=document.createElement('p');last.className='planner-note';last.textContent='Start and finish stay fixed. Use arrows to manually adjust the visit order; links and map will update.';container.append(last);
}
async function swapStops(i,j){
 if(busy||!currentRoute)return;
 [currentRoute.order[i],currentRoute.order[j]]=[currentRoute.order[j],currentRoute.order[i]];
 renderRouteSummary();
 await drawRoute();
}
function renderRouteSummary(){
 showResults(true);renderMetrics();renderNavigation();renderItinerary();updatePins();mapLabel(currentRoute.approx?'Approximate straight-line order only — NOT based on roads':'Ordered using mapped driving roads. Inspect pins before navigating.');
}
async function drawRoute(){
 if(!routeLayer||!currentRoute)return;
 routeLayer.clearLayers();
 const arranged=[currentPoints[0],...currentRoute.order.map(i=>currentPoints[i]),currentPoints.at(-1)];
 if(currentRoute.approx){
  L.polyline(arranged.map(x=>[x.lat,x.lon]),{color:'#f59e0b',weight:4,dashArray:'6 9',opacity:.7}).addTo(routeLayer);fitMap();return;
 }
 try{
   const url=`https://router.project-osrm.org/route/v1/driving/${locationPath(arranged)}?overview=full&geometries=geojson&steps=false`;
   const response=await fetch(url);if(!response.ok)throw Error('Could not draw street route');
   const result=await response.json();const coords=result.routes?.[0]?.geometry?.coordinates;
   if(!coords?.length)throw Error('Route geometry missing');
   L.polyline(coords.map(([lon,lat])=>[lat,lon]),{color:'#fbbf24',weight:5,opacity:.94,lineJoin:'round'}).addTo(routeLayer);
 } catch(error){
   console.warn(error);
   L.polyline(arranged.map(x=>[x.lat,x.lon]),{color:'#f59e0b',dashArray:'5 9',weight:3,opacity:.6}).addTo(routeLayer);
   status('Stop order uses the road matrix, but street-shaped route drawing failed. Dashed lines are not driveable directions.','error');
 }
 fitMap();
}
async function calculate(approx=false){
 if(busy)return;
 const selected=getSelected();if(!selected.length){status('Choose at least one display.','error');return;}
 if(selected.length>68){status('Choose no more than 68 displays in one trip.','error');return;}
 state.start=$('start-input').value.trim();state.end=$('end-input').value.trim();
 state.mode=$('mode').value;save();invalidate();
 busy=true;$('optimize').disabled=true;$('estimate').classList.add('hidden');
 try{
   const points=await resolvePoints(selected); currentPoints=points;
   let matrixResult;
   if(approx){const m=straightMatrix(points);matrixResult={distances:m,durations:null};}
   else {status('Measuring real driving roads between all stops…','working');matrixResult=await roadMatrix(points);}
   lastMatrix=matrixResult;
   const values=approx?matrixResult.distances:state.mode==='distance'?matrixResult.distances:matrixResult.durations;
   status(`Finding a better order for ${selected.length} stops…`,'working');
   await delay(10);
   const answer=optimize(values);
   currentRoute={...answer,approx};
   renderRouteSummary();
   status(approx?'Approximate geographic ordering generated. This is NOT a road-aware route.':'Road-optimized itinerary generated. Verify approximate pins before driving.','good');
   await drawRoute();
 } catch(error){
   console.error(error);
   status(`Cannot complete routing: ${error.message}. Check addresses, try later, or use rough ordering.`, 'error');
   if(currentPoints&&currentPoints.every(p=>Number.isFinite(p.lat)))$('estimate').classList.remove('hidden');
 } finally{busy=false;$('optimize').disabled=false;}
}
function preset(value){
 state.preset=value;
 if(value==='top10')state.selected=new Set(state.displays.filter(x=>x.featured).map(x=>x.id));
 if(value==='top5')state.selected=new Set(defaultTop5);
 if(value==='all')state.selected=new Set(state.displays.map(x=>x.id));
 save();invalidate();renderStops();
}
function addStop(event){
 event.preventDefault();const name=$('new-name').value.trim(),address=$('new-address').value.trim();
 if(!name||!address)return;
 if(state.displays.length>=70){status('Limit of 70 display addresses.','error');return;}
 const id=createId();state.displays.push({id,name,address,score:3,lat:null,lon:null,featured:0,approved:false});state.selected.add(id);
 state.preset='custom';$('preset').value='custom';save();invalidate();renderStops();$('add-form').reset();$('add-form').classList.add('hidden');
 status('Added your stop. It will be geocoded when you optimize.','good');
}
function exportStops(){
 const records=state.displays.map(({id,name,address,lat,lon,featured,score,approved,geoSource})=>({id,name,address,lat,lon,featured,score,approved,geoSource}));
 const file=new Blob([JSON.stringify({version:1,displays:records,selected:[...state.selected]},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download='glowroute-stops.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importStops(event){
 const file=event.target.files?.[0];if(!file)return;
 try{
   if(file.size>150_000)throw Error('File too large');
   const input=JSON.parse(await file.text());if(!Array.isArray(input.displays))throw Error('Invalid format. Expected an object with displays array.');
   if(input.displays.length>70)throw Error('Max 70 imported stops.');
   const clean=input.displays.map((d,i)=>({id:`own-import-${i}-${Date.now()}`,name:String(d.name||'Display').slice(0,80),address:String(d.address||'').slice(0,170),lat:Number.isFinite(d.lat)?d.lat:null,lon:Number.isFinite(d.lon)?d.lon:null,geoSource:'imported',approved:false,featured:0,score:3})).filter(d=>d.address.trim());
   if(!clean.length)throw Error('No valid addresses in file.');
   state.displays=[...cloneSeed(),...clean].slice(0,70);state.selected=new Set(clean.map(d=>d.id));state.preset='custom';$('preset').value='custom';save();invalidate();renderStops();status(`Imported ${clean.length} additional stops; please verify imported map pins.`,'good');
 }catch(error){status(`Import failed: ${error.message}`,'error');}
 event.target.value='';
}
function setEndpoint(key,value){
 state[key]=value;delete state.endpoints[key];save();invalidate();
}
function wire(){
 $('start-input').value=state.start;$('end-input').value=state.end;$('mode').value=state.mode;$('preset').value=state.preset;
 $('start-input').addEventListener('change',e=>setEndpoint('start',e.target.value.trim()));
 $('end-input').addEventListener('change',e=>setEndpoint('end',e.target.value.trim()));
 $('mode').addEventListener('change',e=>{state.mode=e.target.value;save();invalidate();});
 $('preset').addEventListener('change',e=>preset(e.target.value));
 $('optimize').addEventListener('click',()=>calculate(false));$('estimate').addEventListener('click',()=>calculate(true));
 $('reset').addEventListener('click',()=>{
  if(!confirm('Reset your stops and saved locations to the original Irvington list?'))return;
  try{localStorage.removeItem(STORE)}catch{};
  state={displays:cloneSeed(),selected:seedSelections(),start:DEFAULT_START,end:DEFAULT_END,mode:'duration',preset:'top10',endpoints:{},cache:{}};
  $('start-input').value=state.start;$('end-input').value=state.end;$('mode').value=state.mode;$('preset').value=state.preset;
  save();invalidate();renderStops();status('Reset to the featured 10 Irvington displays.');
 });
 $('add-toggle').addEventListener('click',()=>$('add-form').classList.toggle('hidden'));
 $('add-form').addEventListener('submit',addStop);
 $('all-btn').addEventListener('click',()=>{state.selected=new Set(state.displays.map(d=>d.id));state.preset='all';$('preset').value='all';save();invalidate();renderStops();});
 $('clear-btn').addEventListener('click',()=>{state.selected=new Set();state.preset='custom';$('preset').value='custom';save();invalidate();renderStops();});
 $('export-json').addEventListener('click',exportStops);
 $('import-json').addEventListener('change',importStops);
 $('fit').addEventListener('click',fitMap);
 renderStops();initMap();
 if('serviceWorker' in navigator && location.protocol==='https:')navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(console.warn);
}
wire();
