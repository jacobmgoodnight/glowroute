/** Portable public directory logic: no external SDK, no account, no automatic overwrites. */
import {canonicalAddress} from './importer.mjs';
const holidays=new Set(['Halloween','Christmas','Other']);
const https=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
const optionalText=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
const publicFields=e=>({catalogReviewedAt:e.reviewedAt||'',sourceVerification:e.verification||'source-listed',catalogNotes:e.notes||'',catalogDescription:e.description||'',catalogOperatingDates:e.operatingDates||'',catalogHours:e.hours||'',catalogLocality:e.locality||''});
export function validateDirectory(raw){
 if(!raw||raw.schemaVersion!==1||!Array.isArray(raw.entries)||raw.entries.length>500)throw Error('Unsupported directory format');
 const seen=new Set(),addresses=new Set(),entries=[];
 for(const item of raw.entries){
  const id=String(item?.id||'').trim(),name=String(item?.name||'').trim(),address=String(item?.address||'').trim();
  const holiday=String(item?.holiday||''),year=Number(item?.year),sourceUrl=String(item?.sourceUrl||'');
  if(!/^[a-z0-9][a-z0-9-]{3,95}$/.test(id)||seen.has(id))throw Error('Invalid or duplicate directory ID');
  if(!name||name.length>110||!/\b\d{1,6}\s+\S+/.test(address)||address.length>220)throw Error(`Invalid address/name for ${id}`);
  if(!holidays.has(holiday)||!Number.isInteger(year)||year<2000||year>2100)throw Error(`Invalid holiday/year for ${id}`);
  if(!https(sourceUrl))throw Error(`Missing valid public source URL for ${id}`);
  const addressKey=`${holiday}|${year}|${canonicalAddress(address)}`;
  if(addresses.has(addressKey))throw Error(`Duplicate address ${address}`);
  seen.add(id);addresses.add(addressKey);
  entries.push({id,name,address,holiday,year,sourceName:String(item.sourceName||'Public listing').slice(0,90),sourceUrl,
   reviewedAt:optionalText(item.reviewedAt,20),verification:optionalText(item.verification,40)||'source-listed',notes:optionalText(item.notes,300),
   locality:optionalText(item.locality,100),description:optionalText(item.description,300),operatingDates:optionalText(item.operatingDates,160),hours:optionalText(item.hours,160)});
 }
 return {schemaVersion:1,updatedAt:raw.updatedAt||'',entries};
}
export function compareCatalogToProject(project,entries){
 const same=entries.filter(entry=>entry.holiday===project.holiday&&entry.year===project.year);
 return same.map(entry=>{
  const match=project.state.displays.find(d=>d.catalogId===entry.id)||project.state.displays.find(d=>canonicalAddress(d.address)===canonicalAddress(entry.address));
  if(!match)return {entry,existingId:null,kind:'new'};
  const different=(match.catalogName??match.name)!==entry.name||canonicalAddress(match.catalogAddress??match.address)!==canonicalAddress(entry.address)||match.sourceUrl!==entry.sourceUrl||match.sourceName!==entry.sourceName||Object.entries(publicFields(entry)).some(([key,value])=>(match[key]||'')!==value);
  return {entry,existingId:match.id,kind:different?'update':'already'};
 });
}
export function applyCatalogToProject(project,actions,{maxStops=70}={}){
 const next=project.state.displays.map(d=>({...d})),selected=new Set(project.state.selected||[]);let added=0,updated=0;
 for(const a of actions){
  if(!a.include)continue;
  const e=a.entry;
  if(!e)continue;
  const matchIndex=next.findIndex(d=>d.catalogId===e.id||canonicalAddress(d.address)===canonicalAddress(e.address));
  const fields={catalogId:e.id,catalogName:e.name,catalogAddress:e.address,sourceName:e.sourceName,sourceUrl:e.sourceUrl,sourceYear:e.year,...publicFields(e),needsSeasonCheck:true};
  if(matchIndex>=0){
   const old=next[matchIndex];const addressChanged=!!a.replaceDetails&&canonicalAddress(old.address)!==canonicalAddress(e.address);
   const seasonStillVerified=!addressChanged&&old.seasonCheckedYear===e.year&&old.needsSeasonCheck===false;
   const merged={...old,...fields,needsSeasonCheck:!seasonStillVerified,
    ...(a.replaceDetails?{name:e.name,address:e.address}:{}),
    ...(addressChanged?{lat:null,lon:null,approved:false,geoSource:null,seasonCheckedYear:null}:{})};
   next[matchIndex]=merged;
   if(a.kind!=='already')updated++;
  }else{
   if(next.length>=maxStops)throw Error(`Maximum of ${maxStops} displays in one project`);
   const id=`catalog-${e.id}`;
   next.push({...fields,id,name:e.name,address:e.address,featured:0,score:3,lat:null,lon:null,approved:false,visited:false,visitNotes:''});
   selected.add(id);added++;
  }
 }
 return {displays:next,selected:[...selected],added,updated};
}

/** Count resulting records, rather than treating matched updates as additions. */
export function catalogFits(project, actions, maxStops=70){
 try {applyCatalogToProject(project,actions,{maxStops});return true;}catch{return false;}
}

export function directorySeason(entry,currentYear=new Date().getFullYear()){
 const season=`${entry.holiday} ${entry.year}`;
 if(entry.year<currentYear)return {kind:'archive',label:`Archive · ${season}`,detail:'Historical source reference. Not confirmed for the current season.'};
 if(entry.year>currentYear)return {kind:'future',label:`Future season · ${season}`,detail:'Future-season source reference. Check the source before planning a visit.'};
 return {kind:'current',label:`${season} · Check operation`,detail:'A current-year listing is not confirmation that the display is operating.'};
}

export function directoryMatches(entries,{query='',holiday='All',year='All',sort='locality'}={}){
 const q=String(query).trim().toLowerCase();
 const locality=e=>e.locality||e.address.split(',').slice(1).join(',').trim();
 const compare=(a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:'base'});
 return entries.filter(e=>(holiday==='All'||e.holiday===holiday)&&(year==='All'||String(e.year)===String(year))&&(!q||[e.name,e.address,e.sourceName,e.locality,e.description,e.notes].join(' ').toLowerCase().includes(q)))
  .sort((a,b)=>(sort==='year'?b.year-a.year:sort==='reviewed'?compare(b.reviewedAt,a.reviewedAt):sort==='name'?compare(a.name,b.name):compare(locality(a),locality(b)))||b.year-a.year||compare(a.name,b.name)||compare(a.address,b.address)||compare(a.id,b.id));
}
export function makeSubmissionUrl(details){
 const removal=details.type==='removal',type=removal?'Removal request':details.type==='correction'?'Correction':'Display suggestion';
 const holiday=holidays.has(details.holiday)?details.holiday:'Halloween';
 const safe=s=>String(s||'').replace(/[\x00-\x1f]/g,' ').slice(0,300);
 const title=`[Directory] ${type}: ${safe(details.name).slice(0,70)}`;
 const body=`### ${removal?'Removal request':'Proposed public display'}\nDisplay name or catalog ID: ${safe(details.name)}\nHoliday: ${holiday}\nSeason year: ${Number(details.year)||''}${removal?'':`\nPublic address: ${safe(details.address)}\nPublic source link: ${safe(details.sourceUrl)}`}\n\n### Permission and verification\n${removal?'Please review this existing listing for removal. No address or contact details are needed.':details.permission==='owner'?'I own/operate this display or have permission to publish its address.':'This is only a suggestion from an existing public listing; please verify before publishing.'}\n\n### Notes / operating dates\n${safe(details.notes)}\n\nThis suggestion is not automatically published. A maintainer must independently review it. Do not include personal contact information.`;
 return `https://github.com/jacobmgoodnight/glowroute/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
