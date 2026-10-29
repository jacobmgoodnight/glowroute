/** Discovery snapshots are review input, never the curated directory. */
import {canonicalAddress} from './importer.mjs';
import {displayInfo,sourceReferences,validDate} from './display-info.mjs';
import {validCoordinates} from './routing.mjs';

function stableId(value){let hash=2166136261;for(const c of value)hash=Math.imul(hash^c.charCodeAt(0),16777619);return `discovery-${(hash>>>0).toString(16)}`;}
export function validateCandidates(raw){
 const legacy=Array.isArray(raw),items=legacy?raw:raw?.entries;
 if(!Array.isArray(items)||items.length>2000||!legacy&&(raw.schemaVersion!==1||raw.kind!=='review-candidates'||!validDate(String(raw.fetchedAt||'').slice(0,10))))throw Error('Expected a review-candidates snapshot or Holiday Display Explorer array (up to 2,000 records).');
 const entries=[],ids=new Set(),sourceIds=new Map();
 for(const item of items){
  if(!item||typeof item!=='object'||item.demo)throw Error('Invalid/demo discovery record');
  const name=String(item.name||'').trim(),holiday=item.holiday||item.season,year=item.year;
  const sources=sourceReferences(item.sources||[{name:item.sourceName,url:item.sourceUrl,recordId:item.id}]);
  if(!name||name.length>110||!['Halloween','Christmas','Other'].includes(holiday)||!Number.isInteger(year)||year<2000||year>2100||!sources.length||!item.id)throw Error('Discovery name, season, year, stable ID or attribution is missing.');
  const legacyUnlocated=legacy&&item.address&&!/\b\d{1,6}\s+\S+/.test(String(item.address));
  const suppliedPoint=validCoordinates({lat:item.lat,lon:item.lon??item.lng});
  const precision=item.locationPrecision==='city'||!item.address||legacyUnlocated?'city':item.locationPrecision==='street'&&suppliedPoint?'street':'unknown';
  const address=precision==='city'?'':String(item.address||'').trim();
  if(address&&(address.length>220||!/\b\d{1,6}\s+\S+/.test(address)))throw Error('Invalid discovery street address');
  const identity=`${new URL(sources[0].url).origin}|${sources[0].recordId||item.id}`;
  const recordKeys=new Set(sources.map(source=>`${new URL(source.url).origin}|${source.recordId||item.id}|${holiday}|${year}`));
  for(const key of recordKeys){if(sourceIds.has(key))throw Error('Duplicate source record ID; review upstream identity/address changes.');sourceIds.set(key,address);}
  const id=stableId(`${holiday}|${year}|${identity}`);if(ids.has(id))throw Error('Duplicate/colliding discovery ID');ids.add(id);
  const {viewingOverride,...facts}=displayInfo(item);
  const e={...facts,id,name,address,holiday,year,sourceYear:year,sourceName:sources[0].name,sourceUrl:sources[0].url,sources,
   locality:String(item.locality||item.town||'').slice(0,100),lastImported:validDate(item.lastImported)?item.lastImported:!legacy?String(raw.fetchedAt).slice(0,10):undefined,
   reviewedAt:'',verification:'source-listed',needsSeasonCheck:true,locationPrecision:precision,unreviewed:true,
   lat:null,lon:null,notes:legacyUnlocated?`Source location text: ${String(item.address).slice(0,220)}. No navigable street address supplied.`:'',conflicts:facts.conflicts||[]};
  if(precision==='street'&&validCoordinates({lat:item.lat,lon:item.lon??item.lng})){e.lat=item.lat;e.lon=item.lon??item.lng;}
  const match=address&&entries.find(d=>d.holiday===holiday&&d.year===year&&canonicalAddress(d.address)===canonicalAddress(address));
  if(match){
   const warnings=[...match.conflicts,...e.conflicts];
   for(const key of ['schedule','type','cost','access'])if(match[key]!==undefined&&e[key]!==undefined&&JSON.stringify(match[key])!==JSON.stringify(e[key]))warnings.push(`Conflicting ${key}; review original sources.`);
   match.sources=sourceReferences([...match.sources,...sources]);match.conflicts=[...new Set(warnings)];
  }else entries.push(e);
 }
 return {schemaVersion:1,entries,fetchedAt:legacy?'':raw.fetchedAt,legacy,duplicates:items.length-entries.length};
}
export function sourceFreshness(date,now=new Date()){
 if(!validDate(String(date||'').slice(0,10)))return 'Import date unknown';
 const days=Math.floor((now.getTime()-Date.parse(String(date).slice(0,10)))/86400000);
 return `${days<0?'Future-dated snapshot · ':days>30?'Stale snapshot · ':''}Imported ${String(date).slice(0,10)} · not an operating check`;
}
