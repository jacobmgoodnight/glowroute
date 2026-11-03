import test from 'node:test';
import assert from 'node:assert/strict';
import {editRouteStops,mapPinLocation} from '../route-edits.mjs';
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
