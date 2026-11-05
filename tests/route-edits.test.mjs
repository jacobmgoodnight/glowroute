import test from 'node:test';
import assert from 'node:assert/strict';
import {editRouteStops,mapPinLocation,insertRouteStop} from '../route-edits.mjs';
import {optimize} from '../optimizer.mjs';
const points=[{id:'start'},{id:'a'},{id:'b'},{id:'c'},{id:'finish'}];
const matrix={distances:points.map((_,i)=>points.map((_,j)=>i*100+j)),durations:points.map((_,i)=>points.map((_,j)=>i*10+j))};
test('map pins wrap world-copy longitudes and reject invalid or coerced coordinates',()=>{
 assert.deepEqual(mapPinLocation({lat:39,lng:181}),{lat:39,lon:-179});
 assert.deepEqual(mapPinLocation({lat:-90,lng:-541}),{lat:-90,lon:179});
 for(const input of [{lat:91,lng:0},{lat:39,lng:NaN},{lat:'39',lng:1},{lat:0,lng:Infinity},{}])assert.equal(mapPinLocation(input),null);
});
test('move earlier/later preserves fixed endpoints, all stops and immutable inputs',()=>{
 const order=[3,1,2],before=JSON.stringify({points,order,matrix});
 const result=editRouteStops(points,order,matrix,{type:'move',id:'a',offset:-1});
 assert.deepEqual(result.order,[1,3,2]);assert.deepEqual(result.points,points);assert.equal(result.matrix,matrix);
 assert.deepEqual(editRouteStops(points,result.order,matrix,{type:'move',id:'a',offset:1}).order,order);
 assert.equal(JSON.stringify({points,order,matrix}),before);
});
test('remove compacts asymmetric matrices in retained visit order, keeping start and finish',()=>{
 const result=editRouteStops(points,[3,1,2],matrix,{type:'remove',id:'a'});
 assert.deepEqual(result.points.map(p=>p.id),['start','c','b','finish']);assert.deepEqual(result.order,[1,2]);
 assert.deepEqual(result.matrix.durations,[[0,3,2,4],[30,33,32,34],[20,23,22,24],[40,43,42,44]]);
 assert.equal(result.matrix.distances[2][1],203);assert.equal(points.length,5);
});
test('last stop can be excluded; rough routes and unavailable matrices stay explicit',()=>{
 const result=editRouteStops(points,[2],matrix,{type:'remove',id:'b'});
 assert.deepEqual(result.points,[points[0],points.at(-1)]);assert.deepEqual(result.order,[]);assert.equal(result.matrix.durations[0][1],4);
 assert.equal(editRouteStops(points,[1,2],null,{type:'remove',id:'a'}).matrix,null);
 assert.equal(editRouteStops(points,[1,2],{...matrix,durations:null},{type:'remove',id:'a'}).matrix.durations,null);
});
test('endpoint edits, unknown IDs, invalid moves and corrupt orders cannot remove required stops',()=>{
 for(const action of [{type:'remove',id:'start'},{type:'remove',id:'finish'},{type:'remove',id:'missing'},{type:'move',id:'a',offset:-1},{type:'move',id:'c',offset:1},{type:'move',id:'a',offset:10}])assert.equal(editRouteStops(points,[1,2,3],matrix,action),null);
 for(const order of [[0,1],[1,4],[1,1],[NaN]])assert.throws(()=>editRouteStops(points,order,matrix,{type:'remove',id:'a'}),/Invalid route/);
});

const display=(id,index)=>Object.freeze({id,name:`Display ${id}`,address:`${100+index} Example Rd, Portland, OR`,lat:45.5+index*.001,lon:-122.6,rating:5,visitNotes:'Private note'});
const routePoints=count=>Object.freeze([Object.freeze({id:'start',address:'Start address',lat:45.5,lon:-122.7}),...Array.from({length:count},(_,i)=>display(`stop-${i}`,i)),Object.freeze({id:'finish',address:'Finish address',lat:45.6,lon:-122.7})]);
test('insertion at every position keeps original endpoints, other visit order and inputs unchanged',()=>{
 const located=routePoints(3),order=Object.freeze([3,1,2]),stop=display('new',90),before=JSON.stringify({located,order,stop});
 for(let position=0;position<=order.length;position++){
  const result=insertRouteStop(located,order,stop,position),expected=order.map(i=>located[i]);expected.splice(position,0,stop);
  assert.deepEqual(result.points,[located[0],...expected,located.at(-1)]);assert.deepEqual(result.order,[1,2,3,4]);
  assert.equal(result.points[0],located[0]);assert.equal(result.points.at(-1),located.at(-1));assert.equal(result.points[position+1],stop);
 }
 assert.equal(JSON.stringify({located,order,stop}),before);
 const empty=insertRouteStop([located[0],located.at(-1)],[],stop,0);assert.deepEqual(empty.order,[1]);assert.deepEqual(empty.points,[located[0],stop,located.at(-1)]);
});
test('insertion preserves real exact and heuristic optimizer orders without rerunning optimization',()=>{
 for(const count of [5,15]){
  const located=routePoints(count),size=located.length,matrix=Array.from({length:size},(_,i)=>Array.from({length:size},(_,j)=>i===j?0:Math.abs(i-j)*3+1+(i*17+j*11)%9));
  const planned=optimize(matrix),before=planned.order.map(i=>located[i].id),stop=display('new',90),position=2;
  assert.equal(planned.method,count<=12?'exact':'heuristic');
  const result=insertRouteStop(located,planned.order,stop,position);
  assert.deepEqual(result.order.map(i=>result.points[i].id).filter(id=>id!=='new'),before);
  assert.equal(result.points[position+1],stop);assert.equal(result.points[0],located[0]);assert.equal(result.points.at(-1),located.at(-1));
 }
});
test('insertion compacts budgeted routes and can add a point excluded from their order',()=>{
 const located=routePoints(5),stop=located[2],result=insertRouteStop(located,[5,1,4],stop,1);
 assert.deepEqual(result.points.map(p=>p.id),['start','stop-4','stop-1','stop-0','stop-3','finish']);assert.deepEqual(result.order,[1,2,3,4]);
 assert.equal(located.length,7);
});
test('insertion rejects routed display duplicates while allowing a display at an endpoint address',()=>{
 const located=routePoints(3),order=[3,1],stop=display('new',90);
 assert.throws(()=>insertRouteStop(located,order,{...stop,id:located[1].id},0),/already in this drive/);
 assert.throws(()=>insertRouteStop(located,order,{...stop,address:'102   Example Road., Portland, OR'},0),/already in this drive/);
 const endpointMatch={...stop,address:located[0].address};assert.equal(insertRouteStop(located,order,endpointMatch,0).points[1],endpointMatch);
 const finishMatch={...stop,address:located.at(-1).address};assert.equal(insertRouteStop(located,order,finishMatch,2).points[3],finishMatch);
});
test('insertion allows exactly 68 displays and rejects more without counting excluded points',()=>{
 const located=routePoints(70),stop=display('new',90),order=Array.from({length:67},(_,i)=>i+1);
 const result=insertRouteStop(located,order,stop,67);assert.equal(result.order.length,68);assert.equal(result.points.length,70);
 assert.throws(()=>insertRouteStop(result.points,result.order,display('extra',91),0),/no more than 68/);
});
test('insertion rejects corrupt orders, positions, missing identity/address and invalid coordinates',()=>{
 const located=routePoints(3),stop=display('new',90);
 for(const order of [[0,1],[1,4],[1,1],[NaN],[1.5],null])assert.throws(()=>insertRouteStop(located,order,stop,0),/Invalid route/);
 for(const position of [-1,4,1.5,NaN,Infinity,'1',null])assert.throws(()=>insertRouteStop(located,[1,2,3],stop,position),/insertion position/);
 for(const changed of [{id:''},{id:4},{address:''},{address:'... #,'},{address:123},{lat:91},{lon:-181},{lat:'45.5'},{lon:NaN}])assert.throws(()=>insertRouteStop(located,[1,2],{...stop,...changed},0),/saved display/);
 assert.throws(()=>insertRouteStop(located,[1,2],null,0),/saved display/);
 assert.throws(()=>insertRouteStop([{...located[0],lat:Infinity},...located.slice(1)],[1,2],stop,0),/existing drive/);
 assert.throws(()=>insertRouteStop([located[0],{...located[1],lon:181},...located.slice(2)],[1,2],stop,0),/existing drive/);
});
