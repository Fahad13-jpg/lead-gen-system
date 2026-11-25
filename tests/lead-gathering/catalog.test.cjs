'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const catalog=require('../../scripts/lead-gathering/catalog.cjs').workflows;
function generate(file){
 const writes=new Map(),fake={mkdirSync(){},existsSync:p=>writes.has(p)||p!=='.local/gathering-api-key'&&fs.existsSync(p),
  readFileSync:p=>{if(writes.has(p))return writes.get(p);assert(String(p).startsWith('workflows/'),'no private files read in generator check');return fs.readFileSync(p,'utf8');},writeFileSync:(p,value)=>writes.set(p,String(value))};
 vm.runInNewContext(fs.readFileSync('scripts/lead-gathering/'+file,'utf8'),{require:id=>id==='node:fs'?fake:id==='node:crypto'?require('node:crypto'):id==='./catalog.cjs'?{workflows:catalog}:(()=>{throw Error('UNEXPECTED_REQUIRE');})(),structuredClone,process:{argv:['node','fixture','--mock'],env:{GATHERING_TEST_MOCK:'true'}},console:{log(){}}});
 return writes;
}
test('private import preparation contains all four workers, each inactive, from one source inventory',()=>{
 assert.equal(new Set(catalog.map(w=>w.id)).size,catalog.length);assert.equal(new Set(catalog.map(w=>w.file)).size,catalog.length);
 const out=JSON.parse(generate('prepare-deployment.cjs').get('.local/gathering-deploy/workflows.json'));
 assert.equal(out.length,6);assert(out.every(w=>w.active===false));assert.deepEqual(out.map(w=>w.id),catalog.map(w=>w.id));assert.equal(catalog.filter(w=>w.source).length,4);
});
test('isolated test preparation includes Facebook and Yelp and stubs every provider request',()=>{
 const out=JSON.parse(generate('prepare-webhook-test.cjs').get('.local/gathering-deploy/webhook-test.json'));
 assert.equal(out.length,5);assert(out.every(w=>w.active===false));
 for(const [i,entry]of catalog.filter(w=>w.source).entries()){
  const w=out[i+1];assert(w.nodes.find(n=>n.name==='Claim Job').parameters.query.includes("'"+entry.source+"'"));
  assert(!w.nodes.some(n=>n.type.endsWith('.httpRequest')&&String(n.parameters.url).includes('api.apify.com')));
  assert(w.nodes.filter(n=>n.type.endsWith('.postgres')).every(n=>n.credentials.postgres.id==='gatheringTestPg'));
  const job={id:1,org_id:900001,source:entry.source,max_results:5,candidate_limit:15,request_settings:{require_contact:true}};
  const fixture=new Function('$',w.nodes.find(n=>n.name==='Get Dataset').parameters.jsCode)(()=>({first:()=>({json:job})}));
  const rt=require('../../scripts/lead-gathering/runtime.cjs');const r=new Function('$input','$',`return (${rt.transformResults.toString()})();`)({first:()=>({json:fixture})},()=>({first:()=>({json:job})}));assert(r.rows.length>0,entry.source+' fixture must match its own output schema');
 }
});
test('test bootstrap activates the generated inventory only inside its isolated SQLite server',()=>{
 const calls=[],workflows=catalog.slice(1).map((w,i)=>({id:'gatheringWebhookTest'+i}));
 const fakeFs={mkdirSync(){},chmodSync(){},unlinkSync(){},writeFileSync(){},openSync:()=>42,readFileSync:p=>{assert.equal(p,'/tmp/gathering-webhook-test.json');return JSON.stringify(workflows);}};
 const cp={spawnSync:(command,args,options)=>{calls.push({command,args,env:options.env});return{status:0,stdout:'',stderr:''};},spawn:(_command,_args,options)=>{assert.equal(options.env.DB_TYPE,'sqlite');assert.equal(options.env.N8N_PORT,'5680');return{pid:42,unref(){}};}};
 vm.runInNewContext(fs.readFileSync('scripts/lead-gathering/bootstrap-webhook-test.cjs','utf8'),{require:id=>id==='node:fs'?fakeFs:cp,process:{env:{}},console:{log(){}}});
 const activated=calls.filter(c=>c.args[0]==='update:workflow');assert.equal(activated.length,workflows.length);assert(activated.every(c=>c.env.DB_TYPE==='sqlite'&&c.env.N8N_PORT==='5680'));
});
