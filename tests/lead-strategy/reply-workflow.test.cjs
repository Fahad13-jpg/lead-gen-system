'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const w=JSON.parse(fs.readFileSync('workflows/09_reply_detection.json','utf8'));
const n=name=>w.nodes.find(n=>n.name===name);
test('reply workflow closed and legacy AI/write branches unreachable',()=>{
 assert.equal(w.active,false);assert.equal(new Function(n('Bound Mailbox Gate').parameters.jsCode)(),null);
 const reachable=new Set();function walk(name){if(reachable.has(name))return;reachable.add(name);for(const outs of Object.values(w.connections[name]||{}))for(const group of outs)for(const edge of group)walk(edge.node);}
 walk('Schedule Trigger');assert(reachable.has('Persist Reply Scan'));
 for(const name of ['AI - Reply Analyzer & Lead Qualifier','Insert Reply Record','Update Lead with Reply','Stop All Outreach']){assert(!reachable.has(name));assert.equal(n(name).disabled,true);}
 assert(!n('Get Recent Outreach Emails').parameters.query.includes('user_id'));
 assert(n('Get Recent Outreach Emails').parameters.query.includes('c.org_id=a.org_id'));
});
test('explicit code modes, zero row preservation and no write retries',()=>{
 for(const node of w.nodes){if(node.type==='n8n-nodes-base.code'){assert(['runOnceForEachItem','runOnceForAllItems'].includes(node.parameters.mode));assert.doesNotThrow(()=>new Function('$json','$','$input',node.parameters.jsCode));}if(node.type==='n8n-nodes-base.postgres')assert.equal(node.alwaysOutputData,true);}
 assert.equal(n('Persist Reply Scan').retryOnFail,false);
 assert.equal(n('Schedule Trigger').parameters.rule.interval[0].minutesInterval,2);
 const email=JSON.parse(fs.readFileSync('workflows/07a_email_outreach_executor.json','utf8'));
 assert.equal(email.nodes.find(n=>n.name==='Schedule Trigger').parameters.rule.interval[0].minutesInterval,5);
});
test('workflow refuses binding to a different actual Gmail credential',()=>{
 const run=new Function('$json','$',n('Bind Reply Activity').parameters.jsCode);
 assert.throws(()=>run({},()=>({item:{json:{credential_ref:'wrong'}}})),/WORKFLOW_CREDENTIAL_MISMATCH/);
});
test('empty conversation produces no fabricated reply; unknown message goes to review',()=>{
 const run=new Function('$json','$','Buffer',n('Match Conversation Replies').parameters.jsCode);
 const row={binding:{org_id:1,email:'sales@example.org',credential_ref:'mock'},activity:{activity_id:7,external_id:'1234abcd'},original:{id:'1234abcd',threadId:'abcd1234'}};
 const context=()=>({item:{json:row}});
 let result=run({id:'abcd1234',messages:[]},context,Buffer).json;
 assert.deepEqual(result.events,[]);assert.deepEqual(result.reviews,[]);
 result=run({id:'abcd1234',messages:[{id:'bbbb1234'}]},context,Buffer).json;
 assert.equal(result.events.length,0);assert.equal(result.reviews.length,1);
 assert.throws(()=>run({id:'wrong',messages:[]},context,Buffer),/CONVERSATION_UNVERIFIED/);
});
test('persistence rejection cannot be reported as success',()=>{
 const run=new Function('$json',n('Check Reply Persistence').parameters.jsCode);
 assert.throws(()=>run({result:{saved:false}}),/REPLY_SCAN_NOT_PERSISTED/);
 assert.deepEqual(run({result:{saved:true}}),{json:{saved:true}});
});
