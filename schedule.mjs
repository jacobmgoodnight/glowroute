import {displayInfo,viewingMinutes,validZone} from './display-info.mjs';

function localParts(at,zone){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at).map(p=>[p.type,p.value]));
 return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};
}
/** Explicit IANA-zone wall time; detect both DST gaps and repeated times. */
export function departureInstants(value,zone){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)||!validZone(zone))throw Error('Enter a departure date/time and valid IANA timezone.');
 const wall=Date.parse(value+'Z');if(!Number.isFinite(wall)||new Date(wall).toISOString().slice(0,16)!==value)throw Error('Invalid departure date/time.');
 const offsets=new Set();
 for(let h=-36;h<=36;h+=6){const t=wall+h*3600000,p=localParts(t,zone);offsets.add(Date.parse(p.date+'T'+p.time+'Z')-t);}
 const values=[...offsets].map(offset=>wall-offset).filter(t=>{const p=localParts(t,zone);return p.date+'T'+p.time===value;}).sort((a,b)=>a-b);
 if(!values.length)throw Error('This local time does not exist because clocks change. Choose another departure time.');
 return values;
}
export function operatingStatus(raw,instant,{year,holiday}={}){
 const d=displayInfo(raw),s=d.schedule;
 if(!s||!Number.isFinite(new Date(instant).getTime()))return {state:'unknown',detail:'Hours unknown or incomplete'};
 const p=localParts(new Date(instant),s.timezone),weekday=new Date(p.date+'T12:00Z').getUTCDay();
 const prev=new Date(p.date+'T12:00Z');prev.setUTCDate(prev.getUTCDate()-1);const pd=prev.toISOString().slice(0,10);
 const inSeason=date=>date>=s.startDate&&date<=s.endDate;
 const open=s.hours.some(h=>inSeason(p.date)&&h.days.includes(weekday)&&(h.close>h.open?p.time>=h.open&&p.time<h.close:p.time>=h.open))||s.hours.some(h=>inSeason(pd)&&h.close<=h.open&&h.days.includes((weekday+6)%7)&&p.time<h.close);
 const localYear=Number(p.date.slice(0,4)),scheduleYear=Number(s.startDate.slice(0,4));
 if((year&&scheduleYear!==year)||((localYear<scheduleYear||localYear>Number(s.endDate.slice(0,4)))&&!inSeason(pd)))return {state:'unknown',detail:'Hours belong to another season'};
 if(raw.conflicts?.length)return {state:'unknown',detail:'Conflicting source information — check hours'};
 const confirmed=raw.needsSeasonCheck===false&&raw.seasonCheckedYear===(year||localYear)&&(!holiday||!raw.holiday||raw.holiday===holiday);
 return {state:open?'expected-open':'expected-closed',detail:`${open?'Within':'Outside'} listed hours${confirmed?'':' · unverified schedule'}`};
}
export function buildSchedule({points,order,durations,legDurations,departure,defaultMinutes=4,year,holiday}){
 if(!Number.isFinite(departure)||!durations)return null;
 const path=[0,...order,points.length-1];
 const legs=Array.isArray(legDurations)&&legDurations.length===path.length-1&&legDurations.every(n=>Number.isFinite(n)&&n>=0)?legDurations:path.slice(1).map((n,i)=>durations[path[i]][n]);
 if(!legs.every(n=>Number.isFinite(n)&&n>=0))return null;
 let clock=departure,viewingSeconds=0;const rows=[];
 for(let i=0;i<order.length;i++){
  const display=points[order[i]],viewing=viewingMinutes(display,defaultMinutes)*60;
  clock+=legs[i]*1000;const arrival=clock;clock+=viewing*1000;viewingSeconds+=viewing;
  rows.push({display,arrival,departure:clock,viewingSeconds:viewing,...operatingStatus(display,arrival,{year,holiday})});
 }
 clock+=legs.at(-1)*1000;
 return {rows,finish:clock,viewingSeconds,drivingSeconds:legs.reduce((a,b)=>a+b,0),basis:legs===legDurations?'mapped road legs':'road-matrix legs'};
}
