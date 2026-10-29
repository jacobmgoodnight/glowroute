import {SEED_DISPLAYS,DEFAULT_START,DEFAULT_END} from './data.js';
import {optimize,routeCost,splitLegs,googleDirections,appleDirections} from './optimizer.mjs';
import {parseImportedStops,canonicalAddress,importReview,importedDisplay} from './importer.mjs';
import {PROJECT_STORE,makeProject,cloneProject,revivePortfolio,snapshotState,uniqueProjectName,validatePortfolio,presetSelection} from './projects.mjs';
import {DIRECTORIES,findCatalog,htmlToText} from './catalogs.mjs';
import {validateDirectory,compareCatalogToProject,applyCatalogToProject,makeSubmissionUrl,catalogFits,directorySeason,directoryMatches} from './directory.mjs';
import {subsetMatrix,selectWithinBudget,roadOverlap,makeSharePayload,encodeShare,decodeShare,routeCandidates} from './tour.mjs';
import {validCoordinates,coordinateInput,locationPath,fetchJson,validateRoadMatrix,createRoutingClient} from './routing.mjs';
import {initPanelResize} from './layout.mjs';
import {informationLines,viewingMinutes,safeSourceUrl,sourceReferences} from './display-info.mjs';
import {discover,discoveryEntries,suggestCandidates,located} from './discovery.mjs';
import {validateCandidates,sourceFreshness} from './candidates.mjs';
import {renderSchedule} from './planner-ui.mjs';
import {parseSourcePaste,sourceKind,EXPLORER_SNAPSHOT_URL} from './source-paste.mjs';

const $=id=>document.getElementById(id);
const defaultTop5=['ouija','lady','mcblackton','studio','circus'];
const STORE='glowroute:v1';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const createId=()=>`own-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const cloneSeed=()=>SEED_DISPLAYS.map(d=>({...d,lat:null,lon:null,geoSource:null,approved:false}));
const seedSelections=()=>new Set(SEED_DISPLAYS.filter(d=>d.featured).map(d=>d.id));
const seedState=()=>({displays:cloneSeed(),selected:seedSelections(),start:DEFAULT_START,end:DEFAULT_END,mode:'duration',preset:'top10',budgetEnabled:false,budgetMinutes:90,viewMinutes:4,endpoints:{},cache:{}});
let legacy=null,rawPortfolio=null,storageReadError=false;
try{rawPortfolio=JSON.parse(localStorage.getItem(PROJECT_STORE)||'null');if(rawPortfolio)validatePortfolio(rawPortfolio);}catch(e){rawPortfolio=null;storageReadError=true;console.warn('Could not read saved drives',e)}
try{legacy=JSON.parse(localStorage.getItem(STORE)||'null');}catch(e){console.warn('Could not read legacy drive',e)}
let portfolio=revivePortfolio(rawPortfolio,legacy,seedState());
let activeProjectId=portfolio.activeId;
let state=stateFromProject(portfolio.projects.find(p=>p.id===activeProjectId));
function stateFromProject(p){const saved=p?.state||seedState();return {...seedState(),...saved,selected:new Set(Array.isArray(saved.selected)?saved.selected:[]),displays:saved.displays.map(d=>({...d})),endpoints:{...(saved.endpoints||{})},cache:{...(saved.cache||{})}};}
function currentProject(){return portfolio.projects.find(p=>p.id===activeProjectId)}
function save(){
 const project=currentProject();if(!project)return;
 project.state=snapshotState(state);project.updatedAt=new Date().toISOString();
 portfolio.activeId=activeProjectId;
 if(storageReadError){$('storage-status').textContent='Saved data could not be read. It has not been overwritten. Export this session and preserve the original browser data before restoring a valid backup.';return false;}
 try{localStorage.setItem(PROJECT_STORE,JSON.stringify(portfolio));$('storage-status').textContent='';return true;}catch(error){console.warn('Storage unavailable; export a backup',error);$('storage-status').textContent='Changes are only in memory: browser storage is unavailable or full. Back up all years before closing this tab.';return false;}
}
let directoryData=null,directorySelection=new Set(),directoryPreview=[],directoryBusy=false,directoryPreviewProjectId=null;
let discoveryCenter=null,discoveryMapMode=false,discoveryRequest=null,discoveryRevision=0,discoverySnapshot=[],suggestion=null,discoveryLayer=null,explorerRequest=null;
let map,markerLayer,routeLayer,currentRoute=null,lastMatrix=null,currentPoints=null,lastGeoStatus=0,pinTarget=null,pinLatLon=null,busy=false;
let driveActive=false,driveAnchor=null,driveFinish=null,driveRemainingIds=[],sharedIncoming=null;
let driveTotal=0,driveAnchorId=null;
let operation=null,drawRevision=0,gpsStart=null,temporaryFinish=null;
let controlsProjectId=null;
const routing=createRoutingClient();
function cancelOperation(){operation?.abort();operation=null;drawRevision++;busy=false;$('optimize').disabled=false;}
function beginOperation(){cancelOperation();operation=new AbortController();busy=true;$('optimize').disabled=true;updateDrivePanel();return operation;}
function finishOperation(token){if(operation===token){busy=false;operation=null;$('optimize').disabled=false;updateDrivePanel();}}

function status(message,tone='') {const el=$('status');el.textContent=message;el.className='status '+tone;}
function mapLabel(message){$('map-label').textContent=message;}
function getSelected(){return state.displays.filter(x=>state.selected.has(x.id));}
function showResults(visible){$('results').classList.toggle('hidden',!visible)}
function invalidate(){cancelOperation();driveActive=false;driveRemainingIds=[];driveAnchor=null;driveFinish=null;document.body.classList.remove('driving');currentRoute=null;lastMatrix=null;currentPoints=null;updateDrivePanel();routeLayer?.clearLayers();showResults(false);$('estimate').classList.add('hidden');updatePins();}

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
    const fail=()=>{clearTimeout(timer);script.remove();reject(new Error('CDN blocked, timed out or unavailable'));};
    const timer=setTimeout(fail,8000);
    script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=fail;
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
 markerLayer=L.layerGroup().addTo(map);routeLayer=L.layerGroup().addTo(map);discoveryLayer=L.layerGroup().addTo(map);
 map.on('click',event=>{
   if(discoveryMapMode){discoveryMapMode=false;$('discovery-map').textContent='Choose on map';setDiscoveryCenter({lat:event.latlng.lat,lon:event.latlng.lng},'Chosen map location');return;}
   if(pinTarget===null)return;
   pinLatLon={lat:event.latlng.lat,lon:event.latlng.lng};
   L.circleMarker(event.latlng,{radius:9,color:'#fff',weight:2,fillColor:'#f59e0b',fillOpacity:1}).addTo(markerLayer);
   $('pin-info').textContent=`Pin selected: ${pinLatLon.lat.toFixed(6)}, ${pinLatLon.lon.toFixed(6)}`;
 });
 updatePins();
 if(currentRoute){await drawRoute();}
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
 if(!state.displays.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent='Your drive is ready for displays. Add a stop with a full city/state address, paste a list, or browse the directory.';container.append(empty);}
 for(const item of state.displays){
   const active=state.selected.has(item.id),row=document.createElement('div');row.className='stop'+(active?' selected':'');
   const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=active;checkbox.setAttribute('aria-label',`Include ${item.name}`);
   checkbox.addEventListener('change',()=>{if(checkbox.checked)state.selected.add(item.id);else state.selected.delete(item.id);state.preset='custom';$('preset').value='custom';save();invalidate();renderStops();});
   const info=document.createElement('div');info.className='stop-content';
   const title=document.createElement('p');title.className='stop-title';title.textContent=item.name;
   const address=document.createElement('p');address.className='stop-address';address.textContent=item.address;
   info.append(title,address);
   if(item.ambiguous){const warning=document.createElement('span');warning.className='stop-tag warn';warning.textContent='Multiple address matches — check pin';info.append(warning);}
   if(item.skipped){const skipped=document.createElement('span');skipped.className='stop-tag warn';skipped.textContent='Skipped on last drive';info.append(skipped)}
   if(item.visited){const visit=document.createElement('span');visit.className='stop-tag ready';visit.textContent='✓ Visited';info.append(visit)}
   if(item.visitNotes){const note=document.createElement('p');note.className='stop-address';note.textContent=`Note: ${item.visitNotes}`;info.append(note)}
   if(item.sourceUrl){const source=document.createElement('a');source.href=/^https:\/\//i.test(item.sourceUrl)?item.sourceUrl:'#';source.target='_blank';source.rel='noopener noreferrer';source.className='stop-source';source.textContent=`↗ ${item.sourceName||'Source'}${item.sourceYear?' · '+item.sourceYear:''}`;info.append(source)}
   const side=document.createElement('div');side.className='stop-menu';
   if(item.featured){const tag=document.createElement('span');tag.className='stop-tag highlight';tag.textContent='★';tag.title='Editorial highlight';side.append(tag)}
   if(Number.isFinite(item.lat)&&Number.isFinite(item.lon)){
     const tag=document.createElement('span');tag.className='stop-tag '+(item.approved?'ready':'warn');tag.textContent=item.approved?'✓':'≈';tag.title=item.approved?'Confirmed map pin':'Automatic pin: verify accuracy';side.append(tag);
   }
   const preferences=document.createElement('div');preferences.className='stop-preferences';
   const favorite=document.createElement('button');favorite.type='button';favorite.textContent=item.favorite?'♥ Saved':'♡ Favorite';favorite.title='Favorite this display';favorite.setAttribute('aria-pressed',String(!!item.favorite));
   favorite.addEventListener('click',()=>{item.favorite=!item.favorite;save();renderStops();});preferences.append(favorite);
   const must=document.createElement('button');must.type='button';must.textContent=item.mustSee?'★ Must see':'☆ Must see';must.title='Always include in a time-budget route';must.setAttribute('aria-pressed',String(!!item.mustSee));
   must.addEventListener('click',()=>{item.mustSee=!item.mustSee;if(item.mustSee){state.selected.add(item.id);state.preset='custom';$('preset').value='custom';}save();invalidate();renderStops();});preferences.append(must);
   const rating=document.createElement('select');rating.className='rating-select';rating.setAttribute('aria-label',`Your rating for ${item.name}`);rating.title='Your own display rating';
   for(let n=1;n<=5;n++){const option=new Option(`${n} / 5`,String(n));rating.append(option)}rating.value=String(Number(item.rating)>=1&&Number(item.rating)<=5?item.rating:3);
   rating.addEventListener('change',()=>{item.rating=Number(rating.value);save();});preferences.append(rating);
   info.append(preferences);
   const visited=document.createElement('button');visited.textContent=item.visited?'Unvisit':'Visited';visited.title='Mark this house visited on this drive';visited.addEventListener('click',()=>{item.visited=!item.visited;item.visitedAt=item.visited?new Date().toISOString():null;save();renderStops();});side.append(visited);
   const notes=document.createElement('button');notes.textContent='Notes';notes.title='Add or edit private driving notes';notes.addEventListener('click',()=>{const answer=prompt(`Private notes for ${item.name} (saved only on this device):`,item.visitNotes||'');if(answer===null)return;item.visitNotes=answer.trim().slice(0,500);save();renderStops();});side.append(notes);
   const pin=document.createElement('button');pin.textContent='Pin';pin.title='Place or correct this stop on the map';pin.addEventListener('click',()=>beginPin(item.id));side.append(pin);
   if(item.needsSeasonCheck){const verify=document.createElement('button');verify.className='verify-season';verify.title='Mark this display verified for this season';verify.textContent='Verify ✓';verify.addEventListener('click',()=>{if(!confirm(`Have you checked that “${item.name}” is operating for ${currentProject().holiday} ${currentProject().year}?`))return;item.needsSeasonCheck=false;item.seasonCheckedYear=currentProject().year;item.lastConfirmed=new Date().toISOString().slice(0,10);save();renderStops();if(currentRoute)renderRouteSummary();status('Season marked verified for this project.','good');});side.append(verify)}
   const remove=document.createElement('button');remove.textContent='×';remove.title='Remove this stop from this project';remove.setAttribute('aria-label',`Remove ${item.name}`);remove.addEventListener('click',()=>removeStop(item.id));side.append(remove);
   const actions=document.createElement('details');actions.className='stop-actions';const summary=document.createElement('summary');summary.textContent='Details & notes';actions.append(summary,side);
   const durationLabel=document.createElement('label');durationLabel.className='field';durationLabel.textContent='Viewing minutes (blank uses source/default)';
   const duration=document.createElement('input');duration.type='number';duration.min='0';duration.max='180';duration.step='1';duration.value=item.viewingOverride??'';duration.placeholder=String(viewingMinutes({...item,viewingOverride:undefined},state.viewMinutes??4));duration.setAttribute('aria-label',`Viewing minutes for ${item.name}`);
   duration.addEventListener('change',()=>{const n=Number(duration.value);if(duration.value!==''&&(!Number.isFinite(n)||n<0||n>180)){duration.setCustomValidity('Enter 0–180 minutes, or leave blank.');duration.reportValidity();return;}duration.setCustomValidity('');if(duration.value==='')delete item.viewingOverride;else item.viewingOverride=n;save();updateViewingEstimates();status('Viewing time saved; schedule updated. Optimize again to reconsider the budgeted stop selection.');});durationLabel.append(duration);actions.append(durationLabel);
   const publicNotes=[item.catalogDescription,item.catalogOperatingDates&&`Source dates: ${item.catalogOperatingDates}`,item.catalogHours&&`Source hours: ${item.catalogHours}`,item.catalogNotes,item.catalogReviewedAt&&`Source reviewed ${item.catalogReviewedAt}; this is not operating confirmation.`].filter(Boolean);
   if(publicNotes.length){const details=document.createElement('p');details.className='hint public-details';details.textContent=publicNotes.join(' · ');actions.append(details);}
   for(const text of informationLines(item)){const p=document.createElement('p');p.className='hint';p.textContent=text;actions.append(p);}
   for(const ref of sourceReferences(item.sources)){const a=document.createElement('a');a.href=ref.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=`${ref.name} ↗`;actions.append(a);}
   row.append(checkbox,info,actions);container.append(row);
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
 discoveryMapMode=false;discoveryRevision++;discoveryRequest?.abort();$('discovery-map').textContent='Choose on map';
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
   item.lat=pinLatLon.lat;item.lon=pinLatLon.lon;item.approved=true;item.geoSource='manual';item.locationPrecision='street';item.ambiguous=false;
   delete state.cache[item.address.toLowerCase()];save();endPin();invalidate();renderStops();status(`${item.name} location saved on this device.`,'good');
 });
 const cancel=document.createElement('button');cancel.className='secondary';cancel.textContent='Cancel';cancel.addEventListener('click',endPin);
 toolbar.append(ok,cancel);document.body.append(toolbar);
 if(validCoordinates(item))map.flyTo([item.lat,item.lon],17);else if(validCoordinates(state.endpoints.start))map.flyTo([state.endpoints.start.lat,state.endpoints.start.lon],13);
}
function endPin(){pinTarget=null;pinLatLon=null;$('pin-toolbar')?.remove();updatePins();}

async function lookupNominatim(address,signal){
 const params=new URLSearchParams({q:address,format:'jsonv2',limit:'2',addressdetails:'1'});
 const results=await fetchJson(`https://nominatim.openstreetmap.org/search?${params}`,{signal});
 if(!results.length)throw Error(`Address not found: ${address}`);
 const p=results[0];return {lat:Number(p.lat),lon:Number(p.lon),source:'OpenStreetMap',display:p.display_name,ambiguous:results.length>1};
}
let censusCounter=0;
async function lookupCensus(address,signal){
 // Census does not allow cross-origin fetch. Its officially documented JSONP option works from static GitHub Pages.
 // Coordinates are often street-interpolated and must be treated as approximate.
 const callback=`__glowCensus_${Date.now()}_${++censusCounter}`;
 const params=new URLSearchParams({address,benchmark:'Public_AR_Current',format:'jsonp',callback});
 const result=await new Promise((resolve,reject)=>{
   const script=document.createElement('script');let settled=false;
   const cleanup=()=>{clearTimeout(timer);script.remove();delete window[callback];signal?.removeEventListener('abort',cancel);};
   const finish=(error,data)=>{if(settled)return;settled=true;cleanup();if(error)reject(error);else resolve(data);};
   const timer=setTimeout(()=>finish(new Error('Census timed out')),4500);
   const cancel=()=>finish(signal.reason);signal?.addEventListener('abort',cancel,{once:true});
   if(signal?.aborted){cancel();return;}
   window[callback]=data=>finish(null,data);
   script.onerror=()=>finish(new Error('Census unavailable'));
   script.src=`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params}`;
   document.head.appendChild(script);
 });
 const hit=result?.result?.addressMatches?.[0];
 if(!hit?.coordinates)throw Error('No Census match');
 return {lat:Number(hit.coordinates.y),lon:Number(hit.coordinates.x),source:'Census (approximate)',display:hit.matchedAddress};
}
async function geocode(address,house=false,signal,persist=true){
 signal?.throwIfAborted();
 const coordinates=coordinateInput(address);if(coordinates)return coordinates;
 const key=address.trim().toLowerCase();if(validCoordinates(state.cache[key]))return state.cache[key];
 let result=null;
 // Use Census first for street addresses; landmarks and town centers prefer Nominatim.
 if(house && /\d/.test(address)){
   try{result=await lookupCensus(address,signal)}catch(e){signal?.throwIfAborted();console.info('Census location unavailable',e.message)}
 }
 if(!result){
   const since=Date.now()-lastGeoStatus;if(since<1150)await delay(1150-since);
   signal?.throwIfAborted();lastGeoStatus=Date.now();result=await lookupNominatim(address,signal);
 }
 signal?.throwIfAborted();if(!validCoordinates(result))throw Error(`Invalid coordinates for ${address}`);
 if(persist){state.cache[key]=result;save();}return result;
}
async function resolvePoints(selected,signal){
 const total=selected.length+2;let done=0;
 const endpoints=[];
 for(const key of ['start','end']){
   signal?.throwIfAborted();
   if(key==='start'&&gpsStart){endpoints.push(gpsStart);done++;continue;}
   if(key==='end'&&temporaryFinish){endpoints.push(temporaryFinish);done++;continue;}
   const address=state[key].trim();
   if(!address)throw Error(`Enter a ${key} address.`);
   if(state.endpoints[key]?.address!==address){
     status(`Finding ${key} location (${++done}/${total})…`,'working');
     const point=await geocode(address,false,signal);signal?.throwIfAborted();
     state.endpoints[key]={...point,address};save();
   } else done++;
   endpoints.push(state.endpoints[key]);
 }
 for(const item of selected){
   signal?.throwIfAborted();
   if(item.locationPrecision==='city')throw Error(`${item.name} has only a city-level location. Confirm a public street address and pin before routing.`);
   if(!validCoordinates(item)){
     status(`Finding ${item.name} (${++done}/${total})…`,'working');
     const p=await geocode(item.address,true,signal);signal?.throwIfAborted();
     item.lat=p.lat;item.lon=p.lon;item.geoSource=p.source;item.ambiguous=!!p.ambiguous;item.approved=false;save();
   }else done++;
 }
 updatePins();renderStops();
 const points=[{name:'Start',address:state.start,...endpoints[0]},...selected,{name:'Finish',address:state.end,...endpoints[1]}];
 if(!points.every(validCoordinates))throw Error('One or more pins have invalid coordinates. Verify addresses or reposition a pin.');
 if(points.some(p=>p.ambiguous))status('Some addresses have multiple matches. Check the mapped locations and use full city/state addresses or adjust their pins.','error');
 return points;
}
async function roadMatrix(points,signal){
 const url=`https://router.project-osrm.org/table/v1/driving/${locationPath(points)}?annotations=duration,distance`;
 return validateRoadMatrix(await routing.request(url,{signal}),points.length);
}
function haversine(a,b){const R=6371000;const rad=x=>x*Math.PI/180;const dlat=rad(b.lat-a.lat),dlon=rad(b.lon-a.lon);const q=Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlon/2)**2;return 2*R*Math.asin(Math.sqrt(q));}
function straightMatrix(points){return points.map(a=>points.map(b=>haversine(a,b)));}

const miles=meters=>`${(meters/1609.344).toFixed(1)} mi`;
const minutes=seconds=>`${Math.round(seconds/60)} min`;
function sumMetric(matrix,order){return routeCost(order,matrix)}
function routeEstimates(){
 if(!currentRoute||!lastMatrix)return null;
 const geometry=currentRoute.geometry;
 const mapped=geometry?.order.join(',')===currentRoute.order.join(',');
 return {duration:mapped?geometry.duration:lastMatrix.durations?sumMetric(lastMatrix.durations,currentRoute.order):null,distance:mapped?geometry.distance:sumMetric(lastMatrix.distances,currentRoute.order),mapped};
}
function renderMetrics(){
 if(!currentRoute||!lastMatrix){$('metrics').replaceChildren();$('route-detail').textContent='Travel estimates unavailable. Retry rerouting before relying on the remaining itinerary.';return;}
 const {order,approx}=currentRoute;
 const estimates=routeEstimates(),travelDist=estimates.distance,travelTime=estimates.duration;
 const originalMetric=approx?sumMetric(lastMatrix.distances,Array.from({length:order.length},(_,i)=>i+1)):sumMetric(lastMatrix[state.mode==='distance'?'distances':'durations'],Array.from({length:order.length},(_,i)=>i+1));
 const selectedMetric=approx?travelDist:sumMetric(lastMatrix[state.mode==='distance'?'distances':'durations'],order);
 const saved=Math.max(0,originalMetric-selectedMetric);
 const cells=[
  {number:String(order.length),label:'Stops'},
  {number:approx?'—':minutes(travelTime),label:approx?'Road time unavailable':'Est. driving time'},
  {number:approx?miles(travelDist):miles(travelDist),label:approx?'Straight-line total':'Driving distance'}
 ];
 $('metrics').replaceChildren();for(const c of cells){const el=document.createElement('div');el.className='metric';const strong=document.createElement('strong');strong.textContent=c.number;const small=document.createElement('span');small.textContent=c.label;el.append(strong,small);$('metrics').append(el)}
 const method=approx?'Straight-line fallback — NOT road-optimized':currentRoute.method==='manual'?'Manually arranged stop order':currentRoute.method==='exact'?'Exact best stop order for the chosen road matrix objective':'Road-aware heuristic for larger routes';
 const budget=currentRoute.budgetPlan;
 const budgetTotal=budget?travelTime+budget.viewingSeconds:0;
 $('route-detail').textContent=`${method}. ${saved>0.01?'Matrix improvement over list order: '+(approx?miles(saved):state.mode==='distance'?miles(saved):minutes(saved))+'. ':''} ${budget?`Time-budget selection: ${budget.excluded} optional house(s) left out; ${minutes(budget.viewingSeconds)} viewing + ${minutes(travelTime)} driving, ${minutes(budgetTotal)} total. ${budgetTotal>budget.limitSeconds?'This order exceeds your budget; reduce stops or viewing time. ':''}`:''}${!approx?(estimates.mapped?'Totals use the mapped itinerary.':'Totals use modeled road-matrix legs; mapped itinerary totals may differ.')+' ':''}Road estimates exclude live traffic. ${currentPoints.some(p=>p.ambiguous)?'Multiple address matches: verify pins and city/state before navigating.':''}`;
}
function waypointValue(item){
 if(item.geoSource==='manual')return `${item.lat.toFixed(6)},${item.lon.toFixed(6)}`;
 return item.address;
}
function renderRouteChoices(){
 const el=$('route-choices');if(!el)return;el.replaceChildren();if(!currentRoute||currentRoute.approx){el.textContent='Road comparisons require a road-based route.';return;}
 const variants=currentRoute.variants||[];if(!variants.length){el.textContent=currentRoute.comparisonMessage||'Comparing mapped road alternatives…';return;}
 for(const [i,v] of variants.entries()){
   const row=document.createElement('div');row.className='route-choice';
   const info=document.createElement('div');const title=document.createElement('strong');title.textContent=v.label;
   const detail=document.createElement('small');detail.textContent=`${v.order.length} stops · ${minutes(v.duration)} driving · ${miles(v.distance)} · ${currentRoute.budgetPlan?minutes(currentRoute.budgetPlan.viewingSeconds)+' viewing · ':''}${v.overlap?miles(v.overlap.repeatedMeters)+' repeated road (estimate)':'overlap unavailable'}${v.lessRepeated?' · Less repeated roadway than the fastest candidate':''}`;
   info.append(title,detail);const button=document.createElement('button');button.type='button';button.className=i===currentRoute.variantIndex?'primary':'secondary';button.textContent=i===currentRoute.variantIndex?'Selected':'Choose';
   const overBudget=currentRoute.budgetPlan&&v.duration+currentRoute.budgetPlan.viewingSeconds>currentRoute.budgetPlan.limitSeconds;
   if(overBudget)detail.textContent+=' · Exceeds budget on mapped itinerary';
   button.disabled=i===currentRoute.variantIndex||driveActive||overBudget;button.addEventListener('click',async()=>{if(busy||driveActive)return;currentRoute.variantIndex=i;currentRoute.order=v.order.slice();currentRoute.method=v.method;currentRoute.geometry=v;renderRouteSummary();await drawRoute();});row.append(info,button);el.append(row);
 }
}
async function fetchRouteGeometry(order,points=currentPoints,signal){
 const arr=[points[0],...order.map(i=>points[i]),points.at(-1)];
 const json=await routing.request(`https://router.project-osrm.org/route/v1/driving/${locationPath(arr)}?overview=full&geometries=geojson&steps=false`,{signal});const found=json.routes?.[0];
 if(!found?.geometry?.coordinates?.length||!Number.isFinite(found.duration)||!Number.isFinite(found.distance)||!found.geometry.coordinates.every(p=>Array.isArray(p)&&validCoordinates({lon:p[0],lat:p[1]})))throw Error('Route drawing geometry is unavailable');
 return {order:order.slice(),duration:found.duration,distance:found.distance,legDurations:found.legs?.map(leg=>leg.duration),coords:found.geometry.coordinates,overlap:roadOverlap(found.geometry.coordinates)};
}
async function loadRouteAlternatives(signal){
 if(!currentRoute||currentRoute.approx)return;
 const token=currentRoute,points=currentPoints;
 const candidates=routeCandidates(lastMatrix,state.mode,currentRoute.budgetPlan);
 token.geometryFailures=new Set();
 const variants=[];
 for(const c of candidates){
  try{const route=await fetchRouteGeometry(c.order,points,signal);variants.push({...c,...route});}
  catch(error){signal?.throwIfAborted();token.geometryFailures.add(c.order.join(','));console.warn('Route comparison unavailable:',error)}
  if(currentRoute!==token)return;
 }
 if(!variants.length){currentRoute.comparisonMessage='Mapped comparison unavailable. Your selected matrix-based order is retained; retry optimization later.';renderRouteChoices();return;}
 const fastest=variants.reduce((a,b)=>a.duration<=b.duration?a:b);
 // A lower-backtracking candidate is labeled as such only if it is close to fastest in road time.
 const less=variants.filter(v=>v.duration<=fastest.duration*1.15).sort((a,b)=>a.overlap.repeatedMeters-b.overlap.repeatedMeters||a.duration-b.duration)[0];
 if(less&&less!==fastest&&less.overlap.repeatedMeters+20<fastest.overlap.repeatedMeters){less.lessRepeated=true;}
 // Geometry success (or failure) must never override the requested objective.
 currentRoute.variants=variants;currentRoute.variantIndex=variants.findIndex(v=>v.order.join(',')===currentRoute.order.join(','));currentRoute.geometry=variants[currentRoute.variantIndex]||null;renderRouteSummary();
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
 const heading=document.createElement('h3');heading.textContent='Your stop order';container.append(heading);
 currentRoute.order.forEach((index,pos)=>{
  const item=currentPoints[index],row=document.createElement('div');row.className='itinerary-row';
  const number=document.createElement('span');number.className='itinerary-index';number.textContent=pos+1;
  const label=document.createElement('div');label.className='itinerary-label';label.textContent=item.name;
  const small=document.createElement('small');small.textContent=item.address;label.append(small);
  const up=document.createElement('button');up.textContent='↑';up.title='Move earlier';up.setAttribute('aria-label',`Move ${item.name} earlier`);up.disabled=pos===0||driveActive;
  up.addEventListener('click',()=>swapStops(pos,pos-1));
  const down=document.createElement('button');down.textContent='↓';down.title='Move later';down.setAttribute('aria-label',`Move ${item.name} later`);down.disabled=pos===currentRoute.order.length-1||driveActive;
  down.addEventListener('click',()=>swapStops(pos,pos+1));
  row.append(number,label,up,down);container.append(row);
 });
 const last=document.createElement('p');last.className='planner-note';last.textContent='Start and finish stay fixed. Use arrows to manually adjust the visit order; links and map will update.';container.append(last);
}
async function swapStops(i,j){
 if(busy||!currentRoute||driveActive)return;
 [currentRoute.order[i],currentRoute.order[j]]=[currentRoute.order[j],currentRoute.order[i]];
 currentRoute.variants=[];currentRoute.variantIndex=-1;currentRoute.geometry=null;currentRoute.geometryFailures=new Set();currentRoute.method='manual';currentRoute.comparisonMessage='Manual order. Driving estimates and navigation links reflect your changes.';
 renderRouteSummary();
 await drawRoute();
}
function renderRouteSummary(){
 showResults(true);renderMetrics();renderRouteChoices();renderNavigation();renderItinerary();updateDrivePanel();updatePins();mapLabel(currentRoute.approx?'Approximate straight-line order only — NOT based on roads':'Ordered using mapped driving roads. Inspect pins before navigating.');
 renderSchedule(state,currentRoute,currentPoints,lastMatrix,currentProject());
}
function updateViewingEstimates(){
 if(!currentRoute)return;
 if(currentRoute.budgetPlan)currentRoute.budgetPlan.viewingSeconds=currentRoute.order.reduce((sum,i)=>sum+viewingMinutes(currentPoints[i],Number(state.viewMinutes??4))*60,0);
 renderRouteSummary();
}
async function drawRoute(signal){
 if(!routeLayer||!currentRoute)return;
 const revision=++drawRevision,token=currentRoute,points=currentPoints;
 routeLayer.clearLayers();
 const arranged=[currentPoints[0],...currentRoute.order.map(i=>currentPoints[i]),currentPoints.at(-1)];
 if(currentRoute.approx){
  L.polyline(arranged.map(x=>[x.lat,x.lon]),{color:'#f59e0b',weight:4,dashArray:'6 9',opacity:.7}).addTo(routeLayer);fitMap();return;
 }
 try{
   if(currentRoute.geometryFailures?.has(currentRoute.order.join(',')))throw Error('Route drawing was unavailable during comparison.');
   const chosen=currentRoute.variants?.[currentRoute.variantIndex];
   const existing=chosen||currentRoute.geometry;
   const geometry=existing?.order.join(',')===currentRoute.order.join(',')?existing:await fetchRouteGeometry(currentRoute.order,points,signal);
   if(currentRoute!==token||revision!==drawRevision)return;
   currentRoute.geometry=geometry;renderMetrics();updateDrivePanel();renderSchedule(state,currentRoute,currentPoints,lastMatrix,currentProject());
   const coords=geometry.coords;
   if(!coords?.length)throw Error('Route geometry missing');
   const latLngs=coords.map(([lon,lat])=>[lat,lon]);
   L.polyline(latLngs,{color:'#172136',weight:9,opacity:.85,lineJoin:'round'}).addTo(routeLayer);
   L.polyline(latLngs,{color:'#fbbf24',weight:5,opacity:.98,lineJoin:'round'}).addTo(routeLayer);
 } catch(error){
   if(signal?.aborted||currentRoute!==token||revision!==drawRevision)return;
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
 state.mode=$('mode').value;state.budgetEnabled=$('budget-enabled').checked;state.budgetMinutes=Number($('budget-minutes').value);state.viewMinutes=Number($('view-minutes').value);save();invalidate();
 const token=beginOperation();$('estimate').classList.add('hidden');
 try{
   const points=await resolvePoints(selected,token.signal);token.signal.throwIfAborted();currentPoints=points;
   let matrixResult;
   if(approx){const m=straightMatrix(points);matrixResult={distances:m,durations:null};}
   else {status('Measuring real driving roads between all stops…','working');matrixResult=await roadMatrix(points,token.signal);token.signal.throwIfAborted();}
   let budgetPlan=null;
   if(state.budgetEnabled){
     if(approx)throw Error('Time-budget planning needs real driving times; the rough fallback cannot estimate a trip budget.');
     budgetPlan=selectWithinBudget(matrixResult.durations,selected,Number(state.budgetMinutes),Number(state.viewMinutes));
     const indices=budgetPlan.indices;
     currentPoints=[points[0],...indices.map(i=>points[i]),points.at(-1)];
     matrixResult={durations:subsetMatrix(matrixResult.durations,indices),distances:subsetMatrix(matrixResult.distances,indices)};
   }
   lastMatrix=matrixResult;
   const values=approx?matrixResult.distances:state.budgetEnabled?matrixResult.durations:state.mode==='distance'?matrixResult.distances:matrixResult.durations;
   status(`Finding a better order for ${currentPoints.length-2} stops…`,'working');
   await delay(10);
   token.signal.throwIfAborted();
   const answer=optimize(values);
   currentRoute={...answer,approx,budgetPlan,variants:[],variantIndex:0};
   renderRouteSummary();
   status(approx?'Approximate geographic ordering generated. This is NOT a road-aware route.':'Road-optimized itinerary generated. Verify approximate pins before driving.','good');
   if(!approx){await loadRouteAlternatives(token.signal);}
   await drawRoute(token.signal);
 } catch(error){
   if(token.signal.aborted)return;
   console.error(error);
   status(`Cannot complete routing: ${error.message}. Check addresses, try later, or use rough ordering.`, 'error');
   if(currentPoints&&currentPoints.every(p=>Number.isFinite(p.lat)))$('estimate').classList.remove('hidden');
 } finally{finishOperation(token);}
}
function updateProjectSelect(){
 const picker=$('project-picker');picker.replaceChildren();
 const entries=[...portfolio.projects].sort((a,b)=>b.year-a.year||a.holiday.localeCompare(b.holiday));
 for(const project of entries){const option=new Option(`${project.holiday} ${project.year} · ${project.name}`,project.id);picker.append(option)}
 picker.value=activeProjectId;
 const p=currentProject();$('project-detail').textContent=`${p.holiday} ${p.year} · ${state.displays.length} saved displays · stored on this device`;
}
function syncControls(){
 if(controlsProjectId!==activeProjectId){closeImport();suggestion=null;temporaryFinish=null;discoveryRevision++;discoveryRequest?.abort();directoryPreview=[];directoryPreviewProjectId=null;$('directory-review').classList.add('hidden');controlsProjectId=activeProjectId;refreshDirectoryYears();if(directoryData)renderDirectoryList();}
 $('start-input').value=state.start;$('end-input').value=state.end;$('mode').value=state.mode;$('preset').value=state.preset;
 $('budget-enabled').checked=!!state.budgetEnabled;$('budget-minutes').value=state.budgetMinutes??90;$('view-minutes').value=state.viewMinutes??4;
 $('departure').value=state.departure||'';$('departure-zone').value=state.departureZone||Intl.DateTimeFormat().resolvedOptions().timeZone;$('departure-fold').value=state.departureFold||'earlier';
 updateProjectSelect();
 $('use-location').textContent=gpsStart?'Use entered address':'Use my location';
 if(!gpsStart)$('location-status').textContent='Optional starting point for this tab only. Location is requested when you press the button.';
}
function changeProject(id){
 if(id===activeProjectId)return;
 if(!portfolio.projects.some(p=>p.id===id))return;
 save();gpsStart=null;cancelOperation();$('directory-review').classList.add('hidden');directoryPreview=[];activeProjectId=id;state=stateFromProject(currentProject());syncControls();invalidate();renderStops();closeImport();status(`Opened “${currentProject().name}”.`,'good');save();
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
 else{p=makeProject({name,holiday,year,displays:[],selected:[],start:'',end:'',preset:'custom'});}
 gpsStart=null;cancelOperation();portfolio.projects.push(p);activeProjectId=p.id;state=stateFromProject(p);
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
  const revived=validatePortfolio(data,{backup:true});if(!confirm(`Restore ${revived.projects.length} saved projects? This replaces current projects on this device. Export a backup first if needed.`))return;
  // Persist before replacing the in-memory portfolio, so quota failures are atomic.
  localStorage.setItem(PROJECT_STORE,JSON.stringify(revived));storageReadError=false;gpsStart=null;cancelOperation();portfolio=revived;activeProjectId=portfolio.activeId;state=stateFromProject(currentProject());syncControls();invalidate();renderStops();save();status('Projects restored successfully.','good');
 }catch(error){status('Could not restore project backup: '+error.message,'error')}finally{event.target.value=''}
}
function preset(value){
 state.preset=value;
 if(value!=='custom')state.selected=presetSelection(state.displays,value,defaultTop5);
 save();invalidate();renderStops();
}
function addStop(event){
 event.preventDefault();const name=$('new-name').value.trim(),address=$('new-address').value.trim();
 if(!name||!address)return;
 if(state.displays.some(d=>canonicalAddress(d.address)===canonicalAddress(address))){status('That address is already in this drive. Select its existing display instead.','error');return;}
 if(state.displays.length>=70){status('Limit of 70 display addresses.','error');return;}
 const id=createId();state.displays.push({id,name,address,score:3,lat:null,lon:null,featured:0,approved:false});state.selected.add(id);
 state.preset='custom';$('preset').value='custom';save();invalidate();renderStops();$('add-form').reset();$('add-form').classList.add('hidden');
 status('Added your stop. It will be geocoded when you optimize.','good');
}
function exportStops(){
 const records=state.displays.map(d=>({...d}));
 const file=new Blob([JSON.stringify({version:1,project:{holiday:currentProject().holiday,year:currentProject().year},displays:records,selected:[...state.selected]},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download=`glowroute-${currentProject().holiday.toLowerCase()}-${currentProject().year}-stops.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
let pendingImport=[],importIssues=[],importOrigin=null,sourceRecords=null,importDiagnostics=[],importDuplicates=0,importPreviewReady=false,importRevision=0,importRequest=null;
function importSourceData(records,{name='Manual import',url='',year=null,season=null}={},render=true){
 importOrigin={name,url,year,season};
 $('bulk-text').dataset.sourceUrl=url;$('bulk-text').dataset.sourceName=name;
 const unique=new Set();let duplicates=0;
 pendingImport=[];
 for(const record of records){const key=canonicalAddress(record.address);if(!key||unique.has(key)){duplicates++;continue}unique.add(key);
   pendingImport.push({...record,name:String(record.name||record.address).slice(0,110),address:String(record.address||'').slice(0,220),lat:record.lat??null,lon:record.lon??null,include:true});
 }
 importIssues=[];importDiagnostics=[];importDuplicates=duplicates;importPreviewReady=true;
 if(pendingImport.length>500){pendingImport=pendingImport.slice(0,500);importIssues.push('Review up to 500 unique addresses at once. Split this list into smaller files.');}
 if(render)renderImportRows();
}
function renderImportRows(){
 const panel=$('bulk-preview');panel.replaceChildren();
 const heading=document.createElement('strong');heading.textContent=`${pendingImport.length} unique addresses recognized · ${importDuplicates} duplicates in source`;panel.append(heading);
 if(importOrigin){const meta=document.createElement('p');meta.className='hint';meta.textContent=`Source: ${importOrigin.name}${importOrigin.year?' · '+importOrigin.year:''}. ${importOrigin.year&&Number(importOrigin.year)!==currentProject().year?'Different season year — verify before visiting.':''} Listings are not proof a house is active this year.`;panel.append(meta)}
 for(const note of importIssues){const p=document.createElement('p');p.className='import-warning';p.textContent=note;panel.append(p)}
 if(importDiagnostics.length){const details=document.createElement('details');details.className='import-diagnostics';const summary=document.createElement('summary');summary.textContent=`${importDiagnostics.length} ignored record(s) — review why`;details.append(summary);for(const diagnostic of importDiagnostics.slice(0,50)){const p=document.createElement('p');p.className='hint';p.textContent=`Record ${diagnostic.row}: ${diagnostic.message}${diagnostic.preview?' '+diagnostic.preview:''}`;details.append(p);}if(importDiagnostics.length>50)details.append(document.createTextNode('Showing the first 50 ignored records.'));panel.append(details);}
 if(pendingImport.some(r=>r.metadata)){const privacy=document.createElement('p');privacy.className='hint';privacy.textContent='This file includes personal preferences or source details. Imported stops keep saved ratings, favorites, notes and route selection. Same-season verification is kept only when the export identifies the same holiday and year.';panel.append(privacy);}
 const known=new Set(state.displays.map(d=>canonicalAddress(d.address))),append=$('import-mode').value!=='replace';
 pendingImport.forEach((rec,i)=>{
  const matched=append&&known.has(canonicalAddress(rec.address));
  const line=document.createElement('div');line.className='import-review-row';
  const row=document.createElement('label');row.className='review-select';const cb=document.createElement('input');cb.type='checkbox';cb.checked=rec.include&&!matched;cb.disabled=matched;cb.setAttribute('aria-label',`Import ${rec.name}`);cb.addEventListener('change',()=>{rec.include=cb.checked;updateImportConfirm()});row.append(cb,document.createTextNode(` Stop ${i+1}${matched?' · Already listed; skipped when adding':''}`));
  const name=document.createElement('input');name.value=rec.name;name.maxLength=110;name.setAttribute('aria-label',`Display name ${i+1}`);name.addEventListener('input',()=>{rec.name=name.value;updateImportConfirm()});
  const addr=document.createElement('input');addr.value=rec.address;addr.maxLength=220;addr.setAttribute('aria-label',`Street address ${i+1}`);addr.addEventListener('input',()=>{rec.address=addr.value;rec.lat=null;rec.lon=null;if(rec.metadata){rec.metadata.needsSeasonCheck=true;rec.metadata.seasonCheckedYear=null;}const nowMatched=append&&known.has(canonicalAddress(rec.address));cb.disabled=nowMatched;cb.checked=rec.include&&!nowMatched;row.lastChild.textContent=` Stop ${i+1}${nowMatched?' · Already listed; skipped when adding':''}`;updateImportConfirm()});
  line.append(row,name,addr);panel.append(line);
 });
 updateImportConfirm();
}
function updateImportConfirm(){
 const {active,capacity:allowed,duplicate,invalid:bad,existingCount,excluded}=importReview(pendingImport,state.displays,$('import-mode').value);
 $('import-confirm').disabled=!importPreviewReady||active.length===0||active.length>allowed||duplicate||bad||importIssues.length>0;
 $('import-confirm').textContent=`${$('import-mode').value==='replace'?'Replace with':'Add'} ${active.length} selected displays`;
 let warning=$('review-message');if(!warning){warning=document.createElement('p');warning.id='review-message';warning.className='import-warning';$('bulk-preview').append(warning)}
 warning.textContent=active.length>allowed?`This project has room for only ${allowed} displays from this import. Deselect some rows or use a separate project.`:duplicate?'Selected addresses contain duplicates. Uncheck or edit them.':bad?'Some selected stops need a valid name and numbered street address.':'Addresses and display activity still require verification.';
 $('import-review-summary').textContent=`${active.length} selected · ${existingCount} already listed and skipped · ${excluded} unchecked · ${importDiagnostics.length} ignored records`;
 for(const id of ['import-select-all','import-select-none'])$(id).disabled=!importPreviewReady||pendingImport.length===0;
}
function showImportPreview(){
 if(sourceRecords){importSourceData(sourceRecords,importOrigin||{});return;}
 const parsed=parseSourcePaste($('bulk-text').value,{url:$('website-url').value.trim(),holiday:$('import-source-holiday').value,year:$('import-source-year').value?Number($('import-source-year').value):null,defaultCity:$('import-city').value,filename:$('bulk-text').dataset.filename||''});
 if(parsed.detected){if(!$('import-source-year').value)$('import-source-year').value=parsed.detected.year;if(!$('import-source-holiday').value)$('import-source-holiday').value=parsed.detected.holiday;}
 importSourceData(parsed.records,parsed.origin,false);
 $('paste-source-status').textContent=`${parsed.detected?`Copied heading: ${parsed.detected.holiday} ${parsed.detected.year}. `:''}${parsed.origin.year?`Original season: ${parsed.origin.season||'holiday unknown'} ${parsed.origin.year}. `:'Source year unknown. '}Repeat with Add new to skip duplicates; existing records are not silently updated or removed.`;
 importIssues=parsed.issues;importDiagnostics=parsed.diagnostics||[];importDuplicates=parsed.duplicates;
 renderImportRows();
}
function closeImport(){importRevision++;importRequest?.abort();$('website-load').disabled=false;$('bulk-panel').classList.add('hidden');pendingImport=[];importOrigin=null;sourceRecords=null;importPreviewReady=false;importDiagnostics=[];for(const key of ['sourceUrl','sourceName','filename'])delete $('bulk-text').dataset[key];$('import-review-summary').textContent='';$('import-confirm').disabled=true;$('website-url').value='';$('import-source-year').value='';$('import-source-holiday').value='';}
async function loadImportFile(event){
 const file=event.target.files?.[0];if(!file)return;
 const revision=++importRevision,projectId=activeProjectId;importRequest?.abort();$('website-load').disabled=false;
 try{if(file.size>400_000)throw Error('Maximum file size 400 KB.');const text=await file.text();if(revision!==importRevision||projectId!==activeProjectId)return;$('bulk-text').value=text;sourceRecords=null;$('bulk-text').dataset.filename=file.name;delete $('bulk-text').dataset.sourceUrl;delete $('bulk-text').dataset.sourceName;importOrigin=null;$('website-url').value='';$('import-source-year').value='';$('import-source-holiday').value='';
  $('bulk-panel').classList.remove('hidden');showImportPreview();status(`Reviewing ${file.name}.`,'good');
 }catch(error){status('Import error: '+error.message,'error')}event.target.value='';
}
async function loadWebsite(){
 const value=$('website-url').value.trim();if(!value){status('Enter a source website URL.','error');return;}
 let url;try{url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)throw Error('HTTPS URL required');if(/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname))throw Error('Public websites only')}catch(e){status('Use a public HTTPS listing URL.','error');return;}
 const revision=++importRevision,projectId=activeProjectId;importRequest?.abort();$('website-load').disabled=false;const controller=new AbortController();importRequest=controller;
 const current=()=>revision===importRevision&&projectId===activeProjectId;
 $('bulk-panel').classList.remove('hidden');
 // Clear any prior source preview before loading a different website.
 sourceRecords=null;pendingImport=[];importIssues=[];importPreviewReady=false;$('import-confirm').disabled=true;$('bulk-preview').textContent='Checking the selected source…';
 const catalog=findCatalog(url.href);
 if(catalog){
  sourceRecords=catalog.records.map(r=>({...r}));
  importSourceData(catalog.records,{name:catalog.name,url:catalog.url,year:catalog.year,season:catalog.season});
  $('website-note').textContent=`Loaded ${catalog.records.length} addresses from an attributed ${catalog.year} catalog snapshot (not a live page fetch). Review before importing.`;
  status(`Loaded reviewed source snapshot: ${catalog.name}.`,'good');return;
 }
 if(sourceKind(url.href)==='frightmaps'){openSourcePaste(DIRECTORIES.find(s=>s.id==='frightmaps'));$('website-note').textContent='Live FrightMaps fetching is inactive. Use its visible public/permitted street addresses or load the older Explorer discovery snapshot. City-only records cannot route.';return;}
 $('website-note').textContent='Trying direct browser access. Many directory websites block it for security.';
 $('website-load').disabled=true;
 const timer=setTimeout(()=>controller.abort(),9500);
 try{
  const response=await fetch(url.href,{mode:'cors',credentials:'omit',signal:controller.signal});
  if(!response.ok)throw Error(`Website returned ${response.status}`);
  const type=response.headers.get('content-type')||'';if(!/text\/html|text\/plain|text\/csv|application\/json/i.test(type))throw Error('This website does not provide a readable listing');
  const text=await response.text();if(text.length>400000)throw Error('Listing exceeds the 400 KB import limit');
  if(!current())return;
  sourceRecords=null;$('bulk-text').value=type.includes('html')?htmlToText(text):text;
  $('bulk-text').dataset.sourceUrl=url.href;$('bulk-text').dataset.sourceName=url.hostname;delete $('bulk-text').dataset.filename;
 importOrigin={name:url.hostname,url:url.href,year:null};
  showImportPreview();$('website-note').textContent='Direct page access succeeded. Inspect all addresses before adding.';status('Page retrieved. Check the import preview.','good');
 }catch(error){
  if(!current())return;
  $('website-note').textContent='Automatic access was blocked or unavailable (common with browser CORS). Open the source page, copy its visible listing, paste it below, and choose Preview addresses. The source URL will be retained.';
  $('bulk-text').dataset.sourceUrl=url.href;$('bulk-text').dataset.sourceName=url.hostname;
  importOrigin={name:url.hostname,url:url.href,year:null};
  status('Direct website import unavailable. Copy and paste its address list for review; no scraping workaround is used.','error');
 }finally{clearTimeout(timer);if(revision===importRevision)$('website-load').disabled=false;}
}
function commitImport(){
 updateImportConfirm();if($('import-confirm').disabled)return;const {active}=importReview(pendingImport,state.displays,$('import-mode').value);
 const mode=$('import-mode').value,oldCount=state.displays.length;
 const reviewed=active.map(r=>importedDisplay(r,{id:createId(),origin:importOrigin||{},projectYear:currentProject().year,projectHoliday:currentProject().holiday})),incoming=reviewed.map(r=>r.display),selected=reviewed.filter(r=>r.selected).map(r=>r.display.id);
 if(mode==='replace'){if(!confirm(`Replace all ${oldCount} stops in this project with ${incoming.length} reviewed stops? Other projects will be unaffected.`))return;state.displays=incoming;state.selected=new Set(selected);}
 else{state.displays.push(...incoming);state.selected=new Set([...state.selected,...selected]);}
 state.preset='custom';$('preset').value='custom';save();invalidate();renderStops();updateProjectSelect();closeImport();status(`Added ${incoming.length} reviewed displays to “${currentProject().name}”. Check their locations and current-year activity.`,'good');
}
function openSourcePaste(source=null){
 importRevision++;importRequest?.abort();sourceRecords=null;importPreviewReady=false;$('website-load').disabled=false;$('import-confirm').disabled=true;$('bulk-panel').classList.remove('hidden');
 if(source){$('website-url').value=source.url;$('import-source-holiday').value=source.season;$('import-source-year').value='';$('bulk-text').value='';delete $('bulk-text').dataset.filename;pendingImport=[];$('bulk-preview').textContent='Paste the visible listings, then Preview addresses.';}
 $('paste-source-status').textContent=source?.id==='frightmaps'?'FrightMaps often shows only a city. Copy an explicitly published/permitted street address from an individual listing; do not infer one from a display name.':`Open the source link above, copy its visible listings and dated heading, then paste below. ${source?.id==='indy-christmas'?'The inspected Christmas guide is labeled 2025; keep that year unless the page itself changes.':''}`;
 $('bulk-panel').scrollIntoView({block:'start',behavior:'smooth'});$('bulk-text').focus({preventScroll:true});
}
function renderDirectories(){const list=$('source-directories');list.replaceChildren();for(const source of DIRECTORIES){
 const row=document.createElement('div');row.className='source-directory';const link=document.createElement('a');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=source.name+' ↗';
 const button=document.createElement('button');button.type='button';button.className='mini-button';button.textContent='Paste listings';button.addEventListener('click',()=>openSourcePaste(source));
 row.append(link,button);list.append(row);
 }}

/* v1.3: public JSON directory, with preview and explicit approval for every change. */
function directoryStatus(message){$('directory-status').textContent=message;}
function allDiscoveryEntries(){return discoveryEntries([...(directoryData?.entries||[]),...discoverySnapshot],state.displays,currentProject());}
function discoveryFilters(){return {center:discoveryCenter,radius:Number($('discovery-radius').value),type:$('discovery-type').value,cost:$('discovery-cost').value,access:$('discovery-access').value,family:$('discovery-family').checked,music:$('discovery-music').checked,sort:$('directory-sort').value};}
function setDiscoveryCenter(point,label){
 discoveryRevision++;discoveryRequest?.abort();discoveryCenter=point;discoveryMapMode=false;$('discovery-map').textContent='Choose on map';
 $('discovery-location-status').textContent=point?`${label} · ${point.lat.toFixed(4)}, ${point.lon.toFixed(4)} · distances are approximate geographic miles, not road miles.`:'No search location. Enter an address, choose a map point, or request GPS.';
 renderDirectoryList();if(point&&map)map.flyTo([point.lat,point.lon],12);
}
async function locateDiscovery(gps=false){
 const revision=++discoveryRevision;discoveryRequest?.abort();const token=new AbortController();discoveryRequest=token;
 $('discovery-location-status').textContent=gps?'Requesting a one-time location…':'Finding your search location…';
 try{
  let point;
  if(gps){if(!navigator.geolocation)throw Error('Location unavailable');const p=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{timeout:9000,maximumAge:30000,enableHighAccuracy:false}));point={lat:p.coords.latitude,lon:p.coords.longitude};}
  else{const address=$('discovery-address').value.trim();if(!address)throw Error('Enter an address or coordinates');point=await geocode(address,false,token.signal,false);}
  token.signal.throwIfAborted();if(revision!==discoveryRevision)return;if(!validCoordinates(point))throw Error('Invalid search location');
  setDiscoveryCenter(point,gps?'Current location (this tab only)':point.ambiguous?'Approximate address match — check map':'Search location');
 }catch(e){if(revision===discoveryRevision&&!token.signal.aborted)$('discovery-location-status').textContent=gps?'Location unavailable or permission denied. Enter an address or choose a point on the map.':`Search location unavailable: ${e.message}. Try a complete address or coordinates.`;}
}
function renderDiscoveryPins(entries){
 if(!discoveryLayer)return;discoveryLayer.clearLayers();
 if($('directory-panel').classList.contains('hidden'))return;
 for(const e of entries.filter(located)){
  const text=document.createElement('div'),name=document.createElement('strong'),address=document.createElement('p'),button=document.createElement('button');name.textContent=e.name;address.textContent=e.address;button.type='button';button.textContent=directorySelection.has(e.id)?'Selected · show listing':'Show listing';button.addEventListener('click',()=>{const row=document.getElementById(`directory-select-${e.id}`);row?.scrollIntoView({block:'center',behavior:'smooth'});row?.focus();});text.append(name,address,button);
  L.marker([e.lat,e.lon],{icon:icon(null,'stop',!directorySelection.has(e.id))}).bindPopup(text).addTo(discoveryLayer);
 }
 if(discoveryCenter)L.circleMarker([discoveryCenter.lat,discoveryCenter.lon],{radius:8,color:'#60a5fa'}).addTo(discoveryLayer);
}
async function loadDiscoverySnapshot(event){
 const file=event.target.files?.[0];if(!file)return;
 try{if(file.size>2*1024*1024)throw Error('Maximum snapshot size is 2 MB');const data=validateCandidates(JSON.parse(await file.text()));
  discoverySnapshot=data.entries;directorySelection.clear();suggestion=null;directoryPreview=[];$('directory-review').classList.add('hidden');
  $('discovery-snapshot-status').textContent=`${data.entries.length} unreviewed discoveries · ${data.duplicates} exact-address matches grouped · ${sourceFreshness(data.fetchedAt)}. City-only locations cannot route. Existing personal records are unchanged.`;
  refreshDirectoryYears();renderDirectoryList();
 }catch(e){$('discovery-snapshot-status').textContent=`Snapshot not loaded: ${e.message}. Previous data retained.`;}finally{event.target.value='';}
}
async function loadExplorerSnapshot(){
 if(explorerRequest)return;const token=new AbortController();explorerRequest=token;$('explorer-load').disabled=true;
 $('explorer-status').textContent='Loading the older Explorer JSON from your GitHub repository… No live source pages are fetched.';
 const timer=setTimeout(()=>token.abort(),12000);
 try{
  const response=await fetch(EXPLORER_SNAPSHOT_URL,{credentials:'omit',redirect:'error',cache:'no-store',signal:token.signal});
  if(!response.ok||!response.body)throw Error('Snapshot unavailable');
  const reader=response.body.getReader(),decoder=new TextDecoder();let text='',bytes=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>2*1024*1024)throw Error('Snapshot exceeds 2 MB');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel();}
  const data=validateCandidates(JSON.parse(text));discoverySnapshot=data.entries;directorySelection.clear();suggestion=null;directoryPreview=[];$('directory-review').classList.add('hidden');
  refreshDirectoryYears();renderDirectoryList();
  const unlocated=data.entries.filter(e=>!e.address).length;
  $('explorer-status').textContent=`${data.entries.length} older discoveries loaded for local review; ${unlocated} lack a routable street address. Select the original holiday/year to browse. No records were added to a drive and no live pages were refreshed.`;
  $('discovery-snapshot-status').textContent='Loaded the older Explorer snapshot from GitHub. Per-listing dates below describe its original imports, not a fresh operating check.';
 }catch(e){$('explorer-status').textContent=`Could not load the older snapshot (${token.signal.aborted?'request timed out':e.message}). Existing data retained. Download source-candidates.json from the old repository and use Load review snapshot instead.`;}
 finally{clearTimeout(timer);explorerRequest=null;$('explorer-load').disabled=false;}
}
function refreshDirectoryYears(){
 const select=$('directory-year'),previous=select.value;select.replaceChildren(new Option('All','All'));
 for(const year of [...new Set(allDiscoveryEntries().map(e=>e.year))].sort((a,b)=>b-a))select.append(new Option(String(year),String(year)));
 if([...select.options].some(o=>o.value===previous))select.value=previous;
}
function suggestDiscoveryTour(){
 try{
  if(!discoveryCenter)throw Error('Set a search location first.');
  const project=currentProject(),all=allDiscoveryEntries(),mandatory=all.filter(e=>e.projectDisplayId&&state.selected.has(e.projectDisplayId)&&e.mustSee);
  const entries=suggestCandidates(visibleDirectoryEntries(),mandatory,{holiday:project.holiday,year:project.year});
  directorySelection=new Set(entries.map(e=>e.id));suggestion={projectId:activeProjectId,center:{...discoveryCenter},entries};
  prepareDirectoryReview('suggestion');renderDirectoryList();$('directory-review').scrollIntoView({block:'nearest'});
 }catch(e){directoryStatus(e.message);}
}
async function fetchDirectory(){
 if(directoryBusy)return;directoryBusy=true;$('directory-load').disabled=true;
 directoryStatus('Fetching the public directory…');
 try{
  const response=await fetch('./directory/catalog.json',{cache:'no-store'});
  if(!response.ok)throw Error(`Directory returned ${response.status}`);
  const raw=await response.json();directoryData=validateDirectory(raw);
  directorySelection.clear();directoryPreview=[];
  suggestion=null;refreshDirectoryYears();
  renderDirectoryList();
  directoryStatus(`${response.headers?.get('X-GlowRoute-Cached')?'Offline cached copy · ':''}${directoryData.entries.length} catalog entries loaded · last updated ${directoryData.updatedAt}. Public listings do not guarantee a display is operating.`);
 }catch(error){directoryStatus(`Directory unavailable: ${error.message}. Saved drives still work offline.`);console.warn(error)}
 finally{directoryBusy=false;$('directory-load').disabled=false;}
}
function renderDirectoryList(){
 const el=$('directory-list');el.replaceChildren();
 const matches=visibleDirectoryEntries();
 if(!matches.length){const empty=document.createElement('p');empty.className='hint';empty.textContent='No listings match these filters. Try another city, holiday or year. Your other selections are retained.';el.append(empty);}
 for(const entry of matches){
  const row=document.createElement('div');row.className='directory-row';
  const cb=document.createElement('input');cb.type='checkbox';cb.checked=directorySelection.has(entry.id);cb.setAttribute('aria-label',`Select ${entry.name}`);
  cb.disabled=!entry.address;cb.id=`directory-select-${entry.id}`;cb.addEventListener('change',()=>{if(cb.checked)directorySelection.add(entry.id);else directorySelection.delete(entry.id);updateDirectorySelection();renderDiscoveryPins(matches)});
  const info=document.createElement('div');info.className='directory-item';
  const title=document.createElement('label');title.htmlFor=cb.id;title.className='directory-title';title.textContent=entry.name;
  const sub=document.createElement('span');sub.textContent=entry.address||`${entry.locality} · City-level only — confirm location at source`;
  const season=directorySeason(entry.sourceYear?{...entry,year:entry.sourceYear,holiday:entry.sourceHoliday||entry.holiday}:entry),badge=document.createElement('span');badge.className=`directory-season ${season.kind}`;badge.textContent=season.label;
  const reviewed=document.createElement('span');reviewed.textContent=entry.reviewedAt?`Source reviewed ${entry.reviewedAt} · not an operating check`:'Source review date not supplied';
  const source=document.createElement(entry.sourceUrl?'a':'span');if(safeSourceUrl(entry.sourceUrl))source.href=safeSourceUrl(entry.sourceUrl);source.target='_blank';source.rel='noopener noreferrer';source.textContent=`Source: ${entry.sourceName}${entry.sourceUrl?' ↗':''}`;source.addEventListener('click',e=>e.stopPropagation());
  info.append(title,sub,badge,reviewed,source);
  const distance=document.createElement('span');distance.textContent=entry.distanceMiles!==null&&entry.distanceMiles!==undefined?`${entry.distanceMiles.toFixed(1)} mi · approximate geographic distance`:'Distance unavailable · reliable pin or search location needed';info.append(distance);
  if(entry.unreviewed){const warning=document.createElement('span');warning.textContent=`Unreviewed discovery · ${sourceFreshness(entry.lastImported)}`;info.append(warning);}
  if(located(entry)){const show=document.createElement('button');show.className='text-button';show.type='button';show.textContent='Show on map';show.addEventListener('click',()=>{map?.flyTo([entry.lat,entry.lon],16);$('map').scrollIntoView({block:'center',behavior:'smooth'});});info.append(show);}
  if(state.displays.some(d=>d.catalogId===entry.id||canonicalAddress(d.address)===canonicalAddress(entry.address))){const existing=document.createElement('span');existing.textContent='Already in this drive';existing.className='directory-existing';info.append(existing);}
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Source notes & details';details.append(summary);
  for(const text of [season.detail,entry.description,entry.operatingDates&&`Source dates: ${entry.operatingDates}`,entry.hours&&`Source hours: ${entry.hours}`,entry.notes,`Catalog ID: ${entry.id}`].filter(Boolean)){const p=document.createElement('p');p.textContent=text;details.append(p);}
  info.append(details);row.append(cb,info);el.append(row);
  for(const text of informationLines(entry)){const p=document.createElement('p');p.textContent=text;details.append(p);}
  for(const ref of sourceReferences(entry.sources)){const a=document.createElement('a');a.href=ref.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=`${ref.name} ↗`;details.append(a);}
 }
 updateDirectorySelection();renderDiscoveryPins(matches);
}
function visibleDirectoryEntries(){return discover(directoryMatches(allDiscoveryEntries(),{query:$('directory-search').value,holiday:$('directory-season').value,year:$('directory-year').value,sort:$('directory-sort').value}),discoveryFilters());}
function updateDirectorySelection(){
 const shown=visibleDirectoryEntries(),count=shown.filter(e=>directorySelection.has(e.id)).length;
 $('directory-summary').textContent=`Showing ${shown.length} of ${allDiscoveryEntries().length} listings · ${directorySelection.size} selected (${directorySelection.size-count} outside these filters). ${Number($('discovery-radius').value)&&!discoveryCenter?'Set a search location to use the radius. ':''}${Number($('discovery-radius').value)?'Unlocated listings are excluded from radius results. ':''}Past years are archives; current-year listings still need an operating check.`;
 $('directory-select-visible').disabled=!shown.length;$('directory-clear-selection').disabled=!directorySelection.size;
 $('directory-select-visible').textContent=shown.length&&count===shown.length?'Deselect shown':'Select shown';
 $('directory-review-selected').textContent=`Review ${directorySelection.size} selected listing${directorySelection.size===1?'':'s'}`;
}
function toggleDirectoryShown(){const shown=visibleDirectoryEntries().filter(e=>e.address),remove=shown.every(e=>directorySelection.has(e.id));for(const e of shown){if(remove)directorySelection.delete(e.id);else directorySelection.add(e.id);}renderDirectoryList();}
function prepareDirectoryReview(mode='selected'){
 if(!directoryData&&!state.displays.length&&!discoverySnapshot.length){directoryStatus('Load the directory or import a snapshot first.');return;}
 if(mode!=='suggestion')suggestion=null;
 const project=currentProject();let entries;
 if(mode==='suggestion')entries=suggestion.entries;
 else if(mode==='refresh')entries=[...(directoryData?.entries||[]),...discoverySnapshot].filter(r=>r.holiday===project.holiday&&r.year===project.year&&r.address&&r.locationPrecision!=='city');
 else entries=allDiscoveryEntries().filter(r=>directorySelection.has(r.id)&&r.address);
 if(!entries.length){directoryStatus(mode==='refresh'?`No catalog listings for ${project.holiday} ${project.year}; nothing to refresh.`:'Choose at least one display.');return;}
 directoryPreviewProjectId=activeProjectId;directoryPreview=compareCatalogToProject(project,entries).map(p=>({...p,include:mode==='suggestion'||(mode==='refresh'?(p.kind!=='already'):(p.kind==='new')),replaceDetails:false}));
 // Manual-selection preview includes older years, but never marks older-year entries as active.
 if(mode==='selected'){ 
  const missing=entries.filter(e=>e.holiday!==project.holiday||e.year!==project.year);
  for(const e of missing){const historical=e.holiday===project.holiday&&e.year<project.year;directoryPreview.push({entry:e,existingId:null,kind:historical?'historical':'different-season',allowHistorical:historical,include:false});}
 }
 renderDirectoryReview();$('directory-review').classList.remove('hidden');
 directoryStatus(`Review ${directoryPreview.length} candidates. Nothing changes until you approve.`);
}
function renderDirectoryReview(){
 const review=$('directory-review-items');review.replaceChildren();
 const desc=document.createElement('p');desc.className='hint';desc.textContent='Only checked rows will be applied. Matched houses keep your visit notes, visited status and manually approved pins. Older-season entries cannot be added to the current year as verified.';review.append(desc);
 for(const [i,action] of directoryPreview.entries()){
  const row=document.createElement('div');row.className='directory-review-row';
  const label=document.createElement('label');label.className='review-select';
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=action.include;checkbox.disabled=action.kind==='different-season'||action.kind==='already';
  checkbox.addEventListener('change',()=>{action.include=checkbox.checked;updateDirectoryButton()});
  const kind=action.kind==='new'?'New':action.kind==='update'?'Update details':action.kind==='already'?'Already matched':action.kind==='historical'?'Archive · add only as unverified':'Different holiday/year';
  label.append(checkbox,document.createTextNode(`${kind} · ${action.entry.name}`));
  const sub=document.createElement('p');sub.className='hint';sub.textContent=`${action.entry.address} · ${action.entry.holiday} ${action.entry.year} · ${action.entry.sourceName}`;
  row.append(label,sub);
  if(action.kind==='historical'){const p=document.createElement('p');p.className='hint';p.textContent=`Optional: keep this ${action.entry.year} reference in your ${currentProject().year} drive for a seasonal recheck. Its original year stays attached; it is not confirmed operating and cannot seed a suggested tour until rechecked.`;row.append(p);}
  if(suggestion&&action.entry.mustSee)checkbox.disabled=true;
  for(const warning of [...(action.warnings||[]),...(action.entry.conflicts||[]),...(action.entry.unreviewed?['Unreviewed source discovery. Adding it here is a private project decision; the public directory is unchanged.']:[])]){const p=document.createElement('p');p.className='hint';p.textContent=warning;row.append(p);}
  if(action.kind==='update'){
   const opt=document.createElement('label');opt.className='copy-check';const ch=document.createElement('input');ch.type='checkbox';ch.checked=action.replaceDetails;
   ch.addEventListener('change',()=>{action.replaceDetails=ch.checked});opt.append(ch,document.createTextNode('Replace display name and address with directory values (otherwise retain your version)'));row.append(opt);
  }
  review.append(row);
 }
 updateDirectoryButton();
}
function updateDirectoryButton(){
 const count=directoryPreview.filter(x=>x.include).length;
 $('directory-apply').disabled=directoryPreviewProjectId!==activeProjectId||count===0||!catalogFits(currentProject(),directoryPreview);
 $('directory-apply').textContent=suggestion?'Apply & plan suggested tour':`Apply ${count} reviewed changes`;
}
async function applyDirectoryReview(){
 if(directoryPreviewProjectId!==activeProjectId){directoryStatus('The project changed. Review directory changes for this drive again.');return;}
 const selected=directoryPreview.filter(x=>x.include);
 if(!selected.length)return;
 if(!confirm(`Apply ${selected.length} catalog changes to “${currentProject().name}”? Existing stops and private notes will be retained. Back up all years for extra safety.`))return;
 try{
  const pendingSuggestion=suggestion;
  save();const next=applyCatalogToProject(currentProject(),selected.filter(a=>!a.entry.saved));
  state.displays=next.displays;state.selected=new Set(next.selected);
  if(pendingSuggestion){
   const addresses=new Set(selected.map(a=>canonicalAddress(a.entry.address)));
   state.selected=new Set(state.displays.filter(d=>addresses.has(canonicalAddress(d.address))||d.mustSee&&state.selected.has(d.id)).map(d=>d.id));
   const center=pendingSuggestion.center;gpsStart={...center,name:'Tour search location',address:`${center.lat.toFixed(6)},${center.lon.toFixed(6)}`,geoSource:'manual'};
   temporaryFinish=state.end?null:{...gpsStart,name:'Return to tour start'};
   $('location-status').textContent='Suggested tour starts at your search point for this tab only. An empty finish returns there.';
  }
  state.preset='custom';$('preset').value='custom';save();invalidate();renderStops();updateProjectSelect();
  $('directory-review').classList.add('hidden');directoryPreview=[];suggestion=null;
  directoryStatus(`${next.added} added · ${next.updated} matched listing updates. Display operation still requires verification.`);
  renderDirectoryList();
  if(pendingSuggestion)await calculate(false);
 }catch(error){directoryStatus('Directory changes not saved: '+error.message);}
}
function submitDirectorySuggestion(event){
 event.preventDefault();
 const form={type:$('submit-type').value,name:$('submit-name').value.trim(),address:$('submit-address').value.trim(),holiday:$('submit-holiday').value,year:$('submit-year').value,sourceUrl:$('submit-source').value.trim(),permission:$('submit-permission').value,notes:$('submit-notes').value.trim()};
 const removal=form.type==='removal';if(removal){form.address='';form.sourceUrl='';}
 if(!form.name||!removal&&(!/\b\d{1,6}\s+\S+/.test(form.address)||!/^https:\/\//.test(form.sourceUrl))){directoryStatus('Enter a name, complete street address and HTTPS public source link, or a catalog ID for a removal request.');return;}
 if(!confirm('This opens a PUBLIC GitHub issue. Only submit a home address that is already publicly advertised, or one you own or have permission to share. Do not include private personal details. Continue?'))return;
 window.open(makeSubmissionUrl(form),'_blank','noopener,noreferrer');
 directoryStatus('Opened a draft public suggestion on GitHub. Submit the issue there to request moderator review; no listing is auto-published.');
}

function setEndpoint(key,value){
 if(key==='start'){gpsStart=null;temporaryFinish=null;$('location-status').textContent='';}
 if(key==='end')temporaryFinish=null;
 state[key]=value;delete state.endpoints[key];save();invalidate();
}
function updateDrivePanel(){
 const el=$('drive-current');if(!el)return;
 $('drive-panel').classList.toggle('active',driveActive);
 $('drive-resume').classList.toggle('hidden',!savedDrive()||driveActive);
 $('drive-start').disabled=!currentRoute||!!currentRoute.approx||driveActive;
 for(const id of ['drive-visited','drive-skip','drive-gps','drive-retry','drive-end'])$(id).disabled=!driveActive||busy;
 updateDriveFeedback();
 $('drive-next-links').replaceChildren();
 if(!driveActive){el.textContent=currentRoute?'Ready to start. Live Drive Mode requires road routing.':'Optimize a road route first.';return;}
 const next=state.displays.find(d=>d.id===driveRemainingIds[0]);
 el.textContent=next?`${driveRemainingIds.length} remaining · Next: ${next.name} — ${next.address}`:'All displays completed. Head toward your final destination.';
 $('drive-progress').textContent=`${Math.max(0,driveTotal-driveRemainingIds.length)} of ${driveTotal} displays completed or skipped${routeEstimates()?' · '+minutes(routeEstimates().duration)+' modeled driving remaining (includes finish)':''}`;
 for(const [label,fn] of [['Apple Maps',appleDirections],['Google Maps',googleDirections]]){
  const link=document.createElement('a');link.className='secondary';link.href=fn(waypointValue(driveAnchor),[waypointValue(next||driveFinish)]);link.target='_blank';link.rel='noopener noreferrer';link.textContent=`Navigate · ${label} ↗`;$('drive-next-links').append(link);
 }
 $('drive-visited').disabled=busy||!next;$('drive-skip').disabled=busy||!next;
}
function updateDriveFeedback(){
 const panel=$('drive-feedback'),item=driveActive?state.displays.find(d=>d.id===driveRemainingIds[0]):null;
 const changed=panel.dataset.displayId!==(item?.id||'')||panel.dataset.projectId!==activeProjectId;
 panel.classList.toggle('hidden',!item);panel.disabled=!item||busy;
 panel.dataset.displayId=item?.id||'';panel.dataset.projectId=activeProjectId;
 if(changed){$('drive-note-details').open=false;$('drive-feedback-status').textContent='';}
 $('drive-feedback-name').textContent=item?`For ${item.name}`:'';
 const rating=item?.rating>=1&&item?.rating<=5?Number(item.rating):3;
 for(const input of $('drive-rating').querySelectorAll('input')){
  input.checked=Number(input.value)===rating;
  input.nextElementSibling.textContent=Number(input.value)<=rating?'★':'☆';
  input.parentElement.classList.toggle('filled',Number(input.value)<=rating);
 }
 $('drive-rating-value').textContent=`${rating} / 5`;
 $('drive-favorite').setAttribute('aria-pressed',String(!!item?.favorite));
 $('drive-favorite').textContent=item?.favorite?'♥ Favorited':'♡ Favorite';
 const notes=item?.visitNotes||'';
 // Avoid replacing a focused textarea on unrelated route-summary updates.
 if($('drive-notes').value!==notes)$('drive-notes').value=notes;
}
function editDriveFeedback(field,value){
 const panel=$('drive-feedback');
 if(!driveActive||busy||panel.dataset.projectId!==activeProjectId||panel.dataset.displayId!==driveRemainingIds[0])return;
 const item=state.displays.find(d=>d.id===panel.dataset.displayId);if(!item)return;
 if(field==='rating'){const rating=Number(value);if(!Number.isInteger(rating)||rating<1||rating>5)return;item.rating=rating;}
 else if(field==='favorite')item.favorite=!item.favorite;
 else if(field==='visitNotes')item.visitNotes=value.slice(0,500);
 else return;
 const saved=save();
 $('drive-feedback-status').textContent=saved?'Saved on this device.':'Changes are only in this tab. Browser storage is unavailable; export a backup before closing.';
 if(field!=='visitNotes'){updateDriveFeedback();renderStops();}
}
function driveFingerprint(){return JSON.stringify([state.start,state.end,state.mode,state.budgetEnabled,state.budgetMinutes,state.viewMinutes,getSelected().map(d=>[d.id,d.address])]);}
function savedDrive(){
 const session=state.drive;if(!session||session.fingerprint!==driveFingerprint()||!Array.isArray(session.remainingIds)||!session.remainingIds.length||!Number.isInteger(session.total)||session.total>70||session.total<session.remainingIds.length)return null;
 if(new Set(session.remainingIds).size!==session.remainingIds.length||session.remainingIds.some(id=>!state.displays.some(d=>d.id===id))||session.anchorId&&!state.displays.some(d=>d.id===session.anchorId))return null;
 return session;
}
function saveDrive(){state.drive={fingerprint:driveFingerprint(),remainingIds:driveRemainingIds.slice(),anchorId:driveAnchorId,total:driveTotal};save();}
function focusDrive(){document.body.classList.add('driving');$('drive-panel').scrollIntoView({block:'start',behavior:'instant'});$('drive-visited').focus({preventScroll:true});}
function beginDrive(){
 if(!currentRoute||currentRoute.approx||busy)return;
 driveActive=true;driveAnchor={...currentPoints[0]};driveFinish={...currentPoints.at(-1)};
 currentRoute.liveDeparture=Date.now();
 driveRemainingIds=currentRoute.order.map(i=>currentPoints[i].id);driveTotal=driveRemainingIds.length;driveAnchorId=null;saveDrive();
 renderRouteSummary();focusDrive();status('Drive started. Use Live Drive Mode while parked; map directions still run in Apple or Google Maps.','good');
}
function stopDrive(){cancelOperation();driveActive=false;driveAnchor=null;driveRemainingIds=[];driveFinish=null;state.drive=null;save();document.body.classList.remove('driving');if(currentRoute)renderRouteSummary();else updateDrivePanel();status('Drive session ended. Saved visits and skipped statuses remain in this holiday project.','good');}
async function resumeDrive(){
 const session=savedDrive();if(!session||busy)return;
 const token=beginOperation();
 try{
  const items=session.remainingIds.map(id=>state.displays.find(d=>d.id===id));
  const anchor=state.displays.find(d=>d.id===session.anchorId);
  const resolved=await resolvePoints(anchor?[...items,anchor]:items,token.signal);token.signal.throwIfAborted();
  driveActive=true;driveRemainingIds=session.remainingIds.slice();driveTotal=session.total;driveAnchorId=session.anchorId;
  driveAnchor=anchor?{...anchor}:resolved[0];driveFinish=resolved.at(-1);
 }catch(error){if(!token.signal.aborted)status('Could not resume: '+error.message,'error');return;}
 finally{finishOperation(token);}
 if(driveActive){focusDrive();await rerouteLive(false);}
}
async function liveAction(action){
 if(!driveActive||busy||!currentRoute)return;
 const target=currentPoints[currentRoute.order[0]];
 if(!target)return;
 const original=state.displays.find(d=>d.id===target.id);
 if(!original)return;
 if(action==='visit'){
  original.visited=true;original.visitedAt=new Date().toISOString();original.skipped=false;
  driveAnchor={...target};driveAnchorId=target.id;
 }else{original.skipped=true;}
 driveRemainingIds=driveRemainingIds.filter(id=>id!==target.id);saveDrive();renderStops();
 // Remove the acted-on display immediately, even if the next request fails.
 const remaining=driveRemainingIds.map(id=>state.displays.find(d=>d.id===id));
 currentPoints=[driveAnchor,...remaining,driveFinish];lastMatrix=null;
 currentRoute={order:remaining.map((_,i)=>i+1),approx:false,method:'manual',variants:[],variantIndex:-1,comparisonMessage:'Rerouting remaining displays…'};
 routeLayer?.clearLayers();renderRouteSummary();
 await rerouteLive(false);
}
async function rerouteLive(useGps){
 if(!driveActive||busy)return;
 const token=beginOperation();
 try{
 let anchor=driveAnchor;
 if(useGps){
  if(!navigator.geolocation){status('This browser does not offer location access.','error');return;}
  status('Requesting location access for a one-time reroute…','working');
  try{
   const location=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:false,timeout:9000,maximumAge:30000}));
   token.signal.throwIfAborted();
   anchor={name:'Current location',address:`${location.coords.latitude.toFixed(5)},${location.coords.longitude.toFixed(5)}`,lat:location.coords.latitude,lon:location.coords.longitude,geoSource:'manual'};
  }catch(error){if(!token.signal.aborted)status('Location was not available. Your existing route has not changed. Use Retry without GPS.','error');return;}
 }
   const items=driveRemainingIds.map(id=>state.displays.find(d=>d.id===id)).filter(Boolean);
   if(!items.length){driveRemainingIds=[];currentRoute.order=[];currentPoints=[anchor,driveFinish];lastMatrix=null;showResults(true);$('itinerary').textContent='Tour complete. Head to your saved finish.';$('nav-buttons').replaceChildren();routeLayer?.clearLayers();
     for(const [name,fn] of [['Apple Maps',appleDirections],['Google Maps',googleDirections]]){const link=document.createElement('a');link.href=fn(waypointValue(anchor),[waypointValue(driveFinish)]);link.target='_blank';link.rel='noopener noreferrer';link.textContent=`Navigate to finish in ${name} ↗`;$('nav-buttons').append(link);}
     $('metrics').replaceChildren();$('route-detail').textContent='Tour complete. Use the links to reach your finish.';$('route-choices').replaceChildren();state.drive=null;save();updatePins();status('All selected displays completed or skipped. Navigate to your finish!','good');return;}
   const newPoints=[anchor,...items,driveFinish];const matrix=await roadMatrix(newPoints,token.signal);token.signal.throwIfAborted();
   const value=state.mode==='distance'?matrix.distances:matrix.durations;
   const answer=optimize(value);
   driveAnchor=anchor;lastMatrix=matrix;currentPoints=newPoints;currentRoute={...answer,approx:false,liveDeparture:Date.now(),variants:[],variantIndex:0};
   driveRemainingIds=answer.order.map(i=>newPoints[i].id);
   saveDrive();await loadRouteAlternatives(token.signal);token.signal.throwIfAborted();driveRemainingIds=currentRoute.order.map(i=>currentPoints[i].id);saveDrive();renderRouteSummary();await drawRoute(token.signal);
   status(`Rerouted ${items.length} remaining display(s) from ${useGps?'your current position':'the last confirmed stop'}.`,'good');
 }catch(error){if(token.signal.aborted)return;console.warn(error);if(currentRoute)currentRoute.comparisonMessage='Reroute unavailable. Remaining stops stay in their previous order. Use Retry without GPS.';renderRouteChoices();status('Could not reroute: '+error.message+' Visited/skip choices remain saved. Use Retry without GPS.','error');}
 finally{finishOperation(token);}
}
async function useStartingLocation(){
 if(gpsStart){gpsStart=null;temporaryFinish=null;invalidate();$('location-status').textContent='Using your entered starting address again.';$('use-location').textContent='Use my location';return;}
 if(!navigator.geolocation){$('location-status').textContent='Location is unavailable. Enter a starting address instead.';return;}
 const typed=$('start-input').value,projectId=activeProjectId;
 const token=beginOperation();$('location-status').textContent='Requesting a one-time position…';
 try{
  const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:false,timeout:9000,maximumAge:30000}));
  token.signal.throwIfAborted();
  if(typed!==$('start-input').value||projectId!==activeProjectId){$('location-status').textContent='Your edited address was retained. Try location again if needed.';return;}
  const point={lat:position.coords.latitude,lon:position.coords.longitude};if(!validCoordinates(point))throw Error('Invalid location');
  gpsStart={...point,name:'Current location',address:`${point.lat.toFixed(5)},${point.lon.toFixed(5)}`,geoSource:'manual'};
  invalidate();$('location-status').textContent='Using your current position for this tab only. Your entered address is retained.';$('use-location').textContent='Use entered address';
 }catch(error){if(!token.signal.aborted)$('location-status').textContent='Location unavailable or permission denied. Enter a starting address instead.';}
 finally{finishOperation(token);}
}
async function copyText(value){
 if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);return;}
 const el=document.createElement('textarea');el.value=value;el.style.position='fixed';el.style.left='-9999px';document.body.append(el);el.select();const ok=document.execCommand('copy');el.remove();if(!ok)throw Error('Clipboard unavailable; save a text itinerary instead.');
}
function routeText(){
 if(!currentRoute)return '';
 const path=currentRoute.order.map(i=>currentPoints[i]);
 const endpoints=$('share-endpoints').checked;
 return `${currentProject().name} — GlowRoute\n${endpoints?'Start: '+(currentPoints?.[0]?.address||state.start)+'\n':''}${path.map((s,i)=>`${i+1}. ${s.name} — ${s.address}`).join('\n')}${endpoints?'\nFinish: '+(currentPoints?.at(-1)?.address||state.end):''}\n\nDriving estimates exclude live traffic. Check display hours and locations.\n`;
}
function createItineraryFile(){
 const blob=new Blob([routeText()],{type:'text/plain;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='GlowRoute-itinerary.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function shareUrl(){
 if(!currentRoute?.order.length)throw Error('Optimize a route with at least one remaining display before sharing.');
 const stops=currentRoute.order.map(i=>currentPoints[i]);
 const includeEndpoints=$('share-endpoints').checked;
 const payload=makeSharePayload(currentProject(),stops,{includeEndpoints,start:currentPoints?.[0]?.address||state.start,end:currentPoints?.at(-1)?.address||state.end});
 const url=new URL(location.href);url.hash='tour='+encodeShare(payload);
 if(url.href.length>7500)throw Error('This itinerary is too long for a reliable URL. Save a text itinerary instead.');
 return url.href;
}
function inspectSharedLink(){
 sharedIncoming=null;$('shared-preview').classList.add('hidden');
 if(!location.hash.startsWith('#tour='))return;
 try{sharedIncoming=decodeShare(location.hash.slice(6));}
 catch(error){status('Invalid shared itinerary link: '+error.message,'error');return;}
 $('shared-preview').classList.remove('hidden');$('shared-summary').textContent=`${sharedIncoming.name} · ${sharedIncoming.holiday} ${sharedIncoming.year} · ${sharedIncoming.stops.length} houses${sharedIncoming.start||sharedIncoming.end?' · Includes trip endpoints':''}`;
 $('shared-stops').replaceChildren();sharedIncoming.stops.forEach((s,i)=>{const p=document.createElement('p');p.textContent=`${i+1}. ${s.name} — ${s.address}`;$('shared-stops').append(p)});
}
function dismissShare(){sharedIncoming=null;$('shared-preview').classList.add('hidden');history.replaceState(null,'',location.pathname+location.search);}
function importSharedDrive(){
 if(!sharedIncoming)return;
 if(portfolio.projects.length>=40){status('You have reached the 40-project limit. Back up or remove an old drive first.','error');return;}
 const copy=sharedIncoming;const displays=copy.stops.map((s,i)=>({id:createId(),name:s.name,address:s.address,lat:null,lon:null,featured:0,approved:false,sourceName:'Shared GlowRoute itinerary',needsSeasonCheck:true,rating:3}));
 const next=makeProject({name:uniqueProjectName(copy.name,portfolio.projects),holiday:copy.holiday,year:copy.year,displays,selected:displays.map(d=>d.id),start:copy.start||'',end:copy.end||'',preset:'custom'});
 save();portfolio.projects.push(next);activeProjectId=next.id;state=stateFromProject(next);dismissShare();syncControls();invalidate();renderStops();save();status(`Imported ${displays.length} shared houses into a NEW project. Check addresses before driving.`,'good');
}
function wire(){
 initPanelResize({layout:document.querySelector('.layout'),handle:$('panel-resizer'),mapArea:document.querySelector('.map-area'),onMapResize:()=>map?.invalidateSize({pan:false,debounceMoveend:true})});
 syncControls();
 if(!rawPortfolio&&!legacy&&!storageReadError&&!location.hash.startsWith('#tour='))$('welcome').classList.remove('hidden');
 if(storageReadError)$('storage-status').textContent='Saved data could not be read. Original browser data has not been overwritten. Export any work in this session before recovery.';
 $('welcome-sample').addEventListener('click',()=>{$('welcome').classList.add('hidden');save();$('start-input').focus();});
 $('welcome-own').addEventListener('click',()=>{$('welcome').classList.add('hidden');openProjectEditor(false);$('project-name').focus();});
 $('use-location').addEventListener('click',useStartingLocation);
 $('round-trip').addEventListener('click',()=>{if(gpsStart){temporaryFinish={...gpsStart,name:'Return to start'};save();invalidate();$('location-status').textContent='Finish returns to your temporary start for this tab only.';}else{setEndpoint('end',$('start-input').value.trim());$('end-input').value=state.end;}});
 for(const id of ['departure','departure-zone','departure-fold'])$(id).addEventListener('change',()=>{state.departure=$('departure').value;state.departureZone=$('departure-zone').value.trim();state.departureFold=$('departure-fold').value;save();if(currentRoute)renderSchedule(state,currentRoute,currentPoints,lastMatrix,currentProject());});
 $('drive-resume').addEventListener('click',resumeDrive);
 $('drive-retry').addEventListener('click',()=>rerouteLive(false));
 $('drive-full').addEventListener('click',()=>{const focused=document.body.classList.toggle('driving');$('drive-full').textContent=focused?'Show full itinerary':'Focus on next stop';updateDrivePanel();});
 $('drive-rating').addEventListener('change',event=>editDriveFeedback('rating',event.target.value));
 $('drive-favorite').addEventListener('click',()=>editDriveFeedback('favorite'));
 $('drive-notes').addEventListener('input',event=>editDriveFeedback('visitNotes',event.target.value));
 $('drive-notes').addEventListener('change',renderStops);
 $('start-input').addEventListener('change',e=>setEndpoint('start',e.target.value.trim()));
 $('end-input').addEventListener('change',e=>setEndpoint('end',e.target.value.trim()));
 $('mode').addEventListener('change',e=>{state.mode=e.target.value;save();invalidate();});
 $('preset').addEventListener('change',e=>preset(e.target.value));
 $('optimize').addEventListener('click',()=>calculate(false));$('estimate').addEventListener('click',()=>calculate(true));
 for(const id of ['budget-enabled','budget-minutes','view-minutes'])$(id).addEventListener('change',()=>{state.budgetEnabled=$('budget-enabled').checked;state.budgetMinutes=Number($('budget-minutes').value);const viewing=Number($('view-minutes').value);if(!Number.isFinite(viewing)||viewing<0||viewing>60){status('Enter a default viewing time between 0 and 60 minutes.','error');return;}state.viewMinutes=viewing;save();if(id==='view-minutes')updateViewingEstimates();else invalidate();});
 $('drive-start').addEventListener('click',beginDrive);
 $('drive-visited').addEventListener('click',()=>liveAction('visit'));
 $('drive-skip').addEventListener('click',()=>liveAction('skip'));
 $('drive-gps').addEventListener('click',()=>rerouteLive(true));
 $('drive-end').addEventListener('click',stopDrive);
 $('share-link').addEventListener('click',async()=>{try{await copyText(shareUrl());$('share-status').textContent='Share link copied. People opening it can review addresses before adding a separate project.';}catch(e){$('share-status').textContent=e.message;}});
 $('share-text').addEventListener('click',async()=>{try{await copyText(routeText());$('share-status').textContent=$('share-endpoints').checked?'Text copied with endpoints.':'Text copied. Start, finish and private notes are omitted.';}catch(e){$('share-status').textContent=e.message;}});
 $('share-file').addEventListener('click',createItineraryFile);
 $('shared-import').addEventListener('click',importSharedDrive);$('shared-dismiss').addEventListener('click',dismissShare);
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
 $('directory-load').addEventListener('click',fetchDirectory);
 $('directory-search').addEventListener('input',renderDirectoryList);
 $('directory-season').addEventListener('change',renderDirectoryList);
 $('directory-year').addEventListener('change',renderDirectoryList);
 $('directory-sort').addEventListener('change',renderDirectoryList);
 for(const id of ['discovery-radius','discovery-type','discovery-cost','discovery-access','discovery-family','discovery-music'])$(id).addEventListener('change',renderDirectoryList);
 $('discovery-find').addEventListener('click',()=>locateDiscovery(false));$('discovery-gps').addEventListener('click',()=>locateDiscovery(true));
 $('discovery-address').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();locateDiscovery(false);}});
 $('discovery-address').addEventListener('input',()=>{discoveryRevision++;discoveryRequest?.abort();});
 $('discovery-clear').addEventListener('click',()=>setDiscoveryCenter(null,''));
 $('discovery-map').addEventListener('click',()=>{if(!map){$('discovery-location-status').textContent='Map is unavailable. Enter an address or coordinates.';return;}discoveryRevision++;discoveryRequest?.abort();discoveryMapMode=!discoveryMapMode;$('discovery-map').textContent=discoveryMapMode?'Cancel map choice':'Choose on map';$('discovery-location-status').textContent=discoveryMapMode?'Tap a point on the map to search nearby.':'Map choice canceled.';if(discoveryMapMode)$('map').scrollIntoView({block:'center',behavior:'smooth'});});
 $('discovery-snapshot').addEventListener('change',loadDiscoverySnapshot);$('discovery-suggest').addEventListener('click',suggestDiscoveryTour);
 $('explorer-load').addEventListener('click',loadExplorerSnapshot);$('source-paste-open').addEventListener('click',()=>openSourcePaste());
 $('directory-select-visible').addEventListener('click',toggleDirectoryShown);
 $('directory-clear-selection').addEventListener('click',()=>{directorySelection.clear();renderDirectoryList();});
 $('directory-review-selected').addEventListener('click',()=>prepareDirectoryReview('selected'));
 $('directory-refresh-project').addEventListener('click',()=>prepareDirectoryReview('refresh'));
 $('directory-apply').addEventListener('click',applyDirectoryReview);
 $('directory-cancel').addEventListener('click',()=>{$('directory-review').classList.add('hidden');directoryPreview=[];suggestion=null;});
 $('directory-toggle').addEventListener('click',()=>{$('directory-panel').classList.toggle('hidden');if(!directoryData&&!$('directory-panel').classList.contains('hidden'))fetchDirectory();else renderDirectoryList();});
 $('submission-toggle').addEventListener('click',()=>{$('submission-panel').classList.toggle('hidden');});
 $('submission-form').addEventListener('submit',submitDirectorySuggestion);
 $('submit-type').addEventListener('change',()=>{const removal=$('submit-type').value==='removal';for(const id of ['submit-address','submit-source']){$(id).required=!removal;$(id).disabled=removal;} $('submit-name').placeholder=removal?'Catalog ID or display name':'Display name';});
 $('import-file').addEventListener('change',loadImportFile);
 const invalidatePreview=()=>{importRevision++;importRequest?.abort();$('website-load').disabled=false;importPreviewReady=false;$('import-confirm').disabled=true;$('import-review-summary').textContent='The input changed. Preview addresses again before importing.';for(const id of ['import-select-all','import-select-none'])$(id).disabled=true;};
 $('bulk-text').addEventListener('input',()=>{sourceRecords=null;delete $('bulk-text').dataset.filename;invalidatePreview();});
 $('import-city').addEventListener('input',invalidatePreview);
 for(const id of ['website-url','import-source-year','import-source-holiday'])$(id).addEventListener('input',()=>{sourceRecords=null;invalidatePreview();});
 $('import-mode').addEventListener('change',()=>{if(importPreviewReady)renderImportRows();});
 $('import-select-all').addEventListener('click',()=>{pendingImport.forEach(r=>r.include=true);renderImportRows();});
 $('import-select-none').addEventListener('click',()=>{pendingImport.forEach(r=>r.include=false);renderImportRows();});
 $('import-confirm').addEventListener('click',commitImport);
 $('import-cancel').addEventListener('click',closeImport);
 $('fit').addEventListener('click',fitMap);
 renderStops();initMap();inspectSharedLink();updateDrivePanel();
 window.addEventListener('hashchange',inspectSharedLink);
 if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='localhost')){
  const alreadyControlled=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(registration=>{
   const announce=()=>{if(navigator.serviceWorker.controller){$('update-notice').classList.remove('hidden');}};
   if(registration.waiting)announce();
   registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed')announce();});});
   document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')registration.update().catch(console.warn);});
  }).catch(console.warn);
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(alreadyControlled)$('update-notice').classList.remove('hidden');});
 }
 $('update-reload').addEventListener('click',()=>{if(save())location.reload();else status('Back up all years before reloading: changes could not be saved.','error');});
}
wire();
