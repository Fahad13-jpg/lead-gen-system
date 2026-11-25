'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{install}=require('../../scripts/workflow-queue-guards.cjs');
const files=['02_main_orchestrator.json','03b_email_scraper.json','04_data_cleaning.json','05_email_validation(Batch).json','06A_basic_enrichment.json'];
for(const file of files)test('empty queue is explicit and safe: '+file,()=>{
 const w=JSON.parse(fs.readFileSync('workflows/'+file)),before=JSON.stringify(w.connections),notes=w.nodes.map(n=>({id:n.id,notes:n.notes,content:n.type.endsWith('.stickyNote')?n.parameters.content:null}));
 assert.equal(install(w.nodes),1);const first=JSON.stringify(w);assert.equal(install(w.nodes),1);assert.equal(JSON.stringify(w),first);
 const claim=w.nodes.find(n=>n.alwaysOutputData&&/Claim|Drain/.test(n.name)),code=w.nodes.find(n=>n.parameters.jsCode?.startsWith('// An empty claim'));
 assert(claim);assert(code);const run=new Function('$input',code.parameters.jsCode);
 for(const items of [[],[{json:{}}]])assert.deepEqual(run({all:()=>items}),[]);
 assert.equal(JSON.stringify(w.connections),before);assert.deepEqual(w.nodes.map(n=>({id:n.id,notes:n.notes,content:n.type.endsWith('.stickyNote')?n.parameters.content:null})),notes);
});
test('valid contact task passes through and malformed nonempty claims still fail',()=>{
 const w=JSON.parse(fs.readFileSync('workflows/03b_email_scraper.json'));install(w.nodes);const n=w.nodes.find(n=>n.name==='Validate Worker Arguments'),run=new Function('$input',n.parameters.jsCode),task={id:42,lease:'a'.repeat(32)};
 assert.deepEqual(run({all:()=>[{json:{task}}]}),[{json:task,pairedItem:{item:0}}]);assert.throws(()=>run({all:()=>[{json:{task:{id:'bad',lease:'bad'}}}]}));
});
test('live implicit all-items mode becomes explicit without changing its meaning',()=>{
 const w=JSON.parse(fs.readFileSync('workflows/06A_basic_enrichment.json'));delete w.nodes.find(n=>n.name==='Validate Lease').parameters.mode;
 install(w.nodes);assert.equal(w.nodes.find(n=>n.name==='Validate Lease').parameters.mode,'runOnceForAllItems');
 w.nodes.find(n=>n.name==='Validate Lease').parameters.mode='runOnceForEachItem';assert.throws(()=>install(w.nodes),/SHAPE_CHANGED/);
});
