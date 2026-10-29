/** Client-side imports only: no scraping or third-party requests. */
import {validCoordinates} from './routing.mjs';
import {displayInfo} from './display-info.mjs';
const STREET = /\b\d{1,6}\s+(?:(?:N|S|E|W|NE|NW|SE|SW)\.?\s+)?(?:[A-Za-z0-9'’.\-]+\s+){0,7}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Circle|Cir|Parkway|Pkwy|Terrace|Ter|Place|Pl)\.?\b/i;
const STREET_END = /(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Circle|Cir|Parkway|Pkwy|Terrace|Ter|Place|Pl)\.?$/i;
const headerTags=['address','street','location','name','display','city','state','zip','postal'];
export function canonicalAddress(address){return String(address||'').toLowerCase().replace(/\b(north|n)\b/g,'n').replace(/\b(south|s)\b/g,'s').replace(/\b(east|e)\b/g,'e').replace(/\b(west|w)\b/g,'w').replace(/\b(street|st)\b/g,'st').replace(/\b(avenue|ave)\b/g,'ave').replace(/\b(road|rd)\b/g,'rd').replace(/\b(lane|ln)\b/g,'ln').replace(/\b(drive|dr)\b/g,'dr').replace(/\b(boulevard|blvd)\b/g,'blvd').replace(/[.,#]/g,'').replace(/\s+/g,' ').trim();}
function clean(value){return String(value??'').replace(/[\u200b\u200c\u200d]/g,'').trim().replace(/^["'`\s•*–—-]+|["'`\s;|–—-]+$/g,'').trim();}
function normalizeAddress(value,defaultCity){
 let address=clean(value).replace(/\s+/g,' ').replace(/\s+\(.*?\)$/,'').trim();
 // Only append an explicitly selected area to a bare street. Preserve all cities/countries.
 if(STREET_END.test(address)&&clean(defaultCity))address+=', '+clean(defaultCity);
 return address.slice(0,220);
}
export function parseDelimited(text,delimiter){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];if(c==='"'){
   if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;
  }else if(c===delimiter&&!quoted){row.push(cell);cell='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
 return rows;
}
function normalizedHeading(head){return head.toLowerCase().replace(/[^a-z0-9]+/g,'');}
function toRecord(name,address,defaultCity,lat=null,lon=null,metadata={}){
 if(!STREET.test(address))return null;
 const normalized=normalizeAddress(address,defaultCity);
 const label=clean(name).slice(0,110)||clean(address).slice(0,110);
 const valid=Number.isFinite(lat)&&Math.abs(lat)<=90&&Number.isFinite(lon)&&Math.abs(lon)<=180;
 return {name:label,address:normalized,lat:valid?lat:null,lon:valid?lon:null,...(Object.keys(metadata).length?{metadata}:{})};
}
function rowRecords(rows,defaultCity,report){
 if(!rows.length)return [];
 const head=rows[0].map(normalizedHeading);
 const column=k=>head.findIndex(x=>k.some(v=>x===v||x.startsWith(v)));
 const ai=column(['address','streetaddress','street','location','formattedaddress','fulladdress']);
 const ni=column(['displayname','display','name','title','housename']);
 const ci=column(['city','town']);const si=column(['state','statecode']);const zi=column(['zip','postal']);
 const hasHeader=ai>=0 || (ni>=0&&head.some(h=>headerTags.some(tag=>h.includes(tag))));
 let records=[];
 for(const [rowIndex,row] of rows.entries()){
  if(hasHeader&&rowIndex===0)continue;
  const values=row.map(clean);if(!values.some(Boolean))continue;
  let name='',address='';
  if(hasHeader){address=values[ai]||'';name=values[ni]||'';
   if(address&&ci>=0&&values[ci]&&!address.toLowerCase().includes(values[ci].toLowerCase()))address+=', '+values[ci];
   if(address&&si>=0&&values[si]&&!/\b[A-Z]{2}\b\s*\d{5}?$/i.test(address))address+=', '+values[si];
   if(address&&zi>=0&&values[zi]&&!/\d{5}/.test(address))address+=' '+values[zi];
  }else{
   const i=values.findIndex(v=>STREET.test(v));if(i<0){report(rowIndex+1,'No recognizable street address.',values.join(' | '));continue;}
   address=values[i];name=values.find((v,j)=>j!==i&&v.length<90&&!STREET.test(v))||'';
  }
  const record=toRecord(name,address,defaultCity);if(record)records.push(record);else report(rowIndex+1,'No recognizable street address.',address||values.join(' | '));
 }
 return records;
}
function textRecords(input,defaultCity,report){
 const records=[];let previousLabel='';
 for(const [rowIndex,raw] of input.split(/\r?\n/).entries()){
  const line=clean(raw.replace(/^\s*\d+[.)]\s+/,''));if(!line)continue;
  const match=STREET.exec(line);
  if(!match){if(/\b\d{1,6}\s+\S+/.test(line))report(rowIndex+1,'No recognizable street address; this line was ignored.',line);if(line.length<95&&!/^(?:https?:|posted by|photo|learn more|click here|directions)/i.test(line))previousLabel=line;continue;}
  const prefix=clean(line.slice(0,match.index).replace(/[\t|:,\-–—]+$/,''));
  const tail=line.slice(match.index);
  // Cut descriptions that follow an em dash/pipe/tab after the postal address.
  const address=clean(tail.split(/\s+[|–—]\s+|\t/)[0]);
  const record=toRecord(prefix||previousLabel,address,defaultCity);
  if(record)records.push(record);previousLabel='';
 }
 return records;
}
/** Source can be a pasted list/table, a CSV/TSV file, or GlowRoute JSON export. */
export function parseImportedStops(raw,{defaultCity='Indianapolis, IN 46219',filename=''}={}){
 const text=String(raw||'').trim();if(!text)return {records:[],duplicates:0,issues:['Paste a list of addresses or choose a file.']};
 if(text.length>400_000)return {records:[],duplicates:0,issues:['Import too large (400 KB max).']};
 const issues=[],diagnostics=[];let records=[];
 const report=(row,message,value)=>diagnostics.push({row,message,preview:String(value||'').slice(0,160)});
 if(filename.toLowerCase().endsWith('.json')||/^[\[{]/.test(text)){
  try{
   const parsed=JSON.parse(text);
   const items=Array.isArray(parsed)?parsed:parsed?.displays;
   if(!Array.isArray(items))throw Error('Expected an array or an object with a displays array');
   records=items.flatMap((d,i)=>{
    if(!d||typeof d!=='object'||Array.isArray(d)){report(i+1,'Expected a display object.','');return [];}
    const metadata=importMetadata(d);
    if(Number.isInteger(d.year)&&d.year>=2000&&d.year<=2100&&metadata.sourceYear===undefined)metadata.sourceYear=d.year;
    if(['Halloween','Christmas','Other'].includes(d.season)&&metadata.sourceHoliday===undefined)metadata.sourceHoliday=d.season;
    if(metadata.sources?.length){metadata.sourceName??=metadata.sources[0].name;metadata.sourceUrl??=metadata.sources[0].url;}
    if(Array.isArray(parsed.selected)&&typeof d.id==='string')metadata.selected=parsed.selected.includes(d.id);
    const record=toRecord(d.name||d.title,d.address||d.location||'',defaultCity,d.lat,d.lon??d.lng,metadata);
    if(!record){report(i+1,'No recognizable street address.',d.address||d.location);return [];}
    if(['Halloween','Christmas','Other'].includes(parsed.project?.holiday)&&Number.isInteger(parsed.project?.year)){record.projectHoliday=parsed.project.holiday;record.projectYear=parsed.project.year;}
    else if(['Halloween','Christmas','Other'].includes(d.season)&&Number.isInteger(d.year)){record.projectHoliday=d.season;record.projectYear=d.year;}
    return [record];
   });
  }catch(e){return {records:[],duplicates:0,issues:['Could not parse JSON: '+e.message]};}
 }else{
  const first=text.split(/\r?\n/)[0];
  const delimiter=filename.toLowerCase().endsWith('.tsv')||first.includes('\t')?'\t':',';
  const headings=parseDelimited(first,delimiter)[0].map(normalizedHeading);
  const looksTabular=headings.some(h=>['address','streetaddress','street','location','formattedaddress','fulladdress'].includes(h))&&first.includes(delimiter);
  if(looksTabular||filename.toLowerCase().endsWith('.csv')||filename.toLowerCase().endsWith('.tsv')){
   records=rowRecords(parseDelimited(text,delimiter),defaultCity,report);
   if(!records.length&&!filename.toLowerCase().endsWith('.csv')){diagnostics.length=0;records=textRecords(text,defaultCity,report);}
  }else records=textRecords(text,defaultCity,report);
 }
 const found=new Set(),unique=[];let duplicates=0;
 for(const r of records){const key=canonicalAddress(r.address);if(found.has(key)){duplicates++;continue;}found.add(key);unique.push(r);}
 if(!unique.length)issues.push('No recognizable street addresses. Try a line per address or a CSV with an Address column.');
 if(unique.length>500)issues.push('Review up to 500 unique addresses at once. Split this list into smaller files.');
 return {records:unique.slice(0,500),duplicates,issues,diagnostics};
}

/** Explicit allowlist: imported JSON cannot inject IDs, executable links or arbitrary state. */
export function importMetadata(raw){
 if(!raw||typeof raw!=='object')return {};
 const safe=displayInfo(raw);
 if(['Halloween','Christmas','Other'].includes(raw.sourceHoliday))safe.sourceHoliday=raw.sourceHoliday;
 for(const key of ['favorite','mustSee','visited','skipped','approved','needsSeasonCheck','selected'])if(typeof raw[key]==='boolean')safe[key]=raw[key];
 if(Number.isInteger(raw.rating)&&raw.rating>=1&&raw.rating<=5)safe.rating=raw.rating;
 if(Number.isFinite(raw.score)&&raw.score>=0&&raw.score<=100)safe.score=raw.score;
 if(typeof raw.featured==='boolean'||raw.featured===0||raw.featured===1)safe.featured=raw.featured;
 for(const key of ['sourceYear','seasonCheckedYear'])if(Number.isInteger(raw[key])&&raw[key]>=2000&&raw[key]<=2100)safe[key]=raw[key];
 for(const [key,max] of Object.entries({visitNotes:500,sourceName:90,geoSource:60,catalogId:110,catalogName:110,catalogAddress:220,catalogReviewedAt:20,sourceVerification:40,catalogNotes:300,catalogDescription:300,catalogOperatingDates:160,catalogHours:160,catalogLocality:100}))if(typeof raw[key]==='string')safe[key]=raw[key].slice(0,max);
 if(typeof raw.visitedAt==='string'&&raw.visitedAt.length<=40&&Number.isFinite(Date.parse(raw.visitedAt)))safe.visitedAt=raw.visitedAt;
 if(typeof raw.sourceUrl==='string'&&raw.sourceUrl.length<=1000){try{const url=new URL(raw.sourceUrl);if(url.protocol==='https:'&&!url.username&&!url.password)safe.sourceUrl=url.href;}catch{}}
 return safe;
}

export function importReview(records,existing,mode='append'){
 const known=new Set(existing.map(d=>canonicalAddress(d.address))),seen=new Set();
 let existingCount=0,excluded=0,duplicate=false,invalid=false;
 const active=[];
 for(const record of records){
  const key=canonicalAddress(record.address),matched=mode!=='replace'&&known.has(key);
  if(matched){existingCount++;continue;}
  if(!record.include){excluded++;continue;}
  active.push(record);if(seen.has(key))duplicate=true;seen.add(key);
  if(!record.name.trim()||!/\b\d{1,6}\s+\S+/.test(record.address))invalid=true;
 }
 return {active,existingCount,excluded,duplicate,invalid,capacity:mode==='replace'?70:Math.max(0,70-existing.length)};
}

export function importedDisplay(record,{id,origin={},projectYear,projectHoliday}={}){
 const {selected,...metadata}=importMetadata(record.metadata);
 const verified=Number.isInteger(projectYear)&&['Halloween','Christmas','Other'].includes(projectHoliday)&&metadata.needsSeasonCheck===false&&metadata.seasonCheckedYear===projectYear&&record.projectYear===projectYear&&record.projectHoliday===projectHoliday;
 const coordinates=validCoordinates(record),manual=coordinates&&metadata.geoSource==='manual'&&metadata.approved===true;
 const display={score:3,featured:0,...metadata,id,name:record.name.trim(),address:record.address.trim(),lat:coordinates?record.lat:null,lon:coordinates?record.lon:null,
  geoSource:manual?'manual':coordinates?'imported':null,approved:manual,needsSeasonCheck:!verified,
  sourceName:metadata.sourceName||origin.name||'User import',sourceUrl:metadata.sourceUrl||origin.url||'',sourceYear:metadata.sourceYear||origin.year||null,sourceHoliday:metadata.sourceHoliday||origin.season||null};
 if(!verified)display.seasonCheckedYear=null;
 if(record.projectYear!==undefined&&(record.projectYear!==projectYear||record.projectHoliday!==projectHoliday)){display.visited=false;display.visitedAt=null;display.skipped=false;}
 return {display,selected:selected!==false||!!display.mustSee};
}
