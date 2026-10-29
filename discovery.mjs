import {validCoordinates} from './routing.mjs';
import {canonicalAddress} from './importer.mjs';
import {stopValue} from './tour.mjs';
export function distanceMiles(a,b){
 if(!validCoordinates(a)||!validCoordinates(b))return null;
 const r=Math.PI/180,h=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lon-a.lon)*r/2)**2;
 return 3958.7613*2*Math.asin(Math.sqrt(Math.min(1,h)));
}
export const located=d=>validCoordinates(d)&&d.locationPrecision!=='city'&&d.locationPrecision!=='unknown';
export const routable=d=>located(d)&&!d.ambiguous&&(d.approved===true||d.locationPrecision==='street');
export function discover(entries,{center=null,radius=0,type='All',cost='All',access='All',family=false,music=false,sort='name'}={}){
 return entries.filter(d=>(type==='All'||d.type===type)&&(cost==='All'||d.cost===cost)&&(access==='All'||d.access===access||access==='Drive-by'&&d.access==='Both')&&(!family||d.scare==='Family-friendly')&&(!music||d.music===true))
  .map(d=>({...d,distanceMiles:located(d)?distanceMiles(center,d):null}))
  .filter(d=>!radius||validCoordinates(center)&&d.distanceMiles!==null&&d.distanceMiles<=radius)
  .sort((a,b)=>sort==='nearest'?((a.distanceMiles??Infinity)-(b.distanceMiles??Infinity)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id)):0);
}
/** Only exact addresses identify a property. Nearby houses never merge. */
export function discoveryEntries(catalog,displays,project){
 const rows=catalog.map(e=>({...e}));
 for(const d of displays){
  const old=rows.find(e=>e.holiday===project.holiday&&e.year===project.year&&(e.id===d.catalogId||canonicalAddress(e.address)===canonicalAddress(d.address)));
  if(old)Object.assign(old,{...(located(d)?{lat:d.lat,lon:d.lon,approved:d.approved,ambiguous:d.ambiguous,locationPrecision:d.locationPrecision}:{}),...(d.conflicts?.length?{conflicts:[...new Set([...(old.conflicts||[]),...d.conflicts])]}:{}),...Object.fromEntries(['favorite','rating','mustSee','needsSeasonCheck','seasonCheckedYear','lastConfirmed'].map(k=>[k,d[k]])),projectDisplayId:d.id});
  else rows.push({...d,id:`saved-${d.id}`,projectDisplayId:d.id,holiday:project.holiday,year:project.year,sourceYear:d.sourceYear,sourceName:d.sourceName||'Saved on this device',sourceUrl:d.sourceUrl||'',reviewedAt:d.catalogReviewedAt||'',locality:d.catalogLocality||'',saved:true});
 }
 return rows;
}
export function suggestCandidates(entries,mandatory,{holiday,year,max=20}={}){
 const valid=d=>d.holiday===holiday&&d.year===year&&((!d.sourceYear||d.sourceYear===year)&&(!d.sourceHoliday||d.sourceHoliday===holiday)||d.needsSeasonCheck===false&&d.seasonCheckedYear===year)&&routable(d)&&!d.conflicts?.length;
 const invalid=mandatory.filter(d=>!valid(d));
 if(invalid.length)throw Error(`Must-see stops need a reliable pin, matching season, or source-conflict review: ${invalid.map(d=>d.name).join(', ')}. Keep them and correct their details before suggesting a tour.`);
 if(mandatory.length>max)throw Error(`Keep at most ${max} must-see stops for a suggested tour.`);
 const key=d=>canonicalAddress(d.address);
 const result=[...mandatory],seen=new Set(mandatory.map(key));
 if(result.length>=max)return result;
 for(const e of entries.filter(valid).sort((a,b)=>stopValue(b)-stopValue(a)||(a.distanceMiles??Infinity)-(b.distanceMiles??Infinity)||a.name.localeCompare(b.name))){if(!seen.has(key(e))){seen.add(key(e));result.push(e);}if(result.length>=max)break;}
 if(!result.length)throw Error('No eligible displays with reliable pins for this holiday/year. Import permitted coordinates, verify saved pins, broaden your filters, or select addresses manually. Historical and city-only listings cannot seed a nearby tour.');
 return result;
}
