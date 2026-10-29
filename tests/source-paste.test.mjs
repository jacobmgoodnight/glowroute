import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSourcePaste,pastedSeason,sourceKind} from '../source-paste.mjs';
import {importedDisplay,importReview,parseImportedStops} from '../importer.mjs';
import {applyCatalogToProject} from '../directory.mjs';
import {makeProject} from '../projects.mjs';
const url='https://indywithkids.com/christmas-lights-list-indianapolis-central-indiana/';
const copied=`Christmas Lights List for Example County | 2025
Example County Tour
3 displays.
Add All and Optimize
Email me this tour
Example Family Lights
Example County
Add to Route
Free
Residential
An editorial description that must not become a display name or saved description.
Address & Details
Address
123 Example Road, Example City, Indiana
Cost
Free
Full details
Rural Road Lights
Example County
Add to Route
Address & Details
Address
456 N 200 W, Example City, Indiana
Full details
Example Pass Lights
Example City
Closed for the season
Address & Details
Address
789 Example Pass, Example City, Indiana
Cost
Free
Full details`;
test('visible Indy guide paste keeps names and explicit rural/Pass addresses, not editorial text',()=>{
 const result=parseSourcePaste(copied,{url,holiday:'Christmas'});
 assert.equal(result.records.length,3);assert.equal(result.issues.length,0);assert.deepEqual(result.records.map(r=>r.name),['Example Family Lights','Rural Road Lights','Example Pass Lights']);
 assert.equal(result.origin.year,2025);assert.equal(result.origin.url,url);assert.equal(result.origin.name,'Indy with Kids');
 assert.match(result.records[2].metadata.conflicts[0],/closed/);assert(!JSON.stringify(result.records).includes('editorial description'));
 const imported=importedDisplay(result.records[0],{id:'new',origin:result.origin,projectYear:2026,projectHoliday:'Christmas'}).display;
 assert.equal(imported.sourceYear,2025);assert.equal(imported.sourceHoliday,'Christmas');assert.equal(imported.sourceUrl,url);assert.equal(imported.needsSeasonCheck,true);
 const roundtrip=parseImportedStops(JSON.stringify({displays:result.records.map((r,i)=>importedDisplay(r,{id:String(i),origin:result.origin}).display)}));assert.equal(roundtrip.records.length,3);assert.equal(roundtrip.records[1].address,'456 N 200 W, Example City, Indiana');
 const withFooter=parseSourcePaste(copied+'\nPublisher office\n999 Unrelated Street, Other City, IN',{url});assert.equal(withFooter.records.length,3);
});
test('manual weekly append skips same addresses and keeps personal records untouched',()=>{
 const first=parseSourcePaste(copied,{url}),existing=first.records.map((r,i)=>({...importedDisplay(r,{id:String(i),origin:first.origin}).display,visitNotes:'PRIVATE',rating:5,approved:true}));
 const before=structuredClone(existing),again=first.records.map(r=>({...r,include:true})),review=importReview(again,existing);
 assert.equal(review.active.length,0);assert.equal(review.existingCount,3);assert.deepEqual(existing,before);
});
test('known sources require a printed season year and conflicting copied headings block import',()=>{
 assert.match(parseSourcePaste('Display — 123 Example Rd, Indianapolis, IN',{url}).issues.join(),/year printed/);
 assert.match(parseSourcePaste(copied,{url,year:2026,holiday:'Christmas'}).issues.join(),/heading says Christmas 2025/);
 assert.deepEqual(pastedSeason('Haunted Houses near Indianapolis (2026)'),{holiday:'Halloween',year:2026});
 assert.equal(pastedSeason('123 Christmas Street, Indianapolis, IN 2026'),null);
 assert.equal(sourceKind('https://frightmaps.com.fake.org/'),'other');
});
test('FrightMaps city-only paste explains why it cannot route and never fabricates an address',()=>{
 const r=parseSourcePaste('Haunted Houses near Indianapolis (2026)\nExample Haunt\nGreenfield, IN\nFree admission',{url:'https://frightmaps.com/metro/indianapolis'});
 assert.equal(r.records.length,0);assert.match(r.issues.join(),/only a city/);assert.equal(r.origin.year,2026);
 const full=parseSourcePaste('Example Haunt — 123 Example Rd, Greenfield, IN',{url:'https://frightmaps.com/houses/indiana/example',year:2026,holiday:'Halloween'});
 assert.equal(full.records.length,1);assert.equal(full.origin.season,'Halloween');assert.equal(full.issues.length,0);
});
test('own address lists and old JSON imports still work without source fields; unsafe sources fail',()=>{
 assert.equal(parseSourcePaste('123 Example Rd, Portland, OR').records.length,1);
 const r=parseSourcePaste(JSON.stringify([{name:'Old',address:'123 Example Rd, Portland, OR',sourceYear:2025}]),{filename:'old.json'});assert.equal(r.records[0].metadata.sourceYear,2025);
 assert.match(parseSourcePaste('123 Example Rd, Portland, OR',{url:'javascript:alert(1)'}).issues.join(),/HTTPS/);
});
test('archive references require an explicit opt-in and keep their year without losing current personal verification',()=>{
 const entry={id:'old-entry',name:'Old source',address:'123 Example Rd, Denver, CO',holiday:'Christmas',year:2025,sourceName:'Owner',sourceUrl:'https://example.org/old'};
 const project=makeProject({holiday:'Christmas',year:2026,displays:[],selected:[]});
 assert.equal(applyCatalogToProject(project,[{entry,include:true}]).added,0);
 const result=applyCatalogToProject(project,[{entry,include:true,allowHistorical:true}]);assert.equal(result.added,1);assert.equal(result.displays[0].sourceYear,2025);assert.equal(result.displays[0].needsSeasonCheck,true);
 project.state.displays=[{...result.displays[0],visitNotes:'PRIVATE',rating:5,needsSeasonCheck:false,seasonCheckedYear:2026}];
 const refreshed=applyCatalogToProject(project,[{entry,include:true,allowHistorical:true}]).displays[0];assert.equal(refreshed.needsSeasonCheck,false);assert.equal(refreshed.visitNotes,'PRIVATE');assert.equal(refreshed.rating,5);
 assert.equal(applyCatalogToProject(makeProject({holiday:'Halloween',year:2026}),[{entry,include:true,allowHistorical:true}]).added,0);
});
