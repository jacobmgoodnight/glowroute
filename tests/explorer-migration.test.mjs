import test from 'node:test';
import assert from 'node:assert/strict';
import {makeProject, validatePortfolio} from '../projects.mjs';
import {convertExplorerArchive} from '../tools/explorer-migration.mjs';

const oldDisplay=(id,overrides={})=>({
  id,name:'Display '+id,address:'123 Main Street',town:'Irvington, Indianapolis, IN',
  zip:'46219',lat:39.77,lng:-86.11,season:'Halloween',year:2025,
  type:'Residential yard display',sources:[{name:'Manual',url:'https://example.org/display/'+id}],
  ...overrides
});
function archive({displays=[],favorites=[],tours=[],plan=null,memories={}}={}) {
  return {kind:'hde-private-archive',version:1,localStorage:{
    'hde-displays':JSON.stringify(displays),
    'hde-favorites':JSON.stringify(favorites),
    'hde-tours':JSON.stringify(tours),
    'hde-plan':JSON.stringify(plan),
    'hde-preferences':JSON.stringify({season:'Halloween',demo:false})
  },memories:{storePresent:true,keys:Object.keys(memories),values:Object.values(memories)}};
}
function previous(){
  const project=makeProject({id:'already-present',name:'My 2026 drive',holiday:'Christmas',year:2026,
    displays:[{id:'keep',name:'Keep this',address:'456 Oak Street',lat:null,lon:null}],selected:[]});
  return {version:2,exportedAt:'2026-11-07T00:00:00.000Z',projects:[project],activeId:project.id};
}
test('merges saved Explorer tours into pre-existing GlowRoute projects without overwriting them',()=>{
  const a=oldDisplay('a'),b=oldDisplay('b',{name:'Another display',address:'789 Elm Lane'});
  const input=archive({displays:[a,b],favorites:['b'],tours:[{
    plan:{ids:['b','a'],name:'Irvington Halloween',start:{lat:39.8,lng:-86.1},
      end:null,roundTrip:true,minutes:7,progress:1,overrides:{a:12}},
    displays:[a,b]
  }],memories:{b:{rating:5,comments:[{id:'c1',date:'2025-10-31T16:00:00Z',text:'Great lights'}],
    photos:[{id:'p1',image:'data:image/jpeg;base64,Zm9v',caption:'ours'}]}}});
  const original=previous(),before=JSON.stringify(original),archiveBefore=JSON.stringify(input);
  const {backup,report}=convertExplorerArchive(input,original,{year:2026,fallbackHoliday:'Christmas'});
  assert.equal(JSON.stringify(original),before);
  assert.equal(JSON.stringify(input),archiveBefore);
  assert.equal(backup.activeId,'already-present');
  assert.equal(backup.projects[0].state.displays[0].name,'Keep this');
  assert.equal(backup.projects.length,3);
  const tour=backup.projects[1],collection=backup.projects[2];
  assert.equal(tour.holiday,'Halloween');
  assert.deepEqual(tour.state.selected,['b','a']);
  assert.equal(tour.state.start,'39.8, -86.1');
  assert.equal(tour.state.end,tour.state.start);
  assert.equal(tour.state.viewMinutes,7);
  assert.equal(tour.state.displays[0].favorite,true);
  assert.equal(tour.state.displays[0].rating,5);
  assert.match(tour.state.displays[0].visitNotes,/2025-10-31 — Great lights/);
  assert.equal(tour.state.displays[0].visited,true);
  assert.equal(tour.state.displays[0].approved,false);
  assert.equal(tour.state.displays[0].needsSeasonCheck,true);
  assert.equal(tour.state.displays[0].geoSource,'imported');
  assert.equal(tour.state.displays[1].viewingOverride,12);
  assert.equal(tour.state.displays[1].sourceYear,2025);
  assert.deepEqual(collection.state.selected,[]);
  assert.equal(report.originalPhotos,1);
  assert.equal(report.importedProjects.length,2);
  assert.ok(report.warnings.some(s=>s.includes('photos remain')));
  assert.deepEqual(validatePortfolio(backup,{backup:true}).activeId,'already-present');
});
test('rejects incomplete/ordinary archive and invalid existing GlowRoute backups',()=>{
  assert.throws(()=>convertExplorerArchive({displays:[oldDisplay('a')]},previous(),{year:2026}),/complete Holiday Display Explorer/);
  assert.throws(()=>convertExplorerArchive(archive(),{projects:[],version:2},{year:2026}),/Not a valid GlowRoute/);
  assert.throws(()=>convertExplorerArchive(archive(),previous(),{year:1800}),/Choose a season year/);
  const broken=archive();broken.localStorage['hde-tours']='{not json';
  assert.throws(()=>convertExplorerArchive(broken,previous(),{year:2026}),/Unreadable Explorer storage key/);
});
test('never imports fictional displays, city-only references or fabricates verified pins',()=>{
  const input=archive({displays:[
    oldDisplay('demo',{demo:true}),
    oldDisplay('city',{address:'Indianapolis',town:'',zip:'',lat:null,lng:null}),
    oldDisplay('good',{lat:null,lng:null})
  ]});
  const {backup,report}=convertExplorerArchive(input,previous(),{year:2026});
  const records=backup.projects[1].state.displays;
  assert.deepEqual(records.map(d=>d.id),['good']);
  assert.equal(records[0].lat,null);
  assert.equal(records[0].approved,false);
  assert.equal(report.skippedDemo,1);
  assert.equal(report.skippedIncomplete,1);
});
test('reports missing active route stops and retains original full dated notes in private archive',()=>{
  const a=oldDisplay('a');
  const input=archive({
    displays:[a],plan:{ids:['a','lost'],progress:1,start:{lat:39.7,lng:-86.1},roundTrip:false},
    memories:{a:{rating:3,photos:[],comments:[
      {id:'1',date:'2025-10-31',text:'A'.repeat(400)},
      {id:'2',date:'2026-10-31',text:'B'.repeat(400)}
    ]}}
  });
  const {backup,report}=convertExplorerArchive(input,previous(),{year:2026});
  assert.equal(report.missingTourStops,1);
  assert.ok(report.notesTruncated>0);
  assert.ok(backup.projects[1].state.displays[0].visitNotes.length<=500);
  assert.equal(backup.projects[1].state.displays[0].visited,true);
  assert.ok(input.memories.values[0].comments[0].text.length===400);
});
test('blocks an unsafe portfolio overflow instead of overwriting or silently losing projects',()=>{
  const p=previous().projects[0];
  const many={version:2,projects:Array.from({length:40},(_,i)=>({...p,id:'p-'+i,name:'Project '+i})),activeId:'p-0'};
  assert.throws(()=>convertExplorerArchive(archive({displays:[oldDisplay('a')]}),many,{year:2026}),/40 saved drives/);
});
