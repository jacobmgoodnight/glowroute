import test from 'node:test';
import assert from 'node:assert/strict';
import {displayInfo,viewingMinutes} from '../display-info.mjs';
import {departureInstants,operatingStatus,buildSchedule} from '../schedule.mjs';
import {discover,discoveryEntries,suggestCandidates,distanceMiles} from '../discovery.mjs';
import {selectWithinBudget} from '../tour.mjs';
import {validateCandidates,sourceFreshness} from '../candidates.mjs';
import {compareCatalogToProject,applyCatalogToProject} from '../directory.mjs';
import {makeProject,cloneProject,validatePortfolio} from '../projects.mjs';
import {parseImportedStops,importedDisplay} from '../importer.mjs';
const stop=(id,extra={})=>({id,name:`Display ${id}`,address:`${100+Number(id)||100} Main St, Denver, CO`,lat:39.73,lon:-104.95,approved:true,holiday:'Christmas',year:2026,...extra});
const hours={startDate:'2026-10-01',endDate:'2026-10-31',timezone:'America/New_York',hours:[{days:[6],open:'18:00',close:'02:00'}]};
const snapshot=(entries)=>({schemaVersion:1,kind:'review-candidates',fetchedAt:'2026-10-29T10:00:00Z',entries});
const candidate=(id,extra={})=>({...stop(id),locationPrecision:'street',sources:[{name:'Owner',url:`https://public.org/${id}`,recordId:id}],...extra});

test('optional display facts remain unknown, bounded and URL-safe; malformed schedules stay unknown',()=>{
 assert.deepEqual(displayInfo({}),{});assert.deepEqual(displayInfo({cost:'guess',music:'true',viewingMinutes:-1}),{});
 const d=displayInfo({sources:[{url:'javascript:alert(1)'},{name:'Owner',url:'https://public.org'}],parking:'x'.repeat(500),schedule:{...hours,hours:[...hours.hours,{days:[8],open:'xx',close:'yy'}]}});
 assert.equal(d.sources.length,1);assert.equal(d.parking.length,300);assert.equal(d.schedule,undefined);
 assert.equal(viewingMinutes({viewingMinutes:12,viewingOverride:0},4),0);
});
test('DST gaps reject and repeated departure times have two explicit instants',()=>{
 assert.throws(()=>departureInstants('2026-03-08T02:30','America/New_York'),/does not exist/);
 const choices=departureInstants('2026-11-01T01:30','America/New_York');assert.equal(choices.length,2);assert.equal(choices[1]-choices[0],3600000);
 assert.equal(new Date(departureInstants('2026-10-31T18:00','America/Indiana/Indianapolis')[0]).toISOString(),'2026-10-31T22:00:00.000Z');
 assert.throws(()=>departureInstants('2026-02-30T18:00','UTC'));assert.throws(()=>departureInstants('2026-01-01T12:00','Bad/Zone'));
});
test('operating windows use local timezone, overnight start day and final seasonal spillover',()=>{
 const d={schedule:hours,needsSeasonCheck:true};
 for(const time of ['2026-10-31T23:00:00Z','2026-11-01T05:30:00Z','2026-11-01T06:30:00Z'])assert.equal(operatingStatus(d,time,{year:2026}).state,'expected-open');
 assert.equal(operatingStatus(d,'2026-11-01T07:00:00Z',{year:2026}).state,'expected-closed');
 assert.match(operatingStatus(d,'2026-10-31T23:00Z',{year:2026}).detail,/unverified/);
 assert.equal(operatingStatus(d,'2027-10-31T23:00Z',{year:2027}).state,'unknown');
 assert.equal(operatingStatus({...d,conflicts:['hours conflict']},'2026-10-31T23:00Z',{year:2026}).state,'unknown');
 assert.equal(operatingStatus({},'2026-10-31T23:00Z').state,'unknown');
 const christmas={schedule:{startDate:'2026-12-01',endDate:'2027-01-06',timezone:'Europe/London',hours:[{days:[0,1,2,3,4,5,6],open:'17:00',close:'22:00'}]}};
 assert.equal(operatingStatus(christmas,'2027-01-03T18:00Z',{year:2026}).state,'expected-open');
 assert.equal(operatingStatus(christmas,'2027-12-03T18:00Z',{year:2027}).state,'unknown');
});
test('timeline uses mapped legs when available, stop overrides and a fixed return endpoint',()=>{
 const points=[{},stop('1',{viewingMinutes:12}),stop('2',{viewingOverride:3}),{}],durations=Array.from({length:4},()=>Array(4).fill(60));
 const departure=Date.parse('2026-12-20T23:00Z'),s=buildSchedule({points,order:[2,1],durations,legDurations:[120,180,240],departure,defaultMinutes:4,year:2026});
 assert.equal(s.rows[0].arrival,departure+120000);assert.equal(s.rows[0].departure,departure+300000);
 assert.equal(s.viewingSeconds,900);assert.equal(s.drivingSeconds,540);assert.equal(s.finish,departure+1440000);assert.equal(s.basis,'mapped road legs');
 const reordered=buildSchedule({points,order:[1,2],durations,departure,defaultMinutes:4});assert.equal(reordered.rows[0].viewingSeconds,720);
 assert.equal(buildSchedule({points,order:[1,2],durations:null,departure}),null);
});
test('viewing duration overrides influence budget selection while keeping mandatory stops',()=>{
 const matrix=Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>i===j?0:60));
 const result=selectWithinBudget(matrix,[stop('1',{mustSee:true,viewingOverride:12}),stop('2',{viewingOverride:10})],20,3);
 assert.deepEqual(result.indices,[1]);assert.equal(result.viewingSeconds,720);
 assert.throws(()=>selectWithinBudget(matrix,[stop('1',{mustSee:true,viewingOverride:25}),stop('2')],20,3),/must-see/);
});
test('radius and nearest use known coordinates only; city-level records never gain a distance',()=>{
 const center={lat:39.73,lon:-104.95},entries=[stop('1'),stop('2',{lat:40.73}),stop('3',{lat:null}),stop('4',{locationPrecision:'city'})];
 assert.deepEqual(discover(entries,{center,radius:5,sort:'nearest'}).map(d=>d.id),['1']);
 assert.equal(discover(entries,{radius:5}).length,0);assert.equal(discover(entries).length,4);assert.equal(distanceMiles(center,center),0);
 assert.equal(discover([stop('1',{music:true,cost:'Free',access:'Both'})],{music:true,cost:'Free',access:'Drive-by'}).length,1);
 assert.equal(discover([stop('1')],{family:true}).length,0);
});
test('suggestions preserve outside-radius mandatory stops, preference and reliable season/location constraints',()=>{
 const mandatory=stop('8',{mustSee:true}),entries=[stop('1',{favorite:true}),stop('2',{approved:false}),stop('3',{year:2025}),stop('4',{locationPrecision:'city'})];
 assert.deepEqual(suggestCandidates(entries,[mandatory],{holiday:'Christmas',year:2026}).map(d=>d.id),['8','1']);
 assert.throws(()=>suggestCandidates(entries,[stop('9',{approved:false})],{holiday:'Christmas',year:2026}),/Must-see/);
 assert.throws(()=>suggestCandidates([] ,[],{holiday:'Christmas',year:2026}),/No eligible/);
 const rechecked=stop('5',{sourceYear:2025,needsSeasonCheck:false,seasonCheckedYear:2026});assert.equal(suggestCandidates([rechecked],[],{holiday:'Christmas',year:2026})[0].id,'5');
 assert.throws(()=>suggestCandidates([{...rechecked,seasonCheckedYear:2025}],[],{holiday:'Christmas',year:2026}),/No eligible/);
 assert.equal(suggestCandidates(entries,[mandatory],{holiday:'Christmas',year:2026,max:1}).length,1);
});
test('saved project pins join directory records by exact address, never nearby coordinates',()=>{
 const rows=discoveryEntries([candidate('1'),candidate('2')],[stop('1',{favorite:true,visitNotes:'PRIVATE'})],{holiday:'Christmas',year:2026});
 assert.equal(rows.length,2);assert.equal(rows[0].favorite,true);assert.equal(rows[1].projectDisplayId,undefined);
});
test('snapshots retain original seasons and multiple references, flag conflicts and never infer withheld locations',()=>{
 const rows=validateCandidates(snapshot([candidate('1',{year:2025,cost:'Free'}),candidate('other',{address:'101 Main Street, Denver CO',year:2025,cost:'Paid'}),candidate('city',{address:'',town:'Denver',lat:39.73,lon:-104.95})]));
 assert.equal(rows.entries.length,2);assert.equal(rows.duplicates,1);assert.equal(rows.entries[0].sources.length,2);assert.match(rows.entries[0].conflicts.join(),/cost/);assert.equal(rows.entries[0].year,2025);assert.equal(rows.entries[0].needsSeasonCheck,true);
 assert.equal(rows.entries[1].lat,null);assert.equal(rows.entries[1].address,'');
 assert.throws(()=>validateCandidates(snapshot([candidate('1'),candidate('1',{address:'999 Other St'})])),/source record/);
 assert.throws(()=>validateCandidates(snapshot([candidate('1',{sources:[{url:'javascript:alert(1)'}]})])));
 assert.match(sourceFreshness('2025-10-01',new Date('2026-10-29')),/Stale/);
});
test('legacy discovery landmarks stay unlocated and source IDs stay stable if listing URLs change',()=>{
 const a=candidate('1',{address:'Monument Circle, Indianapolis',season:'Christmas',holiday:undefined,lat:null,lon:null});
 const first=validateCandidates([a]).entries[0];assert.equal(first.address,'');assert.match(first.notes,/Monument Circle/);assert.equal(first.lat,null);
 const next=validateCandidates([{...a,sources:[{...a.sources[0],url:'https://public.org/renamed-page'}]}]).entries[0];assert.equal(first.id,next.id);
 const imported=importedDisplay(parseImportedStops(JSON.stringify([{...a,address:'100 Main St, Indianapolis, IN',year:2025,lng:-86.1,lat:39.7}])).records[0],{id:'new',projectYear:2026,projectHoliday:'Christmas'}).display;
 assert.equal(imported.sourceYear,2025);assert.equal(imported.sourceName,'Owner');assert.equal(imported.sourceUrl,'https://public.org/1');assert.equal(imported.lon,-86.1);assert.equal(imported.needsSeasonCheck,true);
});
test('reviewed source conflicts preserve verified address, pin, notes, ratings and all references',()=>{
 const old=stop('1',{catalogId:'catalog-one',rating:5,favorite:true,mustSee:true,visitNotes:'PRIVATE',geoSource:'manual',schedule:hours,sources:[{name:'Old',url:'https://public.org/old',recordId:'a'}]}),project=makeProject({holiday:'Christmas',year:2026,displays:[old],selected:['1']});
 const e=candidate('catalog-one',{id:'catalog-one',address:'999 Other St, Denver CO',schedule:{...hours,endDate:'2026-10-30'}});
 const action=compareCatalogToProject(project,[e])[0];assert.equal(action.warnings.length,2);
 const next=applyCatalogToProject(project,[{...action,include:true}]).displays[0];
 assert.equal(next.address,old.address);assert.equal(next.lat,old.lat);assert.equal(next.rating,5);assert.equal(next.visitNotes,'PRIVATE');assert.equal(next.sources.length,2);assert.equal(next.approved,true);
});
test('reviewed source coordinates fill missing pins but never upgrade or replace an existing automatic/manual pin',()=>{
 const e=candidate('catalog-one');
 for(const old of [stop('1',{approved:true}),stop('1',{approved:false}),stop('1',{lat:null,lon:null,approved:false})]){
  const project=makeProject({holiday:'Christmas',year:2026,displays:[{...old,address:e.address}],selected:['1']});
  const action=compareCatalogToProject(project,[e])[0],d=applyCatalogToProject(project,[{...action,include:true}]).displays[0];
  assert.equal(d.approved,old.approved);
  if(old.lat===null){assert.equal(d.lat,e.lat);assert.equal(d.locationPrecision,'street');}
  else {assert.equal(d.lat,old.lat);assert.equal(d.locationPrecision,undefined);}
 }
 const noPoint=validateCandidates(snapshot([candidate('1',{lat:null,lon:null})])).entries[0];assert.equal(noPoint.locationPrecision,'unknown');
});
test('retaining extra attribution does not cause the same source-only update on every refresh',()=>{
 const e=candidate('1'),project=makeProject({holiday:'Christmas',year:2026,displays:[{...stop('1'),address:e.address,sources:[{name:'Prior owner reference',url:'https://public.org/prior',recordId:'prior'}]}]});
 const action=compareCatalogToProject(project,[e])[0];project.state.displays=applyCatalogToProject(project,[{...action,include:true}]).displays;
 assert.equal(project.state.displays[0].sources.length,2);assert.equal(compareCatalogToProject(project,[e])[0].kind,'already');
});
test('rich optional metadata and per-stop overrides survive stop and portfolio backups and next-season copy',()=>{
 const d=stop('1',{schedule:hours,viewingOverride:12,cost:'Free',sources:[{name:'Owner',url:'https://public.org/1'}],visitNotes:'PRIVATE',favorite:true});
 const project=makeProject({holiday:'Christmas',year:2026,displays:[d],selected:['1'],departure:'2026-12-20T18:00',departureZone:'America/Denver'});
 const data=validatePortfolio(JSON.parse(JSON.stringify({version:2,projects:[project],activeId:project.id})),{backup:true});assert.equal(data.projects[0].state.displays[0].viewingOverride,12);
 const record=parseImportedStops(JSON.stringify({displays:[d]})).records[0],imported=importedDisplay(record,{id:'new'}).display;assert.deepEqual(imported.schedule,hours);assert.equal(imported.cost,'Free');assert.equal(imported.visitNotes,'PRIVATE');
 const next=cloneProject(project,{year:2027});assert.equal(next.state.departure,'');assert.equal(next.state.displays[0].favorite,true);assert.equal(next.state.displays[0].viewingOverride,12);
});
