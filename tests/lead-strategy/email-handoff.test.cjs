'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const c=require('../../scripts/lead-strategy/v2/contract.cjs'),f=require('../../scripts/lead-strategy/v2/fixtures.cjs'),e=require('../../scripts/lead-strategy/v2/email-handoff.cjs');
async function fixture(){
 const input=structuredClone((await f.benchmarks())[0].input);input.campaign.config.channels=['email'];
 const p=c.build(input,{now:'2026-10-12T00:00:00Z',readinessSnapshot:{email:{status:'ready',reasons:[]}}});
 const body=c.plan(p,c.template(p),'template_completed');
 return {org_id:1,plan_id:1,content_hash:'a'.repeat(32),email:'demo@example.org',body};
}
test('exact email subject/body belong to plan hash, with no invented signature',async()=>{
 const row=await fixture(),out=e.draft(row);
 assert.equal(out.subject_line,'About Clinic website demonstration');
 assert.equal(out.email_body,row.body.strategy.step1.parts.map(p=>p.text).join('\n\n'));
 assert(out.email_body.includes('Demo Sender'));assert.equal(out.execution_authorized,false);
 const {content_hash,...body}=row.body;assert.equal(c.hash(body),content_hash);
 body.artifacts.email_draft.subject+=' changed';assert.notEqual(c.hash(body),content_hash);
});
test('legacy missing artifact, tampered body, header injection and invalid recipient reject',async()=>{
 const row=await fixture();
 for(const mutate of [x=>delete x.body.artifacts.email_draft,x=>x.body.artifacts.email_draft.body+=' other',x=>x.body.artifacts.email_draft.subject='Hi\r\nBcc: victim@example.org',x=>x.email='one@example.org,two@example.org',x=>x.org_id=0,x=>x.body.validation_errors=['error']]){
  const changed=structuredClone(row);mutate(changed);assert.throws(()=>e.draft(changed));
 }
});
test('PostgreSQL string IDs normalize without accepting unsafe or malformed IDs',async()=>{
 const row=await fixture();assert.equal(e.draft({...row,org_id:'1',plan_id:'1'}).plan_id,1);
 for(const plan_id of ['01','1e2','1.0','9007199254740993',-1])assert.throws(()=>e.draft({...row,plan_id}));
});
test('provider acceptance is not delivery; uncertain outcomes never retry',()=>{
 assert.equal(e.receipt({id:'1234abcdef'}).state,'provider_accepted');
 for(const value of [null,{}, {id:'pending'},{error:'timeout'},{id:'1234abcdef',error:'ambiguous'}])assert.deepEqual(e.receipt(value),{state:'ambiguous',external_id:null,delivered:false,retry_allowed:false});
 assert.equal(e.receipt({id:'1234abcdef'}).delivered,false);
});
test('workflow entry and transport are closed; lifecycle writes have no retries',()=>{
 const w=JSON.parse(fs.readFileSync('workflows/07a_email_outreach_executor.json','utf8'));
 const n=name=>w.nodes.find(n=>n.name===name);
 assert.equal(w.active,false);
 assert.deepEqual(new Function(n('Daily limit check').parameters.jsCode)(),[]);
 assert.throws(()=>new Function('return '+n('Send Email - Gmail').parameters.url.slice(3,-2))(),/EMAIL_TRANSPORT_NOT_ENABLED/);
 assert.equal(n('Send Email - Gmail').retryOnFail,false);
 for(const name of ['Reserve Approved Email','Begin Email Attempt','Log Email Sent'])assert.equal(n(name).retryOnFail,false);
 assert(n('Log Email Sent').parameters.query.includes('outreach_email_step_finish'));
 assert.equal(w.connections['Email Attempt Authorized?'].main[0][0].node,'Send Email - Gmail');
 for(const node of w.nodes){
  if(node.type==='n8n-nodes-base.code'){assert(['runOnceForEachItem','runOnceForAllItems'].includes(node.parameters.mode));assert.doesNotThrow(()=>new Function('$json','$','$input',node.parameters.jsCode));}
  if(node.type==='n8n-nodes-base.postgres'){assert.equal(node.alwaysOutputData,true);assert(!/\b(INSERT|UPDATE|DELETE)\b/i.test(node.parameters.query));}
 }
 assert(n('Get Email-Ready Leads').parameters.query.includes('outreach_email_step_check'));
 assert(n('Get Email-Ready Leads').parameters.query.includes('NOT EXISTS'));
 const merge=new Function('$json','$',n('Merge Unsubscribe Check').parameters.jsCode);
 for(const unsubscribe_count of [null,undefined,'bad',1,'1'])assert.equal(merge({unsubscribe_count},()=>({item:{json:{}}})).json.unsubscribe_count,1);
 assert.equal(merge({unsubscribe_count:'0'},()=>({item:{json:{}}})).json.unsubscribe_count,0);
});
test('sender profile cannot override the lead organization',()=>{
 const w=JSON.parse(fs.readFileSync('workflows/07a_email_outreach_executor.json','utf8'));
 const n=w.nodes.find(n=>n.name==='Verify Sender Profile');
 const credential=w.nodes.find(n=>n.name==='Load Sender Profile').credentials.gmailOAuth2.id;
 const row={org_id:1,sender:{org_id:2,email:'sender@example.org',credential_ref:credential}};
 const result=new Function('$json','$',n.parameters.jsCode)({emailAddress:'sender@example.org'},()=>({item:{json:row}}));
 assert.equal(result.json.sender.org_id,1);
});
