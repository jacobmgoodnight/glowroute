/** Local-only project snapshots. Each holiday/year/drive owns its own stops and selection. */
import {validCoordinates} from './routing.mjs';
export const PROJECT_STORE='glowroute:projects:v2';
const HOLIDAYS=['Halloween','Christmas','Other'];
export function cleanYear(value){const n=Number(value);return Number.isInteger(n)&&n>=2000&&n<=2100?n:2026;}
export function normalizeHoliday(value){return HOLIDAYS.includes(value)?value:'Other';}
export function snapshotState(state){return {...state,selected:[...(state.selected||[])],displays:(state.displays||[]).map(d=>({...d})),endpoints:{...(state.endpoints||{})},cache:{...(state.cache||{})}};}
export function makeProject({name='',holiday='Halloween',year=2026,displays=[],selected=[],start='',end='',mode='duration',preset='custom',budgetEnabled=false,budgetMinutes=90,viewMinutes=4,departure='',departureZone='',departureFold='earlier',endpoints={},cache={},id=null,sourceYear=null}={}){
 const season=normalizeHoliday(holiday),yr=cleanYear(year);
 return {id:id||`project-${Date.now()}-${Math.random().toString(36).slice(2,9)}`,name:String(name||`${season} ${yr} Drive`).trim().slice(0,90),holiday:season,year:yr,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state:snapshotState({displays,selected,start,end,mode,preset,budgetEnabled,budgetMinutes,viewMinutes,departure,departureZone,departureFold,endpoints,cache}),sourceYear:sourceYear??null};
}
export function cloneProject(previous,{year,name,holiday}={}){
 const newYear=cleanYear(year??previous.year),newHoliday=normalizeHoliday(holiday??previous.holiday);
 const cloned=makeProject({...previous.state,year:newYear,holiday:newHoliday,name:name||`${newHoliday} ${newYear} Drive`,sourceYear:previous.year});
 // Require seasonal reconfirmation without discarding separately verified map coordinates.
 cloned.state.displays=cloned.state.displays.map(d=>({...d,needsSeasonCheck:true,seasonCheckedYear:null,visited:false,visitedAt:null,skipped:false}));
 if(newYear!==previous.year||newHoliday!==previous.holiday)cloned.state.departure='';
 return cloned;
}
export function revivePortfolio(raw,legacy,seedState){
 if(raw&&Array.isArray(raw.projects)&&raw.projects.length){
  const projects=raw.projects.filter(p=>p?.id&&p?.state&&Array.isArray(p.state.displays)&&p.state.displays.length<=70).slice(0,40);
  if(projects.length)return {projects,activeId:projects.some(p=>p.id===raw.activeId)?raw.activeId:projects[0].id};
 }
 const old=legacy&&Array.isArray(legacy.displays)&&legacy.displays.length<=70?legacy:seedState;
 const first=makeProject({...old,name:'Irvington Halloween 2026',year:2026,holiday:'Halloween'});
 return {projects:[first],activeId:first.id};
}
export function uniqueProjectName(name,projects){const base=String(name||'My Holiday Drive').trim().slice(0,80)||'My Holiday Drive';let test=base,i=2;while(projects.some(p=>p.name.toLowerCase()===test.toLowerCase()))test=`${base} (${i++})`;return test;}

/** Validate the whole backup before replacing anything; never fall back to sample data. */
export function validatePortfolio(data, {backup=false}={}) {
 const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 const text=(value,max)=>typeof value==='string'&&value.length<=max;
 if(!object(data)||(backup&&data.version!==2)||!Array.isArray(data.projects)||!data.projects.length||data.projects.length>40)throw Error('Not a valid GlowRoute v2 project backup.');
 const ids=new Set();
 for(const p of data.projects){
  if(!object(p)||!text(p.id,150)||!p.id||ids.has(p.id)||!text(p.name,90)||!p.name.trim()||!HOLIDAYS.includes(p.holiday)||!Number.isInteger(p.year)||p.year<2000||p.year>2100||!object(p.state))throw Error('A project has invalid or duplicate metadata.');
  ids.add(p.id);const s=p.state;
  if(!Array.isArray(s.displays)||s.displays.length>70||!Array.isArray(s.selected)||s.selected.some(id=>!text(id,150))||!text(s.start,250)||!text(s.end,250))throw Error(`Invalid stops or endpoints in ${p.name}.`);
  const displayIds=new Set();
  for(const d of s.displays){
   if(!object(d)||!text(d.id,150)||!d.id||displayIds.has(d.id)||!text(d.name,110)||!d.name.trim()||!text(d.address,220)||!d.address.trim()||((d.lat!=null||d.lon!=null)&&!validCoordinates(d)))throw Error(`Invalid or duplicate display in ${p.name}.`);
   displayIds.add(d.id);
  }
  if(s.endpoints!==undefined&&!object(s.endpoints)||s.cache!==undefined&&!object(s.cache))throw Error(`Invalid map data in ${p.name}.`);
  for(const point of Object.values(s.endpoints||{}))if(!validCoordinates(point)||!text(point.address,250))throw Error(`Invalid saved endpoint in ${p.name}.`);
  for(const point of Object.values(s.cache||{}))if(!validCoordinates(point))throw Error(`Invalid saved geocode in ${p.name}.`);
 }
 return {projects:data.projects,activeId:ids.has(data.activeId)?data.activeId:data.projects[0].id};
}

export function presetSelection(displays, value, topFive=[]) {
 return new Set(displays.filter(d=>d.mustSee || value==='all' || value==='top10'&&d.featured || value==='top5'&&topFive.includes(d.id)).map(d=>d.id));
}
