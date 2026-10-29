import {optimize,routeCost} from './optimizer.mjs';
import {canonicalAddress} from './importer.mjs';
import {viewingMinutes as stopMinutes} from './display-info.mjs';

/** Keep the requested objective first; geometry comparisons must not change it. */
export function routeCandidates(matrix, mode='duration', budget=null) {
 const fastest=optimize(matrix.durations), shortest=optimize(matrix.distances);
 const candidates=[{...fastest,label:'Fastest modeled driving time'},{...shortest,label:'Shortest modeled driving distance'}];
 if(mode==='distance'&&!budget)candidates.reverse();
 return candidates.filter((candidate,index,all)=>
  all.findIndex(other=>other.order.join(',')===candidate.order.join(','))===index &&
  (!budget || routeCost(candidate.order,matrix.durations)+budget.viewingSeconds<=budget.limitSeconds+1e-6));
}

/** Return a smaller, fixed-endpoint matrix for the selected original node indices. */
export function subsetMatrix(matrix, indices) {
  const nodes=[0,...indices,matrix.length-1];
  return nodes.map(i=>nodes.map(j=>matrix[i][j]));
}
export function stopValue(display){
  const n=Number(display?.rating);
  const rating=Number.isFinite(n)&&n>=1&&n<=5?n:3;
  return rating+(display?.favorite?2:0)+(display?.featured?0.3:0);
}

/**
 * Budgeted-orienteering heuristic. Mandatory stops cannot be dropped.
 * Return original matrix indices, their sequence, and transparent totals.
 * Budget includes modeled drive plus minutes spent looking at each display.
 */
export function selectWithinBudget(durations, displays, budgetMinutes, viewingMinutes=4) {
  const n=displays.length;
  if(durations.length!==n+2)throw Error('Budget inputs do not match the driving matrix.');
  if(!Number.isFinite(budgetMinutes)||budgetMinutes<10||budgetMinutes>720)throw Error('Enter a time budget between 10 and 720 minutes.');
  if(!Number.isFinite(viewingMinutes)||viewingMinutes<0||viewingMinutes>60)throw Error('Enter 0–60 minutes per display.');
  const mandatory=displays.map((d,i)=>d.mustSee?i+1:0).filter(Boolean);
  let order=[];
  const incremental=(node,current)=>{
    let best={cost:Infinity,index:0};
    const path=[0,...current,durations.length-1];
    for(let pos=0;pos<path.length-1;pos++){
      const cost=durations[path[pos]][node]+durations[node][path[pos+1]]-durations[path[pos]][path[pos+1]];
      if(cost<best.cost)best={cost,index:pos};
    }
    return best;
  };
  for(const node of mandatory){const {index,cost}=incremental(node,order);if(!Number.isFinite(cost))throw Error('A must-see location has no driveable connection.');order.splice(index,0,node);}
  const viewing=node=>stopMinutes(displays[node-1],viewingMinutes)*60;
  const totalSeconds=seq=>routeCost(seq,durations)+seq.reduce((sum,node)=>sum+viewing(node),0);
 // Try the actual fixed-endpoint solver before deciding mandatory stops cannot fit.
 if(order.length){const improved=optimize(subsetMatrix(durations,order));order=improved.order.map(i=>order[i-1]);}
 if(totalSeconds(order)>budgetMinutes*60+1e-6)throw Error(`The modeled trip${mandatory.length?' with your '+mandatory.length+' must-see displays':''} needs ${Math.ceil(totalSeconds(order)/60)} minutes with the current ordering, exceeding this budget. Increase time or remove a must-see.`);
  const remaining=new Set(Array.from({length:n},(_,i)=>i+1).filter(i=>!mandatory.includes(i)));
  while(remaining.size){
    let winner=null;
    for(const node of remaining){
      const choice=incremental(node,order);
      const incrementalSeconds=choice.cost+viewing(node);
      if(!Number.isFinite(incrementalSeconds)||totalSeconds(order)+incrementalSeconds>budgetMinutes*60+1e-6)continue;
      const score=stopValue(displays[node-1])/(Math.max(60,incrementalSeconds));
      if(!winner||score>winner.score)winner={node,...choice,score};
    }
    if(!winner)break;
    order.splice(winner.index,0,winner.node);remaining.delete(winner.node);
  }
  if(!order.length)throw Error('No displays fit within the budget after travel to and from your endpoints.');
  // Minimize drive time of the selected set, never increasing its modeled travel.
  const remapped=subsetMatrix(durations,order);
  const improved=optimize(remapped);
  const arranged=improved.order.map(i=>order[i-1]);
  const drivingSeconds=routeCost(arranged,durations), viewingSeconds=arranged.reduce((sum,node)=>sum+viewing(node),0);
 return {indices:arranged,drivingSeconds,viewingSeconds,totalSeconds:drivingSeconds+viewingSeconds,limitSeconds:budgetMinutes*60,excluded:n-arranged.length,mandatory:mandatory.length};
}

const earth=6371000;
function segmentDistance([lon1,lat1],[lon2,lat2]){
 const latA=lat1*Math.PI/180,latB=lat2*Math.PI/180,dl=(lat2-lat1)*Math.PI/180,dlo=(lon2-lon1)*Math.PI/180;
 return 2*earth*Math.asin(Math.min(1,Math.sqrt(Math.sin(dl/2)**2+Math.cos(latA)*Math.cos(latB)*Math.sin(dlo/2)**2)));
}
/** Approximate undirected repeated route geometry, not a proof of an overlap-free path. */
export function roadOverlap(coordinates){
 const visited=new Set();let totalMeters=0,repeatedMeters=0;
 if(!Array.isArray(coordinates))return {totalMeters,repeatedMeters,percentage:0};
 for(let i=1;i<coordinates.length;i++){
  const a=coordinates[i-1],b=coordinates[i];if(!Array.isArray(a)||!Array.isArray(b))continue;
  const length=segmentDistance(a,b);if(length<0.3)continue;
  // Snap to roughly meter-level resolution; reversed road segments are counted too.
  const x=a.map(v=>Number(v).toFixed(5)).join(','),y=b.map(v=>Number(v).toFixed(5)).join(',');
  const key=x<y?`${x}|${y}`:`${y}|${x}`;
  totalMeters+=length;
  if(visited.has(key))repeatedMeters+=length;else visited.add(key);
 }
 return {totalMeters,repeatedMeters,percentage:totalMeters?100*repeatedMeters/totalMeters:0};
}

const MAX_SHARE_STOPS=70;
export function makeSharePayload(project, orderedDisplays, {includeEndpoints=false,start='',end=''}={}){
 if(!orderedDisplays.length||orderedDisplays.length>MAX_SHARE_STOPS)throw Error('Select 1–70 public stops to share.');
 const payload={v:1,name:String(project.name||'GlowRoute drive').slice(0,90),holiday:project.holiday||'Other',year:project.year||2026,stops:orderedDisplays.map(d=>({name:String(d.name||'Display').slice(0,90),address:String(d.address||'').slice(0,190)}))};
 if(payload.stops.some(s=>!s.address))throw Error('A route stop has no address.');
 if(includeEndpoints){payload.start=String(start).slice(0,250);payload.end=String(end).slice(0,250);}
 return payload;
}
export function encodeShare(payload){
 const bytes=new TextEncoder().encode(JSON.stringify(payload));
 let result='';for(const b of bytes)result+=String.fromCharCode(b);
 return btoa(result).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function decodeShare(value){
 if(typeof value!=='string'||value.length>18000||! /^[A-Za-z0-9_-]+$/.test(value))throw Error('Invalid or oversized shared route.');
 const decoded=atob(value.replace(/-/g,'+').replace(/_/g,'/'));
 const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));
 const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(!data||data.v!==1||!Array.isArray(data.stops)||data.stops.length<1||data.stops.length>MAX_SHARE_STOPS||data.stops.some(d=>!d||typeof d.name!=='string'||!d.name.trim()||typeof d.address!=='string'||!d.address.trim()||d.address.length>190||d.name.length>90))throw Error('Shared itinerary has invalid stops.');
 if(new Set(data.stops.map(d=>canonicalAddress(d.address))).size!==data.stops.length)throw Error('Shared itinerary contains duplicate addresses.');
 if(typeof data.name!=='string'||data.name.length>90||!['Halloween','Christmas','Other'].includes(data.holiday)||!Number.isInteger(data.year)||data.year<2000||data.year>2100)throw Error('Shared itinerary metadata is invalid.');
 if((data.start!==undefined&&(typeof data.start!=='string'||data.start.length>250))||(data.end!==undefined&&(typeof data.end!=='string'||data.end.length>250)))throw Error('Shared itinerary endpoints are invalid.');
 return data;
}
