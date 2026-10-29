import {buildSchedule,departureInstants} from './schedule.mjs';
import {validZone} from './display-info.mjs';
const $=id=>document.getElementById(id);
export function renderSchedule(state,route,points,matrix,project){
 const panel=$('schedule-panel'),summary=$('schedule-summary'),list=$('schedule-list');list.replaceChildren();
 panel.classList.toggle('hidden',!state.departure||!route);if(!state.departure||!route)return;
 try{
  const zone=state.departureZone||Intl.DateTimeFormat().resolvedOptions().timeZone;
  const choices=departureInstants(state.departure,zone),departure=route.liveDeparture??choices[state.departureFold==='later'?choices.length-1:0];
  const geometry=route.geometry?.order.join(',')===route.order.join(',')?route.geometry:null;
  const schedule=!route.approx&&buildSchedule({points,order:route.order,durations:matrix?.durations,legDurations:geometry?.legDurations,departure,defaultMinutes:Number(state.viewMinutes??4),year:project.year,holiday:project.holiday});
  if(!schedule){summary.textContent='Arrival estimates need road routing. Rough geographic ordering cannot provide driving times.';return;}
  const format=(time,zone)=>new Intl.DateTimeFormat(undefined,{timeZone:zone,month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(time);
  summary.textContent=`${route.liveDeparture?'Remaining itinerary from the latest live reroute time · ':''}${Math.round(schedule.drivingSeconds/60)} min driving + ${Math.round(schedule.viewingSeconds/60)} min viewing · Finish ${format(schedule.finish,zone)} · ${schedule.basis}${!route.liveDeparture&&choices.length>1?` · Repeated departure time: ${state.departureFold==='later'?'second':'first'} occurrence`:''}. Estimates exclude traffic, parking and delays.`;
  for(const row of schedule.rows){
   const li=document.createElement('li');li.className=row.state==='expected-closed'?'schedule-warning':'';
   const title=document.createElement('strong');title.textContent=row.display.name;
   const times=document.createElement('p'),hours=document.createElement('p');
   const localZone=validZone(row.display.schedule?.timezone)?row.display.schedule.timezone:zone;
   times.textContent=`Arrive ${format(row.arrival,localZone)} · Leave ${format(row.departure,localZone)} · ${row.viewingSeconds/60} min viewing`;
   hours.textContent=row.detail;li.append(title,times,hours);list.append(li);
  }
 }catch(e){summary.textContent=e.message;}
}
