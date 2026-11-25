'use strict';
// Read-only SQL verification of actual test receipts/reply, no provider calls.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const t=require('./test-live-email-final.cjs');
const row=JSON.parse(fs.readFileSync(path.join(t.dir,'plan.json')));
const lit=v=>"'"+JSON.stringify(v).replace(/'/g,"''")+"'::jsonb";
const p={org_id:1,plan_id:row.plan_id,content_hash:row.content_hash,step:2};
const result=t.parse(t.sql("SELECT json_build_object('dispatch',outreach_dispatch_check("+lit({...p,step:1})+"),'followup',outreach_followup_check("+lit(p)+"),'activities',(SELECT json_agg(json_build_object('step',dispatch_metadata->>'step','accepted',dispatch_metadata->>'state'='provider_accepted','reply_saved',replied_at IS NOT NULL,'stop_reason',dispatch_metadata->>'stop_reason','stop_events',jsonb_array_length(coalesce(dispatch_metadata->'stop_events','[]'::jsonb)))) FROM outreach_activities WHERE org_id=1 AND dispatch_metadata->>'plan_id'='"+row.plan_id+"'))"));
assert.equal(result.activities.length,2);assert(result.activities.every(a=>a.accepted));
const replied=result.activities.find(a=>a.step==='2');assert.equal(replied.reply_saved,true);assert.equal(replied.stop_reason,'reply');assert.equal(replied.stop_events,1);
for(const gate of [result.dispatch,result.followup]){assert.equal(gate.ready,false);assert.equal(gate.execution_authorized,false);assert.equal(gate.reason,'suppressed_replied_or_bounced');}
const report={verified_at:new Date().toISOString(),...result,thread:JSON.parse(fs.readFileSync(path.join(t.dir,'thread-verification.json'))),
 limitations:['Scratch database and temporary native n8n HTTP client; production workflows remain inactive.','Intermittent ECONNRESET observed during a later read-only check; production connectivity is not proven reliable.','Earlier ambiguous test remains quarantined.']};
fs.writeFileSync('documentation/strategy-contract-v2/email-final-verification-20261019.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));

