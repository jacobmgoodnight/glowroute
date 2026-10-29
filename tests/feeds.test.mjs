import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fetchFeed,validateFeed,collectFeeds,run} from '../scripts/fetch-feeds.mjs';
const now=new Date('2026-10-29T10:00Z');
const feed={id:'owner',name:'Owner feed',enabled:true,url:'https://authorized.org/feed.json',format:'json',authorization:{evidenceUrl:'https://authorized.org/glowroute-permission',reviewedAt:'2026-10-29',expiresAt:'2027-10-29',reviewer:'Maintainer',fetch:true,store:true,redistribute:true}};
const row={id:'1',name:'Owner display',address:'100 Main St, Denver, CO',holiday:'Christmas',year:2025};
test('both researched providers are inactive and no HTML source can be enabled',async()=>{
 const sources=JSON.parse(await readFile(new URL('../feeds/sources.json',import.meta.url)));
 let requests=0;const result=await collectFeeds(sources,{request:async()=>{requests++;throw Error();},now});
 assert.equal(requests,0);assert.equal(result.report.status,'no-authorized-feeds-configured');assert.equal(result.candidate.entries.length,0);
 assert.throws(()=>validateFeed({...feed,format:'frightmaps-html'},now),/inactive/);
});
test('permission gates require all rights, dated evidence and expiry before any network access',async()=>{
 for(const authorization of [null,{permission:'Owner reports permission'},{...feed.authorization,redistribute:false},{...feed.authorization,expiresAt:'2026-10-01'},{...feed.authorization,evidenceUrl:'javascript:x'}])await assert.rejects(fetchFeed({...feed,authorization},{request:async()=>{throw Error('Network must not be called');},now}),/authorization/);
 for(const url of ['http://authorized.org','https://127.0.0.1/feed','https://private.internal/feed','https://authorized.org/feed?secret=x','https://user:pass@authorized.org/feed'])assert.throws(()=>validateFeed({...feed,url},now));
});
test('authorized imports retain original year, stable identity and provider attribution with bounded requests',async()=>{
 let options;const result=await fetchFeed(feed,{request:async(url,o)=>{assert.equal(url,feed.url);options=o;return new Response(JSON.stringify([row]));},now});
 assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(result[0].year,2025);assert.equal(result[0].lastImported,'2026-10-29');assert.equal(result[0].sources[0].recordId,'1');
});
test('original listing references and CSV facts survive the approved export adapter',async()=>{
 const sources=[{name:'Homeowner',url:'https://authorized.org/display/one',recordId:'home-one'}];
 const [d]=await fetchFeed(feed,{request:async()=>new Response(JSON.stringify([{...row,sources}])),now});assert.equal(d.sources.length,2);assert.deepEqual(d.sources[0],sources[0]);
 const csv='id,name,address,holiday,year,cost,viewingMinutes\none,Display,"100 Main St, Denver CO",Christmas,2025,Free,12';
 const result=await collectFeeds([{...feed,format:'csv'}],{request:async()=>new Response(csv),now});assert.equal(result.candidate.entries[0].viewingMinutes,12);assert.equal(result.candidate.entries[0].year,2025);assert.equal(result.candidate.entries[0].cost,'Free');
 await assert.rejects(collectFeeds([feed],{request:async()=>new Response(JSON.stringify([{...row,id:''}])),now}).then(r=>{if(!r.candidate)throw Error('Missing ID rejected');}));
});
test('empty, malformed, oversized, failed sources produce no candidate or partial success',async()=>{
 for(const body of ['[]','<html>changed</html>',' '.repeat(2097153)])await assert.rejects(fetchFeed(feed,{request:async()=>new Response(body),now}));
 const result=await collectFeeds([feed,{...feed,id:'second'}],{request:async()=>new Response('',{status:503}),now});assert.equal(result.candidate,null);assert.equal(result.report.status,'failed-no-candidate');
 await assert.rejects(collectFeeds([feed,{...feed,id:'second',authorization:null}],{request:async()=>{throw Error('Unexpected network');},now}),/authorization/);
});
test('runner creates report without modifying curated data; failure cannot leave a stale candidate',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'glowroute-feed-')),config=join(dir,'sources.json'),output=join(dir,'out');
 const catalog=await readFile(new URL('../directory/catalog.json',import.meta.url),'utf8');
 await writeFile(config,JSON.stringify([{...feed,enabled:false}]));await run({output,config});
 assert.equal(JSON.parse(await readFile(join(output,'report.json'))).status,'no-authorized-feeds-configured');
 assert.equal(await readFile(new URL('../directory/catalog.json',import.meta.url),'utf8'),catalog);
 await writeFile(join(output,'candidate.json'),'STALE');await writeFile(config,JSON.stringify([{...feed,authorization:null}]));await assert.rejects(run({output,config}));
 await assert.rejects(readFile(join(output,'candidate.json')));
});
test('workflow only uploads review artifacts: no write, deployment or auto-commit privileges',async()=>{
 const workflow=await readFile(new URL('../.github/workflows/import.yml',import.meta.url),'utf8');
 assert.match(workflow,/workflow_dispatch/);assert.match(workflow,/schedule/);assert.match(workflow,/timeout-minutes: 5/);assert.match(workflow,/contents: read/);assert.match(workflow,/if: always\(\)/);
 assert.doesNotMatch(workflow,/contents: write|pages: write|id-token|git push|git commit|deploy-pages/);
});
