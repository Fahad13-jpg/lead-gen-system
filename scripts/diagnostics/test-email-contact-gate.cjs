'use strict';
const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict');
const container='lead_diag_pg_20261011',db='scratch_v2_release_20261014';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:60000,maxBuffer:2e6});if(r.status!==0)throw Error(String(r.stderr||r.error).slice(0,1600));return r.stdout.trim();}
assert.equal(JSON.parse(docker(['inspect',container]))[0].HostConfig.NetworkMode,'none');
const sql=q=>docker(['exec','-i',container,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',db],q);
sql(fs.readFileSync('database/migrations/028_email_contact_gate.sql','utf8'));
let fixture=fs.readFileSync('.local/followup-readiness-fixture.sql','utf8');
fixture=fixture.replace('END $test$;',`
 SELECT id INTO aid FROM outreach_activities WHERE org_id=1 AND dispatch_metadata->>'plan_id'=pid::text;
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||'{"state":"provider_accepted","recipient_email":"test@example.org"}' WHERE id=aid;
 ASSERT outreach_email_contact_gate(1,167,'test@example.org','demo@example.org')->>'reason'='reply_check_stale';
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||jsonb_build_object('reply_scan',jsonb_build_object('checked_at',now()-interval '1 second','review_required',false)) WHERE id=aid;
 ASSERT outreach_email_contact_gate(1,167,'test@example.org','demo@example.org')->>'allowed'='true';
 UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,'{reply_scan,review_required}','true') WHERE id=aid;
 ASSERT outreach_email_contact_gate(1,167,'test@example.org','demo@example.org')->>'reason'='conversation_review_required';
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||'{"reply_scan":{"checked_at":"not-a-date"}}' WHERE id=aid;
 ASSERT outreach_email_contact_gate(1,167,'test@example.org','demo@example.org')->>'reason'='reply_check_stale';
 UPDATE outreach_activities SET bounced_at=now() WHERE id=aid;
 ASSERT outreach_email_contact_gate(1,999999,' TEST@example.org ','demo@example.org')->>'reason'='email_address_suppressed';
 ASSERT outreach_email_contact_gate(999999,999999,'test@example.org','demo@example.org')->>'allowed'='true','no cross-org suppression';
 UPDATE outreach_activities SET bounced_at=NULL,dispatch_metadata=dispatch_metadata||'{"stop_reason":"reply","stop_events":[{"kind":"opt_out"}]}' WHERE id=aid;
 ASSERT outreach_email_contact_gate(1,999999,'test@example.org','other@example.org')->>'reason'='email_address_suppressed';
 ASSERT outreach_email_contact_gate(1,167,NULL,'demo@example.org')->>'allowed'='false';
 ASSERT position('outreach_email_contact_gate' in pg_get_functiondef('outreach_email_step_begin(jsonb)'::regprocedure))>0;
END $test$;`);
console.log(sql(fixture));console.log('PASS: stale/invalid scan blocks, fresh scan permits, review blocks, address suppression survives later reply and sender changes, org isolation; scratch rollback.');
