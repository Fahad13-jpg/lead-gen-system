'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),rt=require('../../scripts/lead-gathering/runtime.cjs'),{install}=require('../../scripts/lead-gathering/scraper-safety.cjs');
const refs={'Prepare Actor':{id:7,org_id:2,source:'google_maps',started_at:new Date().toISOString(),max_results:5},'Parse Run':{run_id:'run',dataset_id:'dataset'},'Parse Status':{job_id:7,status:'RUNNING'},'Save Run':{id:7}};
const call=(fn,input={},overrides={})=>new Function('$input','$',`return (${rt[fn].toString()})();`)({first:()=>({json:input})},name=>({first:()=>({json:{...refs,...overrides}[name]})}));
for(const statusCode of [401,403,429,500,503])test('non-success HTTP '+statusCode+' cannot produce a successful actor/status/dataset result',()=>{
 assert.throws(()=>call('parseStart',{statusCode,body:{data:{id:'run',defaultDatasetId:'dataset'}}}),/UNCONFIRMED/);
 assert.throws(()=>call('parseStatus',{statusCode,body:{data:{id:'run',status:'SUCCEEDED'}}}),/UNCONFIRMED/);
 assert.throws(()=>call('transformResults',{statusCode,body:[]}),/UNCONFIRMED/);
});
test('saved run resumes without another start response',()=>assert.equal(call('parseStart',{statusCode:503},{'Prepare Actor':{...refs['Prepare Actor'],apify_actor_run_id:'run',dataset_id:'dataset'}}).run_id,'run'));
test('save-run ownership must hold before a poll wait',()=>{
 assert.equal(call('validateSavedRun',{id:7}).id,7);for(const row of [{},{id:8}])assert.throws(()=>call('validateSavedRun',row),/OWNERSHIP_LOST/);
});
test('heartbeat ownership loss cannot reach dataset or abort routing',()=>{
 assert.equal(call('currentWorkerState',{id:7,cancel_requested:false}).job_id,7);
 for(const row of [{},{id:8}])assert.throws(()=>call('currentWorkerState',row),/OWNERSHIP_LOST/);
});
for(const file of ['01_connect_apify.json','03_google_maps_scraper.json','03a_yellow_pages_scraper.json'])test('patch preserves SQL, notes and all existing edges: '+file,()=>{
 const w=JSON.parse(fs.readFileSync('workflows/'+file));const before=structuredClone(w);assert.equal(install(w.nodes,w.connections),1);const once=JSON.stringify(w);install(w.nodes,w.connections);assert.equal(JSON.stringify(w),once);
 for(const n of before.nodes){const after=w.nodes.find(x=>x.id===n.id);assert(after);assert.equal(after.notes,n.notes);if(n.type.endsWith('.stickyNote'))assert.deepEqual(after.parameters,n.parameters);if(n.type.endsWith('.postgres'))assert.deepEqual(after.parameters,n.parameters);}
 for(const [name,outputs] of Object.entries(before.connections))for(const [type,lists] of Object.entries(outputs))for(let i=0;i<lists.length;i++)for(const edge of lists[i]){const expected=name==='Save Run'&&edge.node==='Wait Before Poll'?{...edge,node:'Validate Saved Run Ownership'}:edge;assert(w.connections[name][type][i].some(e=>JSON.stringify(e)===JSON.stringify(expected)));}
 for(const n of w.nodes.filter(n=>n.type.endsWith('.httpRequest')&&/api\.apify\.com/.test(n.parameters.url))){assert.equal(n.parameters.options.response.response.neverError,true);if((n.parameters.method||'GET')==='GET'){assert.equal(n.maxTries,3);assert.equal(n.waitBetweenTries,3000);}if(n.name==='Start Apify Actor')assert(!n.retryOnFail);}
 if(file!=='01_connect_apify.json'){assert.equal(w.nodes.find(n=>n.name==='Wait Before Poll').parameters.amount,15);assert(w.connections['Save Run'].main[0].some(e=>e.node==='Validate Saved Run Ownership'));}
});
