import {subsetMatrix} from './tour.mjs';
import {validCoordinates} from './routing.mjs';

/** Leaflet world copies can report longitudes outside the canonical range. */
export function mapPinLocation({lat,lng}={}){
 if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
 const point={lat,lon:((lng+180)%360+360)%360-180};
 return validCoordinates(point)?point:null;
}

/** Edit an existing itinerary without optimizing away the user's chosen order. */
export function editRouteStops(points,order,matrix,{type,id,offset}){
 if(!Array.isArray(points)||points.length<2||!Array.isArray(order)||new Set(order).size!==order.length||order.some(i=>!Number.isInteger(i)||i<1||i>=points.length-1))throw Error('Invalid route stop order');
 const position=order.findIndex(i=>points[i].id===id);
 if(position<0)return null; // Start/finish and excluded displays cannot be edited here.
 if(type==='move'){
  if(offset!==-1&&offset!==1)return null;
  const target=position+offset;if(target<0||target>=order.length)return null;
  const next=order.slice();[next[position],next[target]]=[next[target],next[position]];
  return {points:points.slice(),order:next,matrix};
 }
 if(type!=='remove')return null;
 const kept=order.filter((_,i)=>i!==position);
 return {points:[points[0],...kept.map(i=>points[i]),points.at(-1)],order:kept.map((_,i)=>i+1),matrix:matrix?{distances:subsetMatrix(matrix.distances,kept),durations:matrix.durations?subsetMatrix(matrix.durations,kept):null}:null};
}
