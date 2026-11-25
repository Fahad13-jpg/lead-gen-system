'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const rollout=require('../../scripts/lead-strategy/v2/email-rollout.cjs');
const e=require('../../workflows/07a_email_outreach_executor.json'),r=require('../../workflows/09_reply_detection.json');
const now=Date.parse('2026-10-20T00:00:00Z');
const config=()=>({binding:{org_id:1,email:'sender@example.org',credential_ref:e.nodes.find(n=>n.name==='Send Email - Gmail').credentials.gmailOAuth2.id},expires_at:'2026-10-20T01:00:00Z',plans:[{plan_id:7,content_hash:'a'.repeat(32),recipient:'test@example.org',max_step:2}]});
const row=()=>({org_id:1,plan_id:7,content_hash:'a'.repeat(32),email:'test@example.org',step:1});
test('canary scope rejects changed org, hash, recipient, plan, step and expiry',()=>{
 const c=config();assert(rollout.allows(row(),c,now));
 for(const patch of [{org_id:2},{plan_id:8},{content_hash:'b'.repeat(32)},{email:'prospect@example.org'},{step:3},{step:0},{step:'1.5'}])assert.equal(rollout.allows({...row(),...patch},c,now),false);
 assert.equal(rollout.allows(row(),c,Date.parse(c.expires_at)),false);
});
test('release rejects unknown fields, long expiry and duplicate plans',()=>{
 for(const alter of [c=>({...c,enabled:true}),c=>({...c,expires_at:'2026-11-20T00:00:00Z'}),c=>({...c,plans:[...c.plans,...c.plans]}),c=>({...c,plans:[]})])assert.throws(()=>rollout.validate(alter(config()),now));
});
test('builder preserves topology and notes; gates before reservation and transport',()=>{
 const out=rollout.build(e,r,config(),now);
 for(const [original,w] of [[e,out.email],[r,out.reply]]){
  assert.equal(w.active,false);assert.deepEqual(w.connections,original.connections);
  assert.deepEqual(w.nodes.filter(n=>n.type==='n8n-nodes-base.stickyNote'),original.nodes.filter(n=>n.type==='n8n-nodes-base.stickyNote'));
 }
 const get=n=>out.email.nodes.find(x=>x.name===n);
 assert(get('Get Email-Ready Leads').parameters.query.includes('p.org_id=1 AND p.id IN (7)'));
 assert(get('Send Email - Gmail').parameters.url.includes('dispatch_allowed!==true'));
 assert.equal(get('Send Email - Gmail').retryOnFail,false);
 // Execute the actual generated Code node using matched/unmatched candidates.
 const rows=[row(),{...row(),email:'other@example.org'},{...row(),org_id:2}].map(json=>({json:{...json,sender_policy:{enabled:true,credential_ref:config().binding.credential_ref,sender_email:'sender@example.org',daily_limit:10,mailbox_rolling_limit:10,min_interval_seconds:300}}}));
 const code=get('Daily limit check').parameters.jsCode;
 class Clock extends Date{static now(){return now;}}
 const result=new Function('$input','Date',code)({all:()=>rows},Clock);
 assert.equal(result.length,1);assert.deepEqual(result[0].pairedItem,{item:0});
 rows[0].json.sender_policy.daily_limit=11;
 assert.equal(new Function('$input','Date',code)({all:()=>rows},Clock).length,0);
 const url=new Function('$json','$','Date','return '+get('Send Email - Gmail').parameters.url.slice(3,-2));
 const source=()=>({item:{json:row()}});
 assert.equal(url({dispatch_allowed:true},source,Clock),'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
 assert.throws(()=>url({dispatch_allowed:false},source,Clock));
 class Expired extends Date{static now(){return Date.parse(config().expires_at);}}
 assert.throws(()=>url({dispatch_allowed:true},source,Expired));
 assert.deepEqual(get('Schedule Trigger').parameters,e.nodes.find(n=>n.name==='Schedule Trigger').parameters);
 assert.deepEqual(out.reply.nodes.find(n=>n.name==='Schedule Trigger').parameters,r.nodes.find(n=>n.name==='Schedule Trigger').parameters);
});
