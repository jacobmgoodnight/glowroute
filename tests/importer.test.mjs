import test from 'node:test';
import assert from 'node:assert/strict';
import {parseImportedStops,canonicalAddress} from '../importer.mjs';
test('paste address list with optional display names',()=>{
 const r=parseImportedStops('McBlackton Manor — 5543 Julian Ave\nStudio Fifty Horror — 262 S Audubon Rd');
 assert.equal(r.records.length,2);assert.equal(r.records[0].name,'McBlackton Manor');
 assert.match(r.records[0].address,/Indianapolis, IN 46219/);
});
test('clipboard copied webpage title followed by address',()=>{
 const r=parseImportedStops('Ouija and Spells\n5443 Julian Avenue\nAn interactive display');
 assert.equal(r.records.length,1);assert.equal(r.records[0].name,'Ouija and Spells');
});
test('spreadsheet CSV header with quoted fields and extra columns',()=>{
 const r=parseImportedStops('Display Name,Address,City,State\n"Haunted, House","318 S Webster Ave",Indianapolis,IN\n"Other","59 N Hawthorne Ln",Indianapolis,IN',{filename:'stops.csv'});
 assert.equal(r.records.length,2);assert.equal(r.records[0].name,'Haunted, House');
 assert.match(r.records[0].address,/Indianapolis, IN/);
});
test('TSV Google Sheets paste',()=>{
 const r=parseImportedStops('Name\tAddress\nHalloween Tree\t38 N Irvington Ave',{filename:'stops.tsv'});
 assert.equal(r.records.length,1);assert.equal(r.records[0].name,'Halloween Tree');
});
test('GlowRoute exported JSON',()=>{
 const r=parseImportedStops(JSON.stringify({displays:[{name:'Display',address:'5443 Julian Ave',lat:39.77,lon:-86.1}]}),{filename:'route.json'});
 assert.equal(r.records[0].lat,39.77);assert.equal(r.records[0].lon,-86.1);
});
test('deduplicate repeated address',()=>{
 const r=parseImportedStops('5543 Julian Ave\n5543 Julian Ave');
 assert.equal(r.records.length,1);assert.equal(r.duplicates,1);
});
test('rejects random text without address and invalid JSON',()=>{
 assert.equal(parseImportedStops('Cool haunted house open October 24').records.length,0);
 assert.equal(parseImportedStops('{oops',{filename:'a.json'}).records.length,0);
});
test('normalizes common street suffixes',()=>{
 assert.equal(canonicalAddress('100 S Main Street, Indianapolis, IN'),canonicalAddress('100 S Main St, Indianapolis IN'));
});
