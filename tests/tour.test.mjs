import test from 'node:test';
import assert from 'node:assert/strict';
import {selectWithinBudget,stopValue,roadOverlap,subsetMatrix,makeSharePayload,encodeShare,decodeShare} from '../tour.mjs';
const demo=(n,minutes=8)=>Array.from({length:n+2},(_,i)=>Array.from({length:n+2},(_,j)=>i===j?0:60*minutes));
test('budget limits viewing plus driving and prioritizes favorites',()=>{
 const displays=[{rating:5,favorite:true},{rating:1},{rating:4},{rating:2}];
 const selected=selectWithinBudget(demo(4),displays,44,4);
 assert.equal(selected.indices.length,3);
 assert.ok(selected.indices.includes(1));
 assert.ok(selected.totalSeconds<=44*60);
 assert.equal(selected.excluded,1);
});
test('budget enforces must-see locations and reports impossible budgets',()=>{
 const ds=[{mustSee:true,rating:1},{mustSee:true,rating:1},{rating:5}];
 const plan=selectWithinBudget(demo(3,8),ds,32,4);
 assert.ok(plan.indices.includes(1)&&plan.indices.includes(2));
 assert.equal(plan.indices.length,2);
 assert.throws(()=>selectWithinBudget(demo(3,8),ds,20,4),/must-see/i);
});
test('different stop indexes retain fixed start and end',()=>{
 const matrix=demo(5);const smaller=subsetMatrix(matrix,[2,5]);
 assert.equal(smaller.length,4);
 assert.equal(smaller[0][3],matrix[0][6]);
});
test('overlap includes a segment traversed in reverse and ignores non-overlaps',()=>{
 const route=roadOverlap([[0,0],[.001,0],[.001,.001],[.001,0],[.002,0]]);
 assert.ok(route.repeatedMeters>100&&route.repeatedMeters<130);
 assert.ok(route.percentage>0);
 assert.equal(roadOverlap([[0,0],[.001,0],[.002,0]]).repeatedMeters,0);
});
test('share redacts endpoints, user notes, rating and visit history by default',()=>{
 const stop={name:'👻 Spooky Place',address:'38 N Irvington Ave, Indianapolis, IN',visitNotes:'Private',visited:true,rating:5,lat:11};
 const p=makeSharePayload({name:'Halloween drive',holiday:'Halloween',year:2026},[stop],{start:'PRIVATE HOUSE',end:'PRIVATE HOUSE'});
 assert.equal(p.start,undefined);assert.equal(p.end,undefined);
 const round=decodeShare(encodeShare(p));assert.equal(round.stops[0].name,'👻 Spooky Place');
 assert.equal(round.stops[0].visitNotes,undefined);assert.equal(round.stops[0].lat,undefined);
 assert.ok(!JSON.stringify(round).includes('PRIVATE HOUSE'));
});
test('sharing endpoints is explicit and payload validation rejects tampering',()=>{
 const p=makeSharePayload({name:'X',holiday:'Christmas',year:2026},[{name:'A',address:'12 Main St'}],{includeEndpoints:true,start:'Start',end:'Home'});
 assert.equal(decodeShare(encodeShare(p)).end,'Home');
 assert.throws(()=>decodeShare('not=valid'),/Invalid|oversized/);
 assert.throws(()=>decodeShare(encodeShare({...p,stops:[]})),/invalid stops/);
});
