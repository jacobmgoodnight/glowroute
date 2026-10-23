/** Client-side imports only: no scraping or third-party requests. */
const STREET = /\b\d{1,6}\s+(?:(?:N|S|E|W|NE|NW|SE|SW)\.?\s+)?(?:[A-Za-z0-9'’.\-]+\s+){0,7}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Circle|Cir|Parkway|Pkwy|Terrace|Ter|Place|Pl)\.?\b/i;
const CLEAN_CITY = /,?\s*(?:Indianapolis|Irvington|Greenfield|New Palestine|Carmel|Fishers|Lawrence|Beech Grove|Avon|Brownsburg|Plainfield|Greenwood)(?:\s*,\s*|\s+)(?:IN|Indiana)(?:\s+\d{5}(?:-\d{4})?)?$/i;
const STATE_END = /\b(?:IN|Indiana|IL|OH|KY|MI|WI|MO|CA|NY|FL|TX)\s+\d{5}(?:-\d{4})?$/i;
const STREET_END = /(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Circle|Cir|Parkway|Pkwy|Terrace|Ter|Place|Pl)\.?$/i;
const headerTags=['address','street','location','name','display','city','state','zip','postal'];
export function canonicalAddress(address){return String(address||'').toLowerCase().replace(/\b(street|st)\b/g,'st').replace(/\b(avenue|ave)\b/g,'ave').replace(/\b(road|rd)\b/g,'rd').replace(/\b(lane|ln)\b/g,'ln').replace(/\b(drive|dr)\b/g,'dr').replace(/\b(boulevard|blvd)\b/g,'blvd').replace(/[.,#]/g,'').replace(/\s+/g,' ').trim();}
function clean(value){return String(value??'').replace(/[\u200b\u200c\u200d]/g,'').trim().replace(/^["'`\s•*–—-]+|["'`\s;|–—-]+$/g,'').trim();}
function normalizeAddress(value,defaultCity){
 let address=clean(value).replace(/\s+/g,' ').replace(/\s+\(.*?\)$/,'').trim();
 // Use an explicit city/state or zip if supplied; otherwise apply the selected import area.
 if(!STATE_END.test(address)&& !/\b[A-Z]{2}\s*\d{5}\b/.test(address)){
  if(CLEAN_CITY.test(address))return address;
  if(/,\s*[^,]+,\s*[A-Za-z]{2}\b/.test(address))return address;
  address+=', '+clean(defaultCity||'Indianapolis, IN');
 }
 return address.slice(0,170);
}
function parseDelimited(text,delimiter){
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
function toRecord(name,address,defaultCity,lat=null,lon=null){
 if(!STREET.test(address))return null;
 const normalized=normalizeAddress(address,defaultCity);
 const label=clean(name).slice(0,80)||clean(address).slice(0,80);
 return {name:label,address:normalized,lat:Number.isFinite(lat)&&lat>-90&&lat<90?lat:null,lon:Number.isFinite(lon)&&lon>-180&&lon<180?lon:null};
}
function rowRecords(rows,defaultCity){
 if(!rows.length)return [];
 const head=rows[0].map(normalizedHeading);
 const column=k=>head.findIndex(x=>k.some(v=>x===v||x.startsWith(v)));
 const ai=column(['address','streetaddress','street','location','formattedaddress','fulladdress']);
 const ni=column(['displayname','display','name','title','housename']);
 const ci=column(['city','town']);const si=column(['state','statecode']);const zi=column(['zip','postal']);
 const hasHeader=ai>=0 || (ni>=0&&head.some(h=>headerTags.some(tag=>h.includes(tag))));
 let records=[];
 for(const row of rows.slice(hasHeader?1:0)){
  const values=row.map(clean);if(!values.some(Boolean))continue;
  let name='',address='';
  if(hasHeader){address=values[ai]||'';name=values[ni]||'';
   if(address&&ci>=0&&values[ci]&&!new RegExp(values[ci],'i').test(address))address+=', '+values[ci];
   if(address&&si>=0&&values[si]&&!/\b[A-Z]{2}\b\s*\d{5}?$/i.test(address))address+=', '+values[si];
   if(address&&zi>=0&&values[zi]&&!/\d{5}/.test(address))address+=' '+values[zi];
  }else{
   const i=values.findIndex(v=>STREET.test(v));if(i<0)continue;
   address=values[i];name=values.find((v,j)=>j!==i&&v.length<90&&!STREET.test(v))||'';
  }
  const record=toRecord(name,address,defaultCity);if(record)records.push(record);
 }
 return records;
}
function textRecords(input,defaultCity){
 const records=[];let previousLabel='';
 for(const raw of input.split(/\r?\n/)){
  const line=clean(raw.replace(/^\s*\d+[.)]\s+/,''));if(!line)continue;
  const match=STREET.exec(line);
  if(!match){if(line.length<95&&!/^(?:https?:|posted by|photo|learn more|click here|directions)/i.test(line))previousLabel=line;continue;}
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
 const issues=[];let records=[];
 if(filename.toLowerCase().endsWith('.json')||/^[\[{]/.test(text)){
  try{
   const parsed=JSON.parse(text);
   const items=Array.isArray(parsed)?parsed:parsed.displays;
   if(!Array.isArray(items))throw Error('Expected an array or an object with a displays array');
   records=items.map(d=>toRecord(d.name||d.title,d.address||d.location||'',defaultCity,Number.isFinite(d.lat)?d.lat:null,Number.isFinite(d.lon)?d.lon:null)).filter(Boolean);
  }catch(e){return {records:[],duplicates:0,issues:['Could not parse JSON: '+e.message]};}
 }else{
  const first=text.split(/\r?\n/)[0];
  const delimiter=filename.toLowerCase().endsWith('.tsv')||first.includes('\t')?'\t':',';
  const header=first.toLowerCase();
  const looksTabular=/\b(address|street|location|name|display)\b/.test(header)&&first.includes(delimiter);
  if(looksTabular||filename.toLowerCase().endsWith('.csv')||filename.toLowerCase().endsWith('.tsv')){
   records=rowRecords(parseDelimited(text,delimiter),defaultCity);
   if(!records.length&&!filename.toLowerCase().endsWith('.csv'))records=textRecords(text,defaultCity);
  }else records=textRecords(text,defaultCity);
 }
 const found=new Set(),unique=[];let duplicates=0;
 for(const r of records){const key=canonicalAddress(r.address);if(found.has(key)){duplicates++;continue;}found.add(key);unique.push(r);}
 if(!unique.length)issues.push('No recognizable street addresses. Try a line per address or a CSV with an Address column.');
 if(unique.length>70)issues.push('Only 70 stops can be imported into one route.');
 return {records:unique,duplicates,issues};
}
