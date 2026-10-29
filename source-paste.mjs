/** User-pasted visible listings only. No requests, hidden data or editorial reuse. */
import {parseImportedStops,canonicalAddress} from './importer.mjs';
import {htmlToText} from './catalogs.mjs';
import {safeSourceUrl} from './display-info.mjs';

export const EXPLORER_SNAPSHOT_URL='https://raw.githubusercontent.com/jacobmgoodnight/Holiday-Display-Explorer/main/public/data/source-candidates.json';
export function sourceKind(url){try{const host=new URL(url).hostname.replace(/^www\./,'').toLowerCase();return host==='indywithkids.com'?'indy':host==='frightmaps.com'?'frightmaps':'other';}catch{return 'other';}}
export function pastedSeason(text){
 for(const line of String(text).split(/\r?\n/).slice(0,250)){
  const year=line.match(/\b(20\d{2})\b/)?.[1];
  if(!year||line.length>180)continue;
  if(/^\s*(?:#*\s*)?Christmas Lights(?:\s|\|)/i.test(line))return {holiday:'Christmas',year:Number(year)};
  if(/^\s*(?:#*\s*)?(?:Haunted Houses near|Halloween.*(?:Guide|Displays|Houses))/i.test(line))return {holiday:'Halloween',year:Number(year)};
 }
 return null;
}
const boilerplate=/^(?:Address(?:\s*&\s*Details)?|Full details|Add to Route|Closed for (?:the )?season|Radio|Cost|Dates|Free|Paid|Residential|Commercial|Musical\s*\/\s*Synchronized|From .+|Through .+|Tune to .+|\d+ displays?\.?|.* Tour|Add All and Optimize|Email me this tour)$/i;
function labelGuideRecords(records,text){
 const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);let previousAddress=-1;
 const normalizedLines=lines.map(canonicalAddress),known=new Set(records.map(r=>canonicalAddress(r.address)));
 // Explicit visible Address fields also cover rural roads and street names such as "Pass".
 // They require a locality on the copied line; no city or address is invented.
 for(let i=0;i<lines.length-1;i++)if(/^Address$/i.test(lines[i])&&/^\d{1,6}\s+\S+/.test(lines[i+1])&&lines[i+1].includes(',')&&lines[i+1].length<=220){
  const address=lines[i+1],key=canonicalAddress(address);if(!known.has(key)){known.add(key);records.push({name:address,address,lat:null,lon:null});}
 }
 const positions=new Map(records.map(r=>{const street=canonicalAddress(r.address.split(',')[0]);return [r,normalizedLines.findIndex(line=>line.includes(street))];}));
 records.sort((a,b)=>positions.get(a)-positions.get(b));
 for(const record of records){
  const street=canonicalAddress(record.address.split(',')[0]);
  const index=normalizedLines.findIndex((line,i)=>i>previousAddress&&line.includes(street));if(index<0)continue;
  const block=lines.slice(previousAddress+1,index),action=block.findLastIndex(line=>/^(?:Add to Route|Closed for (?:the )?season)$/i.test(line));
  if(action>=0){
   const preceding=block.slice(0,action).filter(line=>line.length<=110&&!boilerplate.test(line)&&!/^https?:|^\d+ areas?$|^\d+ displays?/i.test(line));
   // Cards show a display title followed by its area. Keep only that title, not descriptions.
   const name=preceding.length>=2?preceding.at(-2):preceding.at(-1);
   if(name)record.name=name;
   if(/^Closed/i.test(block[action]))record.metadata={...(record.metadata||{}),conflicts:['Copied source marks this display closed for its listed season. Check the original listing.']};
  }
  previousAddress=index;
 }
}
export function parseSourcePaste(raw,{url='',year=null,holiday='',defaultCity='',filename=''}={}){
 const sourceUrl=safeSourceUrl(url),kind=sourceKind(sourceUrl);
 const input=String(raw||''),text=/<(?:html|article|div|p|li|h[1-6])\b/i.test(input)?htmlToText(input):input;
 const parsed=parseImportedStops(text,{defaultCity,filename});
 const detected=!filename.endsWith('.json')&&!/^[\[{]/.test(text.trim())?pastedSeason(text):null;
 const sourceYear=Number.isInteger(year)&&year>=2000&&year<=2100?year:detected?.year||null;
 const sourceHoliday=['Halloween','Christmas','Other'].includes(holiday)?holiday:detected?.holiday||null;
 if(url&&!sourceUrl)parsed.issues.push('Use a public HTTPS source link without credentials, or clear the link.');
 if(detected&&((year&&year!==detected.year)||(holiday&&holiday!==detected.holiday)))parsed.issues.push(`The copied heading says ${detected.holiday} ${detected.year}. Correct the source season fields before importing.`);
 if(kind!=='other'&&!sourceYear)parsed.issues.push('Choose the year printed on the source listing, or include its dated heading. The copy date does not establish the season.');
 if(kind==='indy'&&!filename&&input.length<=400_000){
  labelGuideRecords(parsed.records,text);
  if(parsed.records.length)parsed.issues=parsed.issues.filter(issue=>!issue.startsWith('No recognizable street addresses.'));
  parsed.diagnostics=parsed.diagnostics?.filter(d=>!parsed.records.some(r=>canonicalAddress(r.address)===canonicalAddress(d.preview)));
  if(parsed.records.length>500){parsed.issues.push('Review up to 500 unique addresses at once. Split this list into smaller files.');parsed.records=parsed.records.slice(0,500);}
 }
 if(kind==='frightmaps'&&!parsed.records.length)parsed.issues=['No numbered street addresses found. Many FrightMaps listings show only a city. Open the individual listing and use an explicitly published/permitted address; a name and city cannot become a route stop.'];
 return {...parsed,origin:{name:kind==='indy'?'Indy with Kids':kind==='frightmaps'?'FrightMaps':sourceUrl?new URL(sourceUrl).hostname:'Pasted or uploaded listing',url:sourceUrl,year:sourceYear,season:sourceHoliday},detected};
}
