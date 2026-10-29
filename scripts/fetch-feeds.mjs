import {readFile,mkdir,writeFile,rename,unlink} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {validateCandidates} from '../candidates.mjs';
import {validDate,safeSourceUrl,sourceReferences} from '../display-info.mjs';
import {parseDelimited} from '../importer.mjs';
const MAX_BYTES=2*1024*1024;
export function validateFeed(feed,now=new Date()){
 if(!feed||!/^[a-z0-9-]{1,60}$/.test(feed.id)||typeof feed.enabled!=='boolean')throw Error('Invalid feed configuration');
 if(!feed.enabled)return feed;
 const a=feed.authorization,today=now.toISOString().slice(0,10);
 if(!a||!safeSourceUrl(a.evidenceUrl)||!validDate(a.reviewedAt)||a.reviewedAt>today||!validDate(a.expiresAt)||a.expiresAt<today||!a.reviewer||a.fetch!==true||a.store!==true||a.redistribute!==true)throw Error('Documented, reviewed and unexpired access/storage/redistribution authorization is required');
 const url=safeSourceUrl(feed.url);if(!url)throw Error('Use public HTTPS');const u=new URL(url);
 if(u.search||u.hash||u.port||!u.hostname.includes('.')||/^[\d.]+$|:|(^|\.)(localhost|local|internal|test|example|invalid)$/.test(u.hostname))throw Error('Use a public hostname without ports, query secrets or fragments');
 if(!['json','csv'].includes(feed.format))throw Error('HTML harvesting is inactive; use a publisher-approved JSON/CSV export');
 if(!feed.name||feed.name.length>90)throw Error('Invalid provider name');
 return feed;
}
async function boundedText(response){
 if(!response.ok||!response.body)throw Error('Source unavailable');
 if(Number(response.headers.get('content-length'))>MAX_BYTES)throw Error('Response exceeds 2 MB');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES)throw Error('Response exceeds 2 MB');chunks.push(value);}}finally{await reader.cancel();}
 const all=new Uint8Array(size);let offset=0;for(const part of chunks){all.set(part,offset);offset+=part.length;}return new TextDecoder().decode(all);
}
export function parseFeed(text,format){
 if(format==='json'){const raw=JSON.parse(text);return Array.isArray(raw)?raw:raw.entries;}
 const rows=parseDelimited(text,',');if(rows.length<2)throw Error('Empty CSV');
 const headers=rows.shift().map(s=>s.trim());
 return rows.map(row=>Object.fromEntries(headers.map((h,i)=>{
  const v=row[i]?.trim()||'';
  return [h,['lat','lon','lng','year','viewingMinutes'].includes(h)?(v?Number(v):null):['sources','schedule','hours','conflicts'].includes(h)?(v?JSON.parse(v):undefined):h==='music'?(v==='true'?true:v==='false'?false:null):v];
 })));
}
export async function fetchFeed(raw,{request=fetch,now=new Date()}={}){
 const feed=validateFeed(raw,now);if(!feed.enabled)return [];
 const response=await request(feed.url,{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(15000),headers:{Accept:feed.format==='json'?'application/json':'text/csv','User-Agent':'GlowRoute/1.7 (+https://github.com/jacobmgoodnight/glowroute)'}});
 const text=await boundedText(response),rows=parseFeed(text,feed.format);
 if(!Array.isArray(rows)||!rows.length)throw Error('Empty or changed source; retain previous reviewed data');
 return rows.map(d=>{if(!d||typeof d.id!=='string'||!d.id.trim())throw Error('Missing stable source ID');return {...d,id:`${feed.id}:${d.id}`,sources:sourceReferences([...(Array.isArray(d.sources)?d.sources:[{name:d.sourceName||feed.name,url:d.sourceUrl,recordId:d.id}]),{name:feed.name,url:feed.url,recordId:d.id}]),lastImported:now.toISOString().slice(0,10)};});
}
export async function collectFeeds(feeds,{request=fetch,now=new Date()}={}){
 if(!Array.isArray(feeds)||feeds.length>10||new Set(feeds.map(f=>f.id)).size!==feeds.length)throw Error('Invalid or duplicate feed configuration');
 const report={fetchedAt:now.toISOString(),status:'no-authorized-feeds-configured',sources:[]},rows=[];
 // Validate every source before any request. A misconfiguration cannot partially harvest.
 feeds.forEach(f=>validateFeed(f,now));
 for(const feed of feeds){
  if(!feed.enabled){report.sources.push({id:feed.id,status:'inactive'});continue;}
  try{const found=await fetchFeed(feed,{request,now});rows.push(...found);report.sources.push({id:feed.id,status:'fetched',records:found.length});}
  catch{report.sources.push({id:feed.id,status:'failed'});report.status='failed-no-candidate';}
 }
 if(report.status==='failed-no-candidate')return {report,candidate:null};
 const candidate={schemaVersion:1,kind:'review-candidates',fetchedAt:now.toISOString(),entries:rows};
 validateCandidates(candidate);if(rows.length)report.status='review-required';
 return {report,candidate};
}
export async function run({output='import-output',config='feeds/sources.json'}={}){
 await mkdir(output,{recursive:true});
 // Remove only this run's generated candidate; a failure must not upload a stale success.
 await unlink(`${output}/candidate.json`).catch(e=>{if(e.code!=='ENOENT')throw e;});
 let result;
 try{const feeds=JSON.parse(await readFile(config,'utf8'));result=await collectFeeds(feeds);}catch{result={report:{status:'configuration-invalid-no-candidate',fetchedAt:new Date().toISOString()},candidate:null};}
 await writeFile(`${output}/report.json`,JSON.stringify(result.report,null,2));
 if(result.candidate?.entries.length){await writeFile(`${output}/candidate.tmp`,JSON.stringify(result.candidate,null,2));await rename(`${output}/candidate.tmp`,`${output}/candidate.json`);}
 if(!result.candidate)throw Error('Import failed. Review report; published and prior reviewed data are unchanged.');
 console.log(`${result.report.status}. No public directory or deployment changes.`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)run().catch(e=>{console.error(e.message);process.exitCode=1;});
