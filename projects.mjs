/** Local-only project snapshots. Each holiday/year/drive owns its own stops and selection. */
export const PROJECT_STORE='glowroute:projects:v2';
const HOLIDAYS=['Halloween','Christmas','Other'];
export function cleanYear(value){const n=Number(value);return Number.isInteger(n)&&n>=2000&&n<=2100?n:2026;}
export function normalizeHoliday(value){return HOLIDAYS.includes(value)?value:'Other';}
export function snapshotState(state){return {...state,selected:[...(state.selected||[])],displays:(state.displays||[]).map(d=>({...d})),endpoints:{...(state.endpoints||{})},cache:{...(state.cache||{})}};}
export function makeProject({name='',holiday='Halloween',year=2026,displays=[],selected=[],start='',end='',mode='duration',preset='custom',endpoints={},cache={},id=null,sourceYear=null}={}){
 const season=normalizeHoliday(holiday),yr=cleanYear(year);
 return {id:id||`project-${Date.now()}-${Math.random().toString(36).slice(2,9)}`,name:String(name||`${season} ${yr} Drive`).trim().slice(0,90),holiday:season,year:yr,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state:snapshotState({displays,selected,start,end,mode,preset,endpoints,cache}),sourceYear:sourceYear??null};
}
export function cloneProject(previous,{year,name,holiday}={}){
 const newYear=cleanYear(year??previous.year),newHoliday=normalizeHoliday(holiday??previous.holiday);
 const cloned=makeProject({...previous.state,year:newYear,holiday:newHoliday,name:name||`${newHoliday} ${newYear} Drive`,sourceYear:previous.year});
 // Require seasonal reconfirmation without discarding separately verified map coordinates.
 cloned.state.displays=cloned.state.displays.map(d=>({...d,needsSeasonCheck:true,seasonCheckedYear:null,visited:false,visitedAt:null}));
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
