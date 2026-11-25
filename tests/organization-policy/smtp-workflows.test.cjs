'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const{provision,build}=require('../../scripts/sender-connections/smtp-workflows.cjs');
const connection={org_id:7,connection_id:'smtp_'+'a'.repeat(32),credential_ref:'smtp-ref',inbox_credential_ref:'imap-ref',project_id:'project',state:'pending_check'};
function fixture(){let next=0;const records=new Map(),journals=new Map(),calls=[];const ports={runtimeReady:async()=>true,projectFor:async()=>connection.project_id,readJournal:async op=>journals.get(op),writeJournal:async(op,value)=>journals.set(op,value),request:async(method,url,body)=>{calls.push({method,url});if(url==='/workflows/managedSmtpcheck')return{nodes:[{type:'CUSTOM.managedSender',parameters:{operation:'check'},credentials:{postgres:{id:'db-ref'}}}]};if(method==='GET'&&url.startsWith('/workflows?'))return{data:[...records.values()]};if(method==='POST'&&url==='/workflows'){const w={...structuredClone(body),id:'created-'+ ++next,active:false};records.set(w.id,w);return w;}const id=url.split('/')[2],w=records.get(id);if(method==='POST'&&url.endsWith('/activate')){w.active=true;return structuredClone(w);}if(w)return structuredClone(w);throw Error('NOT_FOUND');}};return{ports,records,journals,calls};}
test('provisioning preserves notes and binds credentials; only check schedule activates',async()=>{
 const f=fixture(),r=await provision(connection,f.ports);assert.equal(r.sending_activated,false);assert.equal(f.records.size,3);const active=[...f.records.values()].filter(w=>w.active);assert.equal(active.length,1);assert.equal(active[0].nodes.find(n=>n.type==='CUSTOM.managedSender').parameters.operation,'check');
 for(const w of f.records.values()){const node=w.nodes.find(n=>n.type==='CUSTOM.managedSender');assert.equal(node.credentials.smtp.id,connection.credential_ref);assert.equal(node.parameters.release,'null');assert(w.nodes.some(n=>n.type==='n8n-nodes-base.stickyNote'));assert.equal(w.settings.saveDataErrorExecution,'none');}
 const before=f.calls.filter(c=>c.method==='POST').length;await provision(connection,f.ports);assert.equal(f.calls.filter(c=>c.method==='POST').length,before,'recheck duplicated workflows');
});
test('ambiguous create is reconciled without replay and unknown outcomes stay locked',async()=>{
 const f=fixture(),request=f.ports.request;f.ports.request=async(method,url,body)=>{const r=await request(method,url,body);if(method==='POST'&&url==='/workflows')throw Error('lost response');return r;};await provision(connection,f.ports);assert.equal(f.records.size,3);
 const g=fixture();g.ports.request=async(method,url,body)=>{if(method==='POST'&&url==='/workflows'){g.calls.push({method,url});throw Error('timeout');}return g.base(method,url,body);};g.base=fixture().ports.request;
 await assert.rejects(provision(connection,g.ports),/CREATE_UNCONFIRMED/);await assert.rejects(provision(connection,g.ports),/CREATE_UNCONFIRMED/);assert.equal(g.calls.length,1);
});
test('wrong project, changed workflow or unmatched runtime cannot activate a checker',async()=>{
 const f=fixture();f.ports.projectFor=async()=> 'other';await assert.rejects(provision(connection,f.ports),/PROJECT_MISMATCH/);assert(!f.calls.some(c=>c.url.endsWith('/activate')));
 const g=fixture();g.ports.runtimeReady=async()=>false;await assert.rejects(provision(connection,g.ports),/RUNTIME_REVIEW/);assert.equal(g.calls.length,0);
 const h=fixture(),bad=build(connection,{id:'db-ref'})[0];h.records.set('bad',{...bad,id:'bad',connections:{},active:false});await assert.rejects(provision(connection,h.ports),/WORKFLOW_CHANGED/);assert(!h.calls.some(c=>c.url.endsWith('/activate')));
});

test('ambiguous checker activation is reconciled or held without a blind activation replay',async()=>{
 for(const accepted of [false,true]){const f=fixture(),base=f.ports.request;let attempts=0;f.ports.request=async(method,url,body)=>{if(method==='POST'&&url.endsWith('/activate')){attempts++;if(accepted)await base(method,url,body);throw Error('activation response lost');}return base(method,url,body);};
  if(accepted){await provision(connection,f.ports);await provision(connection,f.ports);}
  else{await assert.rejects(provision(connection,f.ports),/ACTIVATION_UNCONFIRMED/);await assert.rejects(provision(connection,f.ports),/ACTIVATION_UNCONFIRMED/);}
  assert.equal(attempts,1);assert([...f.records.values()].filter(w=>w.nodes.some(n=>n.type==='CUSTOM.managedSender'&&['send','poll'].includes(n.parameters.operation))).every(w=>w.active===false));
 }
});
