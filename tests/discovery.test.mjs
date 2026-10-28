import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDirectory,directorySeason,directoryMatches,compareCatalogToProject,applyCatalogToProject,makeSubmissionUrl} from '../directory.mjs';
import {parseImportedStops,importMetadata,importReview,importedDisplay} from '../importer.mjs';
import {makeProject} from '../projects.mjs';

const entry=(id,year=2026)=>({id,name:`Display ${id}`,address:'100 Main St, Portland, OR',holiday:'Halloween',year,sourceName:'Public announcement',sourceUrl:'https://example.org/listing',reviewedAt:'2026-10-20',verification:'source-listed',notes:'Operation unconfirmed'});
test('directory season labels distinguish archive, current unconfirmed and future references',()=>{
 assert.match(directorySeason(entry('old',2025),2026).label,/Archive/);
 assert.match(directorySeason(entry('now'),2026).detail,/not confirmation/);
 assert.match(directorySeason(entry('future',2027),2026).label,/Future season/);
});
test('optional public details are bounded, searchable and require the existing public source',()=>{
 const source={...entry('public-display'),locality:'Portland',description:'Music and projection',operatingDates:'October weekends, as reported',hours:'Source says 6–9 pm'};
 const result=validateDirectory({schemaVersion:1,entries:[source]}).entries[0];
 assert.equal(result.hours,source.hours);assert.equal(directoryMatches([result],{query:'projection'}).length,1);
 assert.throws(()=>validateDirectory({schemaVersion:1,entries:[{...source,sourceUrl:''}]}));
 assert.equal(validateDirectory({schemaVersion:1,entries:[{...source,description:'a'.repeat(1000)}]}).entries[0].description.length,300);
});
test('directory sorting/filtering does not mutate source records or lose deterministic ties',()=>{
 const records=[{...entry('d-001',2025),name:'Zebra',locality:'Portland'},{...entry('d-002'),name:'Museum',locality:'Denver',address:'200 Main St, Denver, CO',reviewedAt:'2026-10-22'}];
 const before=structuredClone(records);
 assert.equal(directoryMatches(records,{sort:'locality'})[0].id,'d-002');assert.equal(directoryMatches(records,{sort:'year'})[0].year,2026);assert.equal(directoryMatches(records,{sort:'reviewed'})[0].id,'d-002');
 assert.deepEqual(directoryMatches(records,{year:'2025',query:'zebra'}).map(e=>e.id),['d-001']);assert.deepEqual(records,before);
});
test('directory refresh detects source-only revisions and keeps private data separate',()=>{
 const e=entry('public-display'),project=makeProject({holiday:'Halloween',year:2026,displays:[{id:'own',catalogId:e.id,name:e.name,address:e.address,sourceName:e.sourceName,sourceUrl:e.sourceUrl,catalogReviewedAt:e.reviewedAt,sourceVerification:e.verification,catalogNotes:e.notes,visitNotes:'PRIVATE',favorite:true,rating:5,lat:45.5,lon:-122.6,approved:true,needsSeasonCheck:false,seasonCheckedYear:2026}],selected:['own']});
 assert.equal(compareCatalogToProject(project,[e])[0].kind,'already');
 const newer={...e,reviewedAt:'2026-10-25',hours:'6–9 pm',notes:'Dates were updated'};
 const action=compareCatalogToProject(project,[newer])[0];assert.equal(action.kind,'update');
 const updated=applyCatalogToProject(project,[{...action,include:true}]);const d=updated.displays[0];
 assert.equal(d.catalogHours,newer.hours);assert.equal(d.catalogNotes,newer.notes);assert.equal(d.visitNotes,'PRIVATE');assert.equal(d.favorite,true);assert.equal(d.approved,true);assert.equal(d.needsSeasonCheck,false);assert.deepEqual(updated.selected,['own']);
});
test('replacing a catalog address resets both pin approval and old seasonal verification',()=>{
 const e=entry('public-display'),project=makeProject({displays:[{id:'old',catalogId:e.id,name:e.name,address:'999 Wrong St',lat:0,lon:0,approved:true,needsSeasonCheck:false,seasonCheckedYear:2026}]});
 const next=applyCatalogToProject(project,[{entry:e,include:true,replaceDetails:true}]).displays[0];
 assert.equal(next.lat,null);assert.equal(next.needsSeasonCheck,true);assert.equal(next.seasonCheckedYear,null);
});
test('keeping a custom display name does not produce the same source update on every refresh',()=>{
 const e=entry('public-display'),project=makeProject({holiday:'Halloween',year:2026,displays:[{id:'own',catalogId:e.id,name:'Our family nickname',address:e.address}],selected:[]});
 const applied=applyCatalogToProject(project,[{entry:e,include:true,replaceDetails:false}]);project.state.displays=applied.displays;
 assert.equal(project.state.displays[0].name,'Our family nickname');assert.equal(compareCatalogToProject(project,[e])[0].kind,'already');assert.equal(compareCatalogToProject(project,[{...e,name:'New source name'}])[0].kind,'update');
});
test('CSV and JSON rejected rows are explained while good records remain usable',()=>{
 const csv=parseImportedStops('Name,Address\nGood,100 Main St\nMissing,\nBad,not a street',{filename:'x.csv',defaultCity:'Portland, OR'});
 assert.equal(csv.records.length,1);assert.equal(csv.diagnostics.length,2);assert.equal(csv.diagnostics[0].row,3);assert.equal(csv.issues.length,0);
 const json=parseImportedStops(JSON.stringify([null,{name:'Good',address:'100 Main St'},'bad',{name:'Invalid',address:'unknown'}]));
 assert.equal(json.records.length,1);assert.equal(json.diagnostics.length,3);assert.equal(json.issues.length,0);
});
test('lists above route capacity can be reviewed and reduced to a valid subset',()=>{
 const records=parseImportedStops(Array.from({length:71},(_,i)=>`${i+100} Test St, Portland, OR`).join('\n'),{defaultCity:''});
 assert.equal(records.records.length,71);assert.equal(records.issues.length,0);
 const review=records.records.map((r,i)=>({...r,include:i<3}));assert.equal(importReview(review,[]).active.length,3);
});
test('append skips existing matches; mode changes retain edits and explicit selection',()=>{
 const rows=[{name:'Edited name',address:'100 Main Street, Portland, OR',include:true},{name:'No',address:'101 Main St, Portland, OR',include:false},{name:'New',address:'102 Main St, Portland, OR',include:true}];
 const before=structuredClone(rows),existing=[{address:'100 Main St, Portland OR'}];
 assert.equal(importReview(rows,existing,'append').active.length,1);assert.equal(importReview(rows,existing,'replace').active.length,2);assert.deepEqual(rows,before);
 const duplicate=importReview([...rows,{...rows[2]}],existing);assert.equal(duplicate.duplicate,true);
});
test('stop exports round-trip private preferences, source fields, selection and manual pins with fresh IDs',()=>{
 const d={id:'old',name:'Display',address:'100 Main St, Portland, OR',lat:45.5,lon:-122.6,geoSource:'manual',approved:true,rating:5,favorite:true,mustSee:false,visited:true,skipped:false,visitedAt:'2026-10-25T20:30:00.000Z',visitNotes:'PRIVATE',sourceName:'Owner announcement',sourceUrl:'https://example.org/show',sourceYear:2026,catalogNotes:'Public note',needsSeasonCheck:false,seasonCheckedYear:2026};
 const parsed=parseImportedStops(JSON.stringify({version:1,project:{holiday:'Halloween',year:2026},displays:[d],selected:[]}));
 const imported=importedDisplay(parsed.records[0],{id:'new',projectYear:2026,projectHoliday:'Halloween'});
 assert.equal(imported.display.id,'new');assert.equal(imported.display.visitNotes,'PRIVATE');assert.equal(imported.display.catalogNotes,'Public note');assert.equal(imported.display.rating,5);assert.equal(imported.display.favorite,true);assert.equal(imported.display.visited,true);assert.equal(imported.display.geoSource,'manual');assert.equal(imported.display.approved,true);assert.equal(imported.display.needsSeasonCheck,false);assert.equal(imported.selected,false);
 for(const context of [{projectYear:2027,projectHoliday:'Halloween'},{projectYear:2026,projectHoliday:'Christmas'},{}])assert.equal(importedDisplay(parsed.records[0],context).display.needsSeasonCheck,true);
 const nextSeason=importedDisplay(parsed.records[0],{projectYear:2027,projectHoliday:'Halloween'}).display;assert.equal(nextSeason.visited,false);assert.equal(nextSeason.skipped,false);assert.equal(nextSeason.visitedAt,null);assert.equal(nextSeason.favorite,true);assert.equal(nextSeason.visitNotes,'PRIVATE');assert.equal(nextSeason.approved,true);
});
test('untrusted metadata cannot inject IDs, arbitrary state, unsafe links or approved invalid pins',()=>{
 const raw=JSON.parse('{"id":"evil","__proto__":{"polluted":true},"rating":99,"favorite":"true","sourceUrl":"javascript:alert(1)","visitNotes":"safe","approved":true,"geoSource":"manual"}');
 const safe=importMetadata(raw);assert.equal(safe.id,undefined);assert.equal(safe.rating,undefined);assert.equal(safe.favorite,undefined);assert.equal(safe.sourceUrl,undefined);assert.equal({}.polluted,undefined);
 const display=importedDisplay({name:'A',address:'100 Main St',lat:91,lon:0,metadata:safe},{id:'fresh'}).display;assert.equal(display.approved,false);assert.equal(display.lat,null);assert.equal(display.id,'fresh');
});
test('directory-length names and addresses survive a stop-list export import',()=>{
 const name='Public display '+ 'x'.repeat(95),address='100 Main Street, '+ 'Long neighborhood '.repeat(9)+'Portland, OR';
 const parsed=parseImportedStops(JSON.stringify({displays:[{name,address}]}),{defaultCity:''});assert.equal(parsed.records[0].name,name);assert.equal(parsed.records[0].address,address);
});
test('removal drafts use an existing catalog ID and omit supplied address/source fields',()=>{
 const u=new URL(makeSubmissionUrl({type:'removal',name:'public-display',address:'PRIVATE ADDRESS',sourceUrl:'https://private.example',holiday:'Halloween',year:2026}));
 assert.match(u.searchParams.get('title'),/Removal request/);assert.match(u.searchParams.get('body'),/public-display/);assert(!u.searchParams.get('body').includes('PRIVATE ADDRESS'));assert(!u.searchParams.get('body').includes('private.example'));
});
