import test from 'node:test';
import assert from 'node:assert/strict';
import {panelBounds,panelWidth} from '../layout.mjs';

test('desktop pane sizes leave a usable planner and map',()=>{
 for(const viewport of [851,900,1024,1366,1920,3840]){
  const {min,max}=panelBounds(viewport);
  assert.equal(min,355);assert(max<=viewport*.65);
  assert(viewport-max-24>=320);
  assert.equal(panelWidth(-100,viewport),min);
  assert.equal(panelWidth(10000,viewport),max);
 }
});
test('default and remembered widths clamp without changing the preference',()=>{
 assert.equal(panelWidth(null,1366),490);
 assert.equal(panelWidth(NaN,1366),490);
 assert.equal(panelWidth(700,900),556);
 assert.equal(panelWidth(700,1366),700);
 assert.equal(panelWidth(550.4,1366),550);
});
test('invalid or unavailable layout widths never produce nonfinite dimensions',()=>{
 for(const width of [0,-1,NaN,Infinity,undefined]){
  assert.deepEqual(panelBounds(width),{min:355,max:355});
  assert.equal(panelWidth(null,width),355);
 }
});
