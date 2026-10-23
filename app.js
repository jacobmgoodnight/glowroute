import {SEED_DISPLAYS,DEFAULT_START,DEFAULT_END} from './data.js';
import {optimize,routeCost,splitLegs,googleDirections,appleDirections} from './optimizer.mjs';
import {parseImportedStops,canonicalAddress} from './importer.mjs';
import {PROJECT_STORE,makeProject,cloneProject,revivePortfolio,snapshotState,uniqueProjectName} from './projects.mjs';
import {DIRECTORIES,findCatalog,htmlToText} from './catalogs.mjs';

const $=id=>document.getElementById(id);
const defaultTop5=['ouija','lady','mcblackton','studio','circus'];
const STORE='glowroute:v1';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const createId=()=>`own-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const cloneSeed=()=>SEED_DISPLAYS.map(d=>({...d,lat:null,lon:null,geoSource:null,approved:false}));
const seedSelections=()=>new Set(SEED_DISPLAYS.filter(d=>d.featured).map(d=>d.id));
const seedState=()=>({displays:cloneSeed(),selected:seedSelections(),start:DEFAULT_START,end:DEFAULT_END,mode:'duration',preset:'top10',endpoints:{},cache:{}});
let legacy=null,rawPortfolio=null;
try{legacy=JSON.parse(localStorage.getItem(STORE)||'null');rawPortfolio=JSON.parse(localStorage.getItem(PROJECT_STORE)||'null');}catch(e){console.warn('Could not read saved drives',e)}
let portfolio=revivePortfolio(rawPortfolio,legacy,seedState());
let activeProjectId=portfolio.activeId;
let state=stateFromProject(portfolio.projects.find(p=>p.id===activeProjectId));
function stateFromProject(p){const saved=p?.state||seedState();return {...seedState(),...saved,selected:new Set(Array.isArray(saved.selected)?saved.selected:[]),displays:saved.displays.map(d=>({...d})),endpoints:{...(saved.endpoints||{})},cache:{...(saved.cache||{})}};}
function currentProject(){return portfolio.projects.find(p=>p.id===activeProjectId)}
function save(){
 const project=currentProject();if(!project)return;
 project.state=snapshotState(state);project.updatedAt=new Date().toISOString();
 portfolio.activeId=activeProjectId;
 try{localStorage.setItem(PROJECT_STORE,JSON.stringify(portfolio));}catch(error){console.warn('Storage full; export a backup',error);status?.('Local storage is full. Export a project backup so you do not lose changes.','error');}
}
let map,markerLayer,routeLayer,currentRoute=null,lastMatrix=null,currentPoints=null,lastGeoStatus=0,pinTarget=null,pinLatLon=null,busy=false;

function status(message,tone='') {const el=$('status');el.textContent=message;el.className='status '+tone;}
function mapLabel(message){$('map-label').textContent=message;}
function getSelected(){return state.displays.filter(x=>state.selected.has(x.id));}
function showResults(visible){$('results').classList.toggle('hidden',!visible)}
function invalidate(){currentRoute=null;lastMatrix=null;currentPoints=null;routeLayer?.clearLayers();showResults(false);$('estimate').classList.add('hidden');updatePins();}

async function ensureLeaflet(){
 if(window.L)return;
 const sources=[
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'
 ];
 for(const source of sources){
  try{
   await new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=source;
    script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('CDN blocked or unavailable'));};
    document.head.appendChild(script);
   });
   if(window.L)return;
  }catch(error){console.warn('Map provider unavailable:',source,error)}
 }
 throw new Error('Leaflet JavaScript could not be loaded from either provider');
}
async function initMap(){
 try{await ensureLeaflet();}catch(error){status('Could not load the map library. Check your network or content blockers, then reload.','error');mapLabel('Map library unavailable. Your route planner can still calculate stops.');return;}
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
   if(item.sourceUrl){const source=document.createElement('a');source.href=/^https:\/\//i.test(item.sourceUrl)?item.sourceUrl:'#';source.target='_blank';source.rel='noopener noreferrer';source.className='stop-source';source.textContent=`↗ ${item.sourceName||'Source'}${item.sourceYear?' · '+item.sourceYear:''}`;info.append(source)}
   const side=document.createElement('div');side.className='stop-menu';
   if(item.featured){const tag=document.createElement('span');tag.className='stop-tag highlight';tag.textContent='★';tag.title='Editorial highlight';side.append(tag)}
   if(Number.isFinite(item.lat)&&Number.isFinite(item.lon)){
     const tag=document.createElement('span');tag.className='stop-tag '+(item.approved?'ready':'warn');tag.textContent=item.approved?'✓':'≈';tag.title=item.approved?'Confirmed map pin':'Automatic pin: verify accuracy';side.append(tag);
   }
   const pin=document.createElement('button');pin.textContent='Pin';pin.title='Place or correct this stop on the map';pin.addEventListener('click',()=>beginPin(item.id));side.append(pin);
   if(item.needsSeasonCheck){const verify=document.createElement('button');verify.className='verify-season';verify.title='Mark this display verified for this season';verify.textContent='Verify ✓';verify.addEventListener('click',()=>{if(!confirm(`Have you checked that “${item.name}” is operating for ${currentProject().holiday} ${currentProject().year}?`))return;item.needsSeasonCheck=false;item.seasonCheckedYear=currentProject().year;save();renderStops();status('Season marked verified for this project.','good');});side.append(verify)}
   const remove=document.createElement('button');remove.textContent='×';remove.title='Remove this stop from this project';remove.setAttribute('aria-label',`Remove ${item.name}`);remove.addEventListener('click',()=>removeStop(item.id));side.append(remove);
   row.append(checkbox,info,side);container.append(row);
 }
 $('stop-count').textContent=`${getSelected().length}/${state.displays.length}`;
}
function removeStop(id){
 const item=state.displays.find(d=>d.id===id);if(!item)return;
 if(!confirm(`Remove “${item.name}” from this project? Other holiday projects stay unchanged.`))return;
 state.displays=state.displays.filter(d=>d.id!==id);state.selected.delete(id);
 state.preset='custom';$('preset').value='custom';save();invalidate();renderStops();status(`Removed ${item.name} from this project.`,'good');
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
function updateProjectSelect(){
 const picker=$('project-picker');picker.replaceChildren();
 const entries=[...portfolio.projects].sort((a,b)=>b.year-a.year||a.holiday.localeCompare(b.holiday));
 for(const project of entries){const option=new Option(`${project.holiday} ${project.year} · ${project.name}`,project.id);picker.append(option)}
 picker.value=activeProjectId;
 const p=currentProject();$('project-detail').textContent=`${p.holiday} ${p.year} · ${state.displays.length} saved displays · stored on this device`;
}
function syncControls(){
 $('start-input').value=state.start;$('end-input').value=state.end;$('mode').value=state.mode;$('preset').value=state.preset;
 updateProjectSelect();
}
function changeProject(id){
 if(id===activeProjectId)return;
 if(!portfolio.projects.some(p=>p.id===id))return;
 save();activeProjectId=id;state=stateFromProject(currentProject());syncControls();invalidate();renderStops();closeImport();status(`Opened “${currentProject().name}”.`,'good');save();
}
function openProjectEditor(copy=false){
 const source=currentProject();$('project-editor').classList.remove('hidden');$('project-name').value=copy?`${source.holiday} ${Math.max(source.year+1,2026)} Drive`:'';
 $('project-holiday').value=source.holiday;$('project-year').value=copy?Math.min(2100,source.year+1):2026;
 $('project-copy').checked=copy;$('project-editor').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function createNewProject(e){
 e.preventDefault();if(portfolio.projects.length>=40){status('Maximum of 40 local projects. Export and archive projects first.','error');return;}
 const year=Number($('project-year').value),holiday=$('project-holiday').value;
 if(year<2000||year>2100){status('Enter a valid season year.','error');return;}
 const name=uniqueProjectName($('project-name').value||`${holiday} ${year} Drive`,portfolio.projects);
 save();let p;
 if($('project-copy').checked){p=cloneProject(currentProject(),{year,holiday,name});}
 else{p=makeProject({name,holiday,year,displays:[],selected:[],start:state.start,end:state.end,preset:'custom'});}
 portfolio.projects.push(p);activeProjectId=p.id;state=stateFromProject(p);
 $('project-editor').classList.add('hidden');syncControls();invalidate();renderStops();save();
 status(`Created ${name}.${p.sourceYear?' Review each previous-year display before driving.':' Add displays using a website, paste, or file.'}`,'good');
}
function deleteProject(){
 if(portfolio.projects.length<2){status('Keep at least one project. Create another before deleting this one.','error');return;}
 const p=currentProject();if(!confirm(`Delete “${p.name}” and its saved stops from this device? This cannot be undone unless you have a backup.`))return;
 portfolio.projects=portfolio.projects.filter(x=>x.id!==p.id);activeProjectId=portfolio.projects[0].id;state=stateFromProject(currentProject());syncControls();invalidate();renderStops();save();status('Project deleted.','good');
}
function backupProjects(){
 save();const file=new Blob([JSON.stringify({version:2,exportedAt:new Date().toISOString(),...portfolio},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=`glowroute-projects-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
async function restoreProjects(event){
 const file=event.target.files?.[0];if(!file)return;
 try{if(file.size>2_000_000)throw Error('Backup exceeds 2 MB');const data=JSON.parse(await file.text());
  if(!Array.isArray(data.projects)||data.version!==2||!data.projects.length||data.projects.length>40)throw Error('Not a GlowRoute v2 project backup');
  const revived=revivePortfolio(data,null,seedState());if(!confirm(`Restore ${revived.projects.length} saved projects? This replaces current projects on this device. Export a backup first if needed.`))return;
  portfolio=revived;activeProjectId=portfolio.activeId;state=stateFromProject(currentProject());syncControls();invalidate();renderStops();save();status('Projects restored successfully.','good');
 }catch(error){status('Could not restore project backup: '+error.message,'error')}finally{event.target.value=''}
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
 const records=state.displays.map(({id,name,address,lat,lon,featured,score,approved,geoSource,sourceUrl,sourceName,sourceYear,needsSeasonCheck})=>({id,name,address,lat,lon,featured,score,approved,geoSource,sourceUrl,sourceName,sourceYear,needsSeasonCheck}));
 const file=new Blob([JSON.stringify({version:1,displays:records,selected:[...state.selected]},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download=`glowroute-${currentProject().holiday.toLowerCase()}-${currentProject().year}-stops.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
let pendingImport=[],importIssues=[],importOrigin=null,sourceRecords=null;
function importSourceData(records,{name='Manual import',url='',year=null,season=null}={}){
 importOrigin={name,url,year,season};
 $('bulk-text').dataset.sourceUrl=url;$('bulk-text').dataset.sourceName=name;
 const existing=new Set(state.displays.map(d=>canonicalAddress(d.address)));
 const mode=$('import-mode').value;
 const unique=new Set();let duplicates=0;
 pendingImport=[];
 for(const record of records){const key=canonicalAddress(record.address);if(!key||unique.has(key)){duplicates++;continue}unique.add(key);
   if(mode!=='replace'&&existing.has(key))continue;
   pendingImport.push({name:String(record.name||record.address).slice(0,80),address:String(record.address||'').slice(0,170),lat:record.lat??null,lon:record.lon??null,include:true});
 }
 importIssues=[];
 const ignored=records.length-pendingImport.length-duplicates;
 renderImportRows(`${records.length} addresses read · ${ignored} already in this project · ${duplicates} duplicates in the listing`);
}
function renderImportRows(summary='Review each stop before importing'){
 const panel=$('bulk-preview');panel.replaceChildren();
 const heading=document.createElement('strong');heading.textContent=summary;panel.append(heading);
 if(importOrigin){const meta=document.createElement('p');meta.className='hint';meta.textContent=`Source: ${importOrigin.name}${importOrigin.year?' · '+importOrigin.year:''}. ${importOrigin.year&&Number(importOrigin.year)!==currentProject().year?'Different season year — verify before visiting.':''} Listings are not proof a house is active this year.`;panel.append(meta)}
 for(const note of importIssues){const p=document.createElement('p');p.className='import-warning';p.textContent=note;panel.append(p)}
 pendingImport.forEach((rec,i)=>{
  const line=document.createElement('div');line.className='import-review-row';
  const row=document.createElement('label');row.className='review-select';const cb=document.createElement('input');cb.type='checkbox';cb.checked=rec.include;cb.setAttribute('aria-label',`Include ${rec.name}`);cb.addEventListener('change',()=>{rec.include=cb.checked;updateImportConfirm()});row.append(cb,document.createTextNode(` Stop ${i+1}`));
  const name=document.createElement('input');name.value=rec.name;name.maxLength=80;name.setAttribute('aria-label',`Display name ${i+1}`);name.addEventListener('input',()=>{rec.name=name.value;updateImportConfirm()});
  const addr=document.createElement('input');addr.value=rec.address;addr.maxLength=170;addr.setAttribute('aria-label',`Street address ${i+1}`);addr.addEventListener('input',()=>{rec.address=addr.value;rec.lat=null;rec.lon=null;updateImportConfirm()});
  line.append(row,name,addr);panel.append(line);
 });
 updateImportConfirm();
}
function updateImportConfirm(){
 const active=pendingImport.filter(x=>x.include);
 const allowed=$('import-mode').value==='replace'?70:70-state.displays.length;
 const seen=new Set();let duplicate=false;
 const existing=new Set(state.displays.map(d=>canonicalAddress(d.address)));
 for(const item of active){const address=canonicalAddress(item.address);if(seen.has(address)||$('import-mode').value!=='replace'&&existing.has(address))duplicate=true;seen.add(address)}
 const bad=active.some(item=>!/\b\d{1,6}\s+[A-Za-z]/.test(item.address)||!item.name.trim());
 $('import-confirm').disabled=active.length===0||active.length>allowed||duplicate||bad||importIssues.length>0;
 $('import-confirm').textContent=`${$('import-mode').value==='replace'?'Replace with':'Add'} ${active.length} selected displays`;
 let warning=$('review-message');if(!warning){warning=document.createElement('p');warning.id='review-message';warning.className='import-warning';$('bulk-preview').append(warning)}
 warning.textContent=active.length>allowed?`This project has room for only ${allowed} more stops.`:duplicate?'Selected addresses contain duplicates or match existing stops. Uncheck or edit them.':bad?'Some selected stops need a valid name and numbered street address.':'Addresses and display activity still require verification.';
}
function showImportPreview(){
 if(sourceRecords){importSourceData(sourceRecords,importOrigin||{});return;}
 const parsed=parseImportedStops($('bulk-text').value,{defaultCity:$('import-city').value||'Indianapolis, IN 46219',filename:$('bulk-text').dataset.filename||''});
 importIssues=parsed.issues;
 importSourceData(parsed.records,{name:$('bulk-text').dataset.sourceName||'Pasted or uploaded listing',url:$('bulk-text').dataset.sourceUrl||'',year:importOrigin?.year||null});
 importIssues=parsed.issues;
 renderImportRows(`${parsed.records.length} unique addresses recognized · ${parsed.duplicates} duplicates in source`);
}
function closeImport(){$('bulk-panel').classList.add('hidden');pendingImport=[];importOrigin=null;sourceRecords=null;$('import-confirm').disabled=true;}
async function loadImportFile(event){
 const file=event.target.files?.[0];if(!file)return;
 try{if(file.size>400_000)throw Error('Maximum file size 400 KB.');$('bulk-text').value=await file.text();sourceRecords=null;$('bulk-text').dataset.filename=file.name;delete $('bulk-text').dataset.sourceUrl;delete $('bulk-text').dataset.sourceName;importOrigin=null;
  $('bulk-panel').classList.remove('hidden');showImportPreview();status(`Reviewing ${file.name}.`,'good');
 }catch(error){status('Import error: '+error.message,'error')}event.target.value='';
}
async function loadWebsite(){
 const value=$('website-url').value.trim();if(!value){status('Enter a source website URL.','error');return;}
 let url;try{url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)throw Error('HTTPS URL required');if(/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname))throw Error('Public websites only')}catch(e){status('Use a public HTTPS listing URL.','error');return;}
 $('bulk-panel').classList.remove('hidden');
 const catalog=findCatalog(url.href);
 if(catalog){
  sourceRecords=catalog.records.map(r=>({...r}));
  importSourceData(catalog.records,{name:catalog.name,url:catalog.url,year:catalog.year,season:catalog.season});
  $('website-note').textContent=`Loaded ${catalog.records.length} addresses from an attributed ${catalog.year} catalog snapshot (not a live page fetch). Review before importing.`;
  status(`Loaded reviewed source snapshot: ${catalog.name}.`,'good');return;
 }
 $('website-note').textContent='Trying direct browser access. Many directory websites block it for security.';
 $('website-load').disabled=true;
 try{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9500);
  let response;try{response=await fetch(url.href,{mode:'cors',credentials:'omit',signal:controller.signal});}finally{clearTimeout(timer)}
  if(!response.ok)throw Error(`Website returned ${response.status}`);
  const type=response.headers.get('content-type')||'';if(!/text\/html|text\/plain|text\/csv|application\/json/i.test(type))throw Error('This website does not provide a readable listing');
  const text=await response.text();if(text.length>400000)throw Error('Listing exceeds the 400 KB import limit');
  sourceRecords=null;$('bulk-text').value=type.includes('html')?htmlToText(text):text;
  $('bulk-text').dataset.sourceUrl=url.href;$('bulk-text').dataset.sourceName=url.hostname;delete $('bulk-text').dataset.filename;
  importOrigin={name:url.hostname,url:url.href,year:currentProject().year};
  showImportPreview();$('website-note').textContent='Direct page access succeeded. Inspect all addresses before adding.';status('Page retrieved. Check the import preview.','good');
 }catch(error){
  $('website-note').textContent='Automatic access was blocked or unavailable (common with browser CORS). Open the source page, copy its visible listing, paste it below, and choose Preview addresses. The source URL will be retained.';
  $('bulk-text').dataset.sourceUrl=url.href;$('bulk-text').dataset.sourceName=url.hostname;
  importOrigin={name:url.hostname,url:url.href,year:null};
  status('Direct website import unavailable. Copy and paste its address list for review; no scraping workaround is used.','error');
 }finally{$('website-load').disabled=false;}
}
function commitImport(){
 if($('import-confirm').disabled)return;const active=pendingImport.filter(x=>x.include);
 const mode=$('import-mode').value,oldCount=state.displays.length;
 const incoming=active.map(r=>({id:createId(),name:r.name.trim(),address:r.address.trim(),score:3,lat:r.lat,lon:r.lon,geoSource:r.lat!==null?'imported':null,featured:0,approved:false,sourceName:importOrigin?.name||'User import',sourceUrl:importOrigin?.url||'',sourceYear:importOrigin?.year||null,needsSeasonCheck:true}));
 if(mode==='replace'){if(!confirm(`Replace all ${oldCount} stops in this project with ${incoming.length} reviewed stops? Other projects will be unaffected.`))return;state.displays=incoming;state.selected=new Set(incoming.map(x=>x.id));}
 else{state.displays.push(...incoming);state.selected=new Set([...state.selected,...incoming.map(x=>x.id)]);}
 state.preset='custom';$('preset').value='custom';save();invalidate();renderStops();updateProjectSelect();closeImport();status(`Added ${incoming.length} reviewed displays to “${currentProject().name}”. Check their locations and current-year activity.`,'good');
}
function renderDirectories(){const list=$('source-directories');list.replaceChildren();for(const source of DIRECTORIES){
 const row=document.createElement('div');row.className='source-directory';const link=document.createElement('a');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=source.name+' ↗';
 const button=document.createElement('button');button.type='button';button.className='mini-button';button.textContent=source.id.startsWith('indy')?'Review snapshot':'Use URL';button.addEventListener('click',()=>{$('website-url').value=source.url;loadWebsite();});
 row.append(link,button);list.append(row);
 }}
function setEndpoint(key,value){
 state[key]=value;delete state.endpoints[key];save();invalidate();
}
function wire(){
 syncControls();
 $('start-input').addEventListener('change',e=>setEndpoint('start',e.target.value.trim()));
 $('end-input').addEventListener('change',e=>setEndpoint('end',e.target.value.trim()));
 $('mode').addEventListener('change',e=>{state.mode=e.target.value;save();invalidate();});
 $('preset').addEventListener('change',e=>preset(e.target.value));
 $('optimize').addEventListener('click',()=>calculate(false));$('estimate').addEventListener('click',()=>calculate(true));
 $('reset').addEventListener('click',()=>{
  if(!confirm('Reset only the CURRENT project? Other seasons and years will be preserved.'))return;
  const p=currentProject();state={...seedState(),displays:p.holiday==='Halloween'&&p.year===2026?cloneSeed():[],selected:p.holiday==='Halloween'&&p.year===2026?seedSelections():new Set(),preset:p.holiday==='Halloween'&&p.year===2026?'top10':'custom',start:state.start,end:state.end};
  syncControls();save();invalidate();renderStops();status('Current project reset. Other projects are safe.');
 });
 $('project-picker').addEventListener('change',e=>changeProject(e.target.value));
 $('project-new').addEventListener('click',()=>openProjectEditor(false));
 $('project-duplicate').addEventListener('click',()=>openProjectEditor(true));
 $('project-delete').addEventListener('click',deleteProject);
 $('project-create-form').addEventListener('submit',createNewProject);
 $('project-cancel').addEventListener('click',()=>$('project-editor').classList.add('hidden'));
 $('projects-export').addEventListener('click',backupProjects);
 $('projects-import').addEventListener('change',restoreProjects);
 $('add-toggle').addEventListener('click',()=>$('add-form').classList.toggle('hidden'));
 $('add-form').addEventListener('submit',addStop);
 $('all-btn').addEventListener('click',()=>{state.selected=new Set(state.displays.map(d=>d.id));state.preset='all';$('preset').value='all';save();invalidate();renderStops();});
 $('clear-btn').addEventListener('click',()=>{state.selected=new Set();state.preset='custom';$('preset').value='custom';save();invalidate();renderStops();});
 $('export-json').addEventListener('click',exportStops);
 $('bulk-toggle').addEventListener('click',()=>{$('bulk-panel').classList.toggle('hidden');});
 $('import-preview').addEventListener('click',()=>{showImportPreview();});
 $('website-load').addEventListener('click',loadWebsite);
 $('website-open').addEventListener('click',()=>{try{const u=new URL($('website-url').value);if(u.protocol==='https:')window.open(u.href,'_blank','noopener,noreferrer');}catch{status('Enter a valid website URL.','error')}});
 renderDirectories();
 $('import-file').addEventListener('change',loadImportFile);
 $('bulk-text').addEventListener('input',()=>{sourceRecords=null;delete $('bulk-text').dataset.filename;$('import-confirm').disabled=true;});
 $('import-city').addEventListener('input',()=>{$('import-confirm').disabled=true;});
 $('import-mode').addEventListener('change',showImportPreview);
 $('import-confirm').addEventListener('click',commitImport);
 $('import-cancel').addEventListener('click',closeImport);
 $('fit').addEventListener('click',fitMap);
 renderStops();initMap();
 if('serviceWorker' in navigator && location.protocol==='https:')navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(console.warn);
}
wire();
