/** Optional public facts. Old records stay valid; missing values stay unknown. */
export const DISPLAY_TYPES=['Residential yard display','Synchronized light show','Home haunt','Business','Attraction','Unknown'];
export const COSTS=['Free','Paid','Donation optional','Unknown'];
export const ACCESS=['Drive-by','Walk-through','Both','Unknown'];
export const SCARE=['Family-friendly','Mild','Scary','Unknown'];
export function safeSourceUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
export const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
export function validZone(value){try{if(typeof value!=='string'||!value)return false;new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}}
export function sourceReferences(raw){
 if(!Array.isArray(raw))return [];
 const out=[];
 for(const s of raw.slice(0,20)){
  const url=safeSourceUrl(s?.url);if(!url)continue;
  const ref={name:String(s.name||'Source').slice(0,90),url,recordId:String(s.recordId||'').slice(0,150)};
  if(!out.some(x=>x.url===ref.url&&x.recordId===ref.recordId))out.push(ref);
 }
 return out;
}
export function displayInfo(raw={}){
 const out={};
 for(const [key,values] of Object.entries({type:DISPLAY_TYPES,cost:COSTS,access:ACCESS,scare:SCARE}))if(values.includes(raw[key]))out[key]=raw[key];
 if(typeof raw.music==='boolean')out.music=raw.music;
 for(const key of ['fm','parking','accessibility'])if(typeof raw[key]==='string')out[key]=raw[key].trim().slice(0,key==='fm'?30:300);
 for(const key of ['viewingMinutes','viewingOverride'])if(typeof raw[key]==='number'&&Number.isFinite(raw[key])&&raw[key]>=0&&raw[key]<=180)out[key]=raw[key];
 for(const key of ['lastImported','lastConfirmed'])if(validDate(raw[key]))out[key]=raw[key];
 if(Array.isArray(raw.sources))out.sources=sourceReferences(raw.sources);
 if(Array.isArray(raw.conflicts))out.conflicts=raw.conflicts.filter(s=>typeof s==='string').slice(0,20).map(s=>s.slice(0,300));
 if(['street','city','unknown'].includes(raw.locationPrecision))out.locationPrecision=raw.locationPrecision;
 const s=raw.schedule||(Array.isArray(raw.hours)?raw:null);
 if(s){
  const hours=Array.isArray(s.hours)?s.hours.slice(0,14).filter(h=>h&&Array.isArray(h.days)&&h.days.length&&h.days.every(d=>Number.isInteger(d)&&d>=0&&d<=6)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(h.open)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(h.close)).map(h=>({days:[...new Set(h.days)],open:h.open,close:h.close})):[];
  const startDate=validDate(s.startDate)?s.startDate:null,endDate=validDate(s.endDate)?s.endDate:null;
  // A partially malformed schedule must never turn into a claim that a day is closed.
  if(hours.length&&hours.length===s.hours.length&&startDate&&endDate&&startDate<=endDate&&validZone(s.timezone))out.schedule={hours,startDate,endDate,timezone:s.timezone};
 }
 return out;
}
export function viewingMinutes(display,defaultMinutes=4){
 const d=displayInfo(display);return d.viewingOverride??d.viewingMinutes??defaultMinutes;
}
export function informationLines(raw){
 const d=displayInfo(raw);
 return [d.type,d.cost,d.access,d.scare,d.music===true?'Synchronized music':d.music===false?'No synchronized music':'',d.fm&&`FM ${d.fm}`,d.parking&&`Parking: ${d.parking}`,d.accessibility&&`Accessibility: ${d.accessibility}`,d.viewingMinutes!==undefined&&`Suggested viewing: ${d.viewingMinutes} min`,d.schedule&&`${d.schedule.startDate}–${d.schedule.endDate} · ${d.schedule.timezone} · ${d.schedule.hours.map(h=>h.days.map(i=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][i]).join('/')+' '+h.open+'–'+h.close).join('; ')}`,d.lastImported&&`Imported ${d.lastImported} (not operating confirmation)`,d.lastConfirmed&&`Confirmation recorded ${d.lastConfirmed}; applies to its original season only`,...(d.conflicts||[]).map(s=>`Source warning: ${s}`)].filter(Boolean);
}
