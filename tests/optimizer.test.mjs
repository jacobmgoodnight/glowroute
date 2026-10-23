import test from 'node:test';
import assert from 'node:assert/strict';
import {optimize,routeCost,splitLegs,googleDirections,appleDirections} from '../optimizer.mjs';

function brute(matrix){const n=matrix.length-2;const nodes=Array.from({length:n},(_,i)=>i+1);let best=Infinity;const go=(p,left)=>{if(!left.length){best=Math.min(best,routeCost(p,matrix));return;}for(let i=0;i<left.length;i++)go([...p,left[i]],left.filter((_,j)=>j!==i));};go([],nodes);return best;}
const asMatrix=(size)=>Array.from({length:size},(_,i)=>Array.from({length:size},(_,j)=>i===j?0:Math.abs(i-j)*3+1+((i*17+j*11)%9)));

test('asymmetric optimizer is exact for 8 displays',()=>{const m=asMatrix(10);const r=optimize(m);assert.equal(r.method,'exact');assert.equal(r.score,brute(m));assert.equal(r.order.length,8);assert.deepEqual(new Set(r.order),new Set([1,2,3,4,5,6,7,8]));});
test('handles roads with asymmetric travel costs and preserves endpoints',()=>{const m=[[0,1,9,9],[9,0,1,9],[9,9,0,1],[9,9,9,0]];const r=optimize(m);assert.deepEqual(r.order,[1,2]);assert.equal(r.score,3);});
test('heuristic route with 25 stops never worse than input order',()=>{const m=asMatrix(27);const r=optimize(m);assert.equal(r.method,'heuristic');assert.equal(r.order.length,25);assert.ok(r.score<=r.baseline);assert.equal(new Set(r.order).size,25);});
test('navigation legs are contiguous with no missing or duplicate new stops',()=>{const ordered=Array.from({length:26},(_,i)=>i+1);for(const max of [4,13]){const legs=splitLegs(ordered,max);assert.deepEqual(legs.flatMap(l=>l.stops),ordered);for(let i=1;i<legs.length;i++)assert.equal(legs[i].start,legs[i-1].stops.at(-1));assert.ok(legs.every(l=>l.stops.length<=max));}});
test('Google has 3 intermediates max with 4 new destinations; Apple has repeated waypoint keys',()=>{
 const google=googleDirections('Zoo',['a','b','c','d']);const gu=new URL(google);assert.equal(gu.searchParams.get('origin'),'Zoo');assert.equal(gu.searchParams.get('waypoints'),'a|b|c');assert.equal(gu.searchParams.get('destination'),'d');
 const apple=appleDirections('Zoo',['a','b','c']);const au=new URL(apple);assert.deepEqual(au.searchParams.getAll('waypoint'),['a','b']);assert.equal(au.searchParams.get('destination'),'c');
});
test('invalid/unreachable network rejected',()=>{assert.throws(()=>optimize([[0,1],[2]]));assert.throws(()=>optimize([[0,1,1],[1,0,Infinity],[1,1,0]]));});
