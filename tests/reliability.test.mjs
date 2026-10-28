import test from 'node:test';
import assert from 'node:assert/strict';
import {validCoordinates,coordinateInput,locationPath,fetchJson,createRoutingClient,validateRoadMatrix} from '../routing.mjs';
import {routeCandidates,decodeShare,encodeShare,selectWithinBudget} from '../tour.mjs';
import {makeProject,validatePortfolio,presetSelection} from '../projects.mjs';
import {catalogFits} from '../directory.mjs';
import {parseImportedStops} from '../importer.mjs';

test('coordinates work nationwide, worldwide and at boundaries; reject coercion and invalid ranges',()=>{
 for(const [lat,lon] of [[40.71,-74.0],[34.05,-118.24],[64.2,-149.5],[21.3,-157.8],[51.5,-.1],[0,0],[-90,180],[90,-180]]){
  assert(validCoordinates({lat,lon}));assert.equal(coordinateInput(`${lat}, ${lon}`).lat,lat);
 }
 for(const p of [{lat:91,lon:0},{lat:0,lon:-181},{lat:NaN,lon:0},{lat:'39',lon:-86},{lat:null,lon:0}])assert(!validCoordinates(p));
 assert.throws(()=>coordinateInput('91, -86'));assert.throws(()=>locationPath([{lat:0,lon:Infinity}]));
 assert.equal(coordinateInput('New York, NY'),null);
});
const durations=[[0,1,8,0],[0,0,1,8],[0,8,0,1],[0,0,0,0]];
const distances=[[0,8,1,0],[0,0,8,1],[0,1,0,8],[0,0,0,0]];
test('time and distance candidates respect selected mode, keep every stop and fixed endpoints',()=>{
 const time=routeCandidates({durations,distances},'duration'),distance=routeCandidates({durations,distances},'distance');
 assert.deepEqual(time[0].order,[1,2]);assert.deepEqual(distance[0].order,[2,1]);
 assert.match(time[0].label,/time/);assert.match(distance[0].label,/distance/);
 for(const c of [...time,...distance]){assert.deepEqual(new Set(c.order),new Set([1,2]));assert.equal(c.method,'exact');}
});
test('budget comparison excludes distance orders that exceed driving plus viewing allowance',()=>{
 const candidates=routeCandidates({durations,distances},'distance',{viewingSeconds:10,limitSeconds:15});
 assert.equal(candidates.length,1);assert.deepEqual(candidates[0].order,[1,2]);
});
test('same time and distance order produces one comparison request',()=>assert.equal(routeCandidates({durations,distances:durations}).length,1));
test('road matrices reject null, negative, incomplete, malformed and far snapped locations',()=>{
 const data={code:'Ok',durations,distances};assert.equal(validateRoadMatrix(data,4),data);
 for(const bad of [{...data,durations:[[0]]},{...data,distances:distances.map(r=>r.map(()=>null))},{...data,durations:durations.map(r=>r.map(()=>-1))},{...data,sources:[{distance:1800}]}])assert.throws(()=>validateRoadMatrix(bad,4));
});
const response=data=>({ok:true,json:async()=>data});
test('routing serializes requests, spaces starts, deduplicates and caches only for bounded TTL',async()=>{
 let clock=0,calls=0,active=0;const starts=[];
 const client=createRoutingClient({now:()=>clock,pause:async ms=>{clock+=ms;},ttlMs:3000,maxEntries:1,fetchImpl:async()=>{
  assert.equal(active++,0);starts.push(clock);calls++;await Promise.resolve();active--;return response({code:'Ok'});
 }});
 await Promise.all([client.request('a'),client.request('a'),client.request('b')]);
 assert.equal(calls,2);assert.equal(starts[1]-starts[0],1100);
 await client.request('b');assert.equal(calls,2);
 await client.request('a');assert.equal(calls,3); // bounded eviction
 clock+=3100;await client.request('a');assert.equal(calls,4);
});
test('aborted queued requests are never sent and later requests still work',async()=>{
 let calls=0;const controller=new AbortController();
 const client=createRoutingClient({intervalMs:0,fetchImpl:async()=>{calls++;return response({code:'Ok'});}});
 const result=client.request('a',{signal:controller.signal});controller.abort();
 await assert.rejects(result,{name:'AbortError'});await client.request('b');assert.equal(calls,1);
});
test('network failure and OSRM failures are actionable and not cached',async()=>{
 let calls=0;const client=createRoutingClient({intervalMs:0,fetchImpl:async()=>{if(++calls===1)throw TypeError('offline');return response({code:'NoRoute'});}});
 await assert.rejects(client.request('a'),/connection/);await assert.rejects(client.request('a'),/NoRoute/);assert.equal(calls,2);
});
test('429 respects a cooldown rather than automatic retry loops',async()=>{
 let clock=0,calls=0;const client=createRoutingClient({now:()=>clock,pause:async ms=>{clock+=ms;},fetchImpl:async()=>{
  calls++;return calls===1?{ok:false,status:429,headers:new Headers({'retry-after':'120'})}:response({code:'Ok'});
 }});
 await assert.rejects(client.request('a'),/Wait a minute/);await client.request('b');assert.equal(calls,2);assert(clock>=120000);
});
test('timeout covers response bodies and in-flight aborts preserve AbortError',async()=>{
 const hung=async(url,{signal})=>({ok:true,json:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))});
 await assert.rejects(fetchJson('a',{timeoutMs:10,fetchImpl:hung}),/timed out/);
 const controller=new AbortController();const pending=fetchJson('b',{signal:controller.signal,fetchImpl:hung});
 await Promise.resolve();controller.abort();await assert.rejects(pending,{name:'AbortError'});
});
test('directory capacity allows 69 existing stops plus an update and one addition',()=>{
 const entries=Array.from({length:69},(_,i)=>({id:`d${i}`,name:`Display ${i}`,address:`${i+100} Maple St, Denver, CO`}));
 const project=makeProject({displays:entries});
 const actions=[{include:true,entry:{...entries[0],id:'catalog-1'},kind:'update'},{include:true,entry:{id:'new',name:'New',address:'999 Main St, Denver, CO'},kind:'new'}];
 assert(catalogFits(project,actions));assert(!catalogFits(project,[...actions,{include:true,entry:{id:'overflow',name:'Too many',address:'998 Main St, Denver, CO'}}]));
});
test('presets retain must-see records and never select deleted sample IDs',()=>{
 const displays=[{id:'a',featured:true},{id:'b',mustSee:true},{id:'c'}];
 assert.deepEqual([...presetSelection(displays,'top5',['deleted'])],['b']);
 assert.deepEqual([...presetSelection(displays,'top10')],['a','b']);
 assert.equal(presetSelection(displays,'all').size,3);
});
const project=()=>makeProject({name:'Trip',displays:[{id:'a',name:'Display',address:'100 Main St, Denver, CO',lat:39.7,lon:-104.9,favorite:true,visitNotes:'Private',mustSee:true}],selected:['a'],start:'Museum',end:'Park'});
test('backup round trip retains personal data and rejects partial/duplicate/malformed projects atomically',()=>{
 const p=project(),backup=JSON.parse(JSON.stringify({version:2,projects:[p],activeId:p.id}));
 assert.deepEqual(validatePortfolio(backup,{backup:true}).projects[0],p);
 for(const mutate of [b=>b.projects.push(null),b=>b.projects.push(b.projects[0]),b=>b.projects[0].state.displays.push(null),b=>b.projects[0].state.displays[0].lat=999,b=>b.projects[0].state.selected='a',b=>b.projects[0].state.cache={bad:{lat:0,lon:999}},b=>b.version=1]){
  const copy=structuredClone(backup);mutate(copy);assert.throws(()=>validatePortfolio(copy,{backup:true}));
 }
});
test('shared itineraries reject null, blank, and duplicate stops safely',()=>{
 const base={v:1,name:'Trip',holiday:'Halloween',year:2026,stops:[{name:'A',address:'100 Main Street, Denver, CO'}]};
 for(const payload of [null,{...base,stops:[null]},{...base,stops:[{name:' ',address:'100 Main St'}]},{...base,stops:[...base.stops,{name:'B',address:'100 Main St, Denver CO'}]}])assert.throws(()=>decodeShare(encodeShare(payload)));
});
test('nationwide imports preserve full addresses, literal city names and coordinate pairs',()=>{
 for(const address of ['100 Main St, Portland, OR','100 Main St, Anchorage, Alaska','100 Main St, Toronto, ON'])assert.equal(parseImportedStops(address,{defaultCity:''}).records[0].address,address);
 const parsed=parseImportedStops('Name,Address,City,State\nA,100 Main St,Washington (DC),DC',{filename:'a.csv',defaultCity:''});assert.match(parsed.records[0].address,/Washington \(DC\)/);
 const invalid=parseImportedStops(JSON.stringify([{name:'A',address:'100 Main St',lat:0,lon:190}]),{defaultCity:''});assert.equal(invalid.records[0].lat,null);assert.equal(invalid.records[0].lon,null);
});
test('plain address lists containing Street and commas are not mistaken for CSV headers',()=>{
 const result=parseImportedStops('Example A — 100 Test Street, Portland, OR\nExample B — 100 Test St, Portland OR\nExample C — 102 Test Ave, Portland, OR',{defaultCity:''});
 assert.equal(result.records.length,2);assert.equal(result.duplicates,1);assert.equal(result.records[0].name,'Example A');assert.equal(result.records[0].address,'100 Test Street, Portland, OR');
});
test('budget with no must-see stops reports travel-to-finish over budget clearly',()=>{
 const m=[[0,600,3600],[600,0,600],[3600,600,0]];
 assert.throws(()=>selectWithinBudget(m,[{rating:3}],10,4),/modeled trip/);
});
