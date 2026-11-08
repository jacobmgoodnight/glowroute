/** Private, in-browser conversion of a verified Explorer archive into a GlowRoute backup.
 * No network, storage mutation or silent media conversion. Caller must provide an
 * existing GlowRoute backup so restoration does not replace existing projects.
 */
import {makeProject, uniqueProjectName, validatePortfolio} from '../projects.mjs';
import {displayInfo, safeSourceUrl} from '../display-info.mjs';

const HOLIDAYS = new Set(['Halloween','Christmas','Other']);
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const safeYear = v => Number.isInteger(v) && v >= 2000 && v <= 2100;
const point = p => isObject(p) && Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
  Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
const pointText = p => point(p) ? String(p.lat) + ', ' + String(p.lng) : '';
const string = (value, limit) => typeof value === 'string' ? value.trim().slice(0,limit) : '';
const streetNumber = value => /\b\d{1,6}\s+\S+/.test(value);

function oldArray(archive, key) {
  const raw = archive.localStorage[key];
  if (raw === undefined) return [];
  if (typeof raw !== 'string') throw Error('Invalid Explorer storage key: ' + key);
  let value;
  try { value = JSON.parse(raw); } catch { throw Error('Unreadable Explorer storage key: ' + key); }
  if (!Array.isArray(value)) throw Error('Expected an array for Explorer storage key: ' + key);
  return value;
}

function displayAddress(d) {
  let address = string(d.address, 220);
  const town = string(d.town, 90), zip = string(d.zip, 10);
  if (town && !address.toLowerCase().includes(town.toLowerCase())) address += ', ' + town;
  if (zip && !address.includes(zip)) address += ' ' + zip;
  return address.trim().slice(0,220);
}

function detectHoliday(records, fallback) {
  const count = {Halloween:0,Christmas:0};
  for (const d of records) {
    if (d.season === 'Halloween' || d.season === 'Christmas') count[d.season]++;
  }
  if (count.Halloween > count.Christmas) return 'Halloween';
  if (count.Christmas > count.Halloween) return 'Christmas';
  return fallback;
}

function legacyNotes(memory, report, name) {
  if (!Array.isArray(memory?.comments)) return '';
  const entries = memory.comments.filter(c => typeof c?.text === 'string' && c.text.trim()).map(c => {
    const date = typeof c.date === 'string' && Number.isFinite(Date.parse(c.date)) ?
      c.date.slice(0,10) + ' — ' : '';
    return date + c.text.trim();
  });
  const chosen = [];
  let used = 0;
  for (const entry of [...entries].reverse()) {
    const available = 500 - used - (chosen.length ? 1 : 0);
    if (available <= 0) break;
    // Keep the newest entry usable without silently importing an invalid long note.
    if (entry.length > available && chosen.length) break;
    const text = entry.length <= available ? entry : entry.slice(0,Math.max(0,available-1)) + '…';
    chosen.unshift(text);
    used += text.length + (chosen.length > 1 ? 1 : 0);
    if (entry.length > available) break;
  }
  if (chosen.length < entries.length || chosen.join('\n').length > 500) {
    report.notesTruncated++;
    report.warnings.push('Some dated comments for "' + name + '" remain only in the original private archive.');
  }
  return chosen.join('\n').slice(0,500);
}

function convertDisplay(raw, context, report, overrides={}, visited=false) {
  if (!isObject(raw) || raw.demo === true) {
    report.skippedDemo += raw?.demo === true ? 1 : 0;
    return null;
  }
  const id = string(raw.id, 150), name = string(raw.name,110), address = displayAddress(raw);
  if (!id || !name || !address || !streetNumber(address)) {
    report.skippedIncomplete++;
    return null;
  }
  const valid = Number.isFinite(raw.lat) && Number.isFinite(raw.lng) &&
    Math.abs(raw.lat) <= 90 && Math.abs(raw.lng) <= 180;
  context.seenIds.add(id);
  const memory = context.memories.get(id);
  const info = displayInfo(raw);
  const sources = Array.isArray(info.sources) ? info.sources : [];
  const record = {
    ...info,
    id, name, address,
    lat:valid?raw.lat:null,lon:valid?raw.lng:null,
    geoSource:valid?'imported':null,approved:false,
    favorite:context.favorites.has(id),
    mustSee:false,visited,visitedAt:null,skipped:false,
    score:3,featured:0,
    rating:Number.isInteger(memory?.rating) && memory.rating >= 1 && memory.rating <= 5 ? memory.rating : 0,
    sourceName:sources[0]?.name || 'Holiday Display Explorer',
    sourceUrl:safeSourceUrl(sources[0]?.url),
    sourceYear:safeYear(raw.year)?raw.year:null,
    sourceHoliday:raw.season === 'Halloween' || raw.season === 'Christmas' ? raw.season : null,
    needsSeasonCheck:true,seasonCheckedYear:null
  };
  const notes = legacyNotes(memory, report, name);
  if (notes) record.visitNotes = notes;
  if (Number.isFinite(overrides[id]) && overrides[id] >= 0 && overrides[id] <= 180)
    record.viewingOverride = overrides[id];
  return record;
}

export function convertExplorerArchive(archive, existingBackup, options={}) {
  if (!isObject(archive) || archive.kind !== 'hde-private-archive' || archive.version !== 1 ||
    !isObject(archive.localStorage) || !isObject(archive.memories) ||
    !Array.isArray(archive.memories.keys) || !Array.isArray(archive.memories.values) ||
    archive.memories.keys.length !== archive.memories.values.length)
    throw Error('Choose a complete Holiday Display Explorer private archive (not an ordinary displays export).');
  const original = validatePortfolio(existingBackup,{backup:true});
  const year = Number(options.year);
  if (!safeYear(year)) throw Error('Choose a season year between 2000 and 2100.');
  const fallback = HOLIDAYS.has(options.fallbackHoliday) ? options.fallbackHoliday : 'Other';
  const local = oldArray(archive,'hde-displays'), favorites = new Set(oldArray(archive,'hde-favorites').filter(v=>typeof v==='string'));
  const tours = oldArray(archive,'hde-tours');
  let active;
  try { active = JSON.parse(archive.localStorage['hde-plan'] || 'null'); }
  catch { throw Error('Unreadable Explorer active plan. Keep the original archive unchanged.'); }
  const memories = new Map();
  archive.memories.keys.forEach((k,i)=>{if(typeof k === 'string' && isObject(archive.memories.values[i]))memories.set(k,archive.memories.values[i]);});
  const report = {
    priorGlowRouteProjects:original.projects.length,
    importedProjects:[],importedStops:0,skippedIncomplete:0,skippedDemo:0,
    missingTourStops:0,notesTruncated:0,
    originalMemories:memories.size,unmappedMemories:0,unmappedFavorites:0,
    originalPhotos:archive.memories.values.reduce((n,m)=>n+(Array.isArray(m?.photos)?m.photos.length:0),0),
    warnings:[]
  };
  if (archive.memories.storePresent !== true)
    report.warnings.push('Explorer memory database was not present in this archive; verify whether it existed on that device.');
  const context={favorites,memories,seenIds:new Set()};
  const projects=original.projects.map(p=>({...p,state:{...p.state}}));
  const names=[...projects];
  let migrated=0;
  function append(name, rawDisplays, plan=null, type='saved') {
    if (!Array.isArray(rawDisplays) || !rawDisplays.length) return;
    const originalById=new Map();
    for (const d of rawDisplays) if (isObject(d) && typeof d.id === 'string' && !originalById.has(d.id)) originalById.set(d.id,d);
    const requested=Array.isArray(plan?.ids) && plan.ids.length ? plan.ids.filter(id=>typeof id==='string') : [...originalById.keys()];
    const order=[...new Set(requested)];
    const progress=Number.isInteger(plan?.progress)?Math.max(0,Math.min(plan.progress,order.length)):0;
    const converted=[];
    for (const id of (type==='collection'?[...originalById.keys()]:order)) {
      const raw=originalById.get(id);
      if (!raw) {report.missingTourStops++;continue;}
      const item=convertDisplay(raw,context,report,plan?.overrides||{},type!=='collection'&&order.indexOf(id)<progress);
      if (item && !converted.some(d=>d.id===item.id)) converted.push(item);
    }
    if (!converted.length) return;
    // Retain order, but routing will require pin review and fresh optimization.
    const start=type==='collection'?'':pointText(plan?.start);
    const finish=type==='collection'?'':plan?.roundTrip===true ? start : pointText(plan?.end);
    const chunks=[];
    for (let i=0;i<converted.length;i+=70) chunks.push(converted.slice(i,i+70));
    for (const [i,chunk] of chunks.entries()) {
      if (projects.length>=40) throw Error('GlowRoute allows 40 saved drives. Make a smaller migration archive or remove old projects after backing them up.');
      const title=uniqueProjectName(name+(chunks.length>1?' (part '+(i+1)+')':''),names);
      const holiday=detectHoliday(rawDisplays,fallback);
      const selected=type==='collection'?[]:chunk.map(d=>d.id);
      const view=Number.isFinite(plan?.minutes)&&plan.minutes>=0&&plan.minutes<=180?plan.minutes:4;
      const p=makeProject({name:title,holiday,year,displays:chunk,selected,
        start,end:finish,mode:'duration',preset:'custom',viewMinutes:view});
      projects.push(p);names.push(p);
      report.importedProjects.push({name:title,holiday,year,stops:chunk.length,type});
      report.importedStops+=chunk.length;migrated++;
    }
  }
  for (const [i,tour] of tours.entries()) {
    if (!isObject(tour)) continue;
    append(string(tour.plan?.name,90)||'Explorer saved tour '+(i+1),tour.displays,tour.plan,'saved');
  }
  // Current active plan is recoverable only for records saved locally. Missing
  // remote-only IDs are explicitly counted and retained solely in the raw archive.
  if (isObject(active) && Array.isArray(active.ids) && active.ids.length) {
    const localIds=new Map(local.filter(d=>isObject(d)).map(d=>[d.id,d]));
    append('Explorer active tour',active.ids.map(id=>localIds.get(id)).filter(Boolean),active,'active');
  }
  // Capture the entire personal library too, including displays never in a tour.
  append('Explorer saved displays',local,null,'collection');
  report.unmappedMemories=[...memories.keys()].filter(id=>!context.seenIds.has(id)).length;
  report.unmappedFavorites=[...favorites].filter(id=>!context.seenIds.has(id)).length;
  if (report.unmappedMemories) report.warnings.push(String(report.unmappedMemories)+' memory records could not be linked to exported saved displays/tours and remain only in the original private archive.');
  if (report.unmappedFavorites) report.warnings.push(String(report.unmappedFavorites)+' favorites had no recoverable display in this archive; add them manually from the old app.');
  if (!migrated) report.warnings.push('No eligible real-address displays or tours were found in this archive.');
  if (report.originalPhotos) report.warnings.push(String(report.originalPhotos)+' personal photos remain in the original private archive; GlowRoute has no photo restore/gallery yet.');
  if (report.missingTourStops) report.warnings.push(String(report.missingTourStops)+' tour references lacked recoverable display snapshots and were not transferred.');
  if (report.skippedIncomplete) report.warnings.push(String(report.skippedIncomplete)+' records without usable names, IDs or street addresses were skipped.');
  report.warnings.push('Recheck the start/finish coordinates and each imported map pin. Old pins are not automatically approved.');
  report.warnings.push('Old departure times, timezone context and original optimized road geometry cannot be restored; recalculate routes.');
  const backup={version:2,exportedAt:new Date().toISOString(),projects,activeId:original.activeId};
  validatePortfolio(backup,{backup:true});
  if (new Blob([JSON.stringify(backup)]).size>2_000_000)
    throw Error('Merged backup exceeds GlowRoute’s 2 MB restore limit. Split the migration and keep both original backups.');
  return {backup,report};
}
