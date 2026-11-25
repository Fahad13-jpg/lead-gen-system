'use strict';
// Called only by the isolated rollback-only harness. Positive verification is a context DOUBLE.
const assert=require('node:assert/strict');
const {validate}=require('../organization-policy/customer-execution.cjs');
module.exports=async function({sql,json,quote,claim,fixture,saved,config}){
 await sql('SAVEPOINT customer_dispatch;');
 const call=(fn,p)=>json('SELECT '+fn+'('+quote(p)+');');
 const identity={org_id:1,plan_id:saved.plan_id,step:1,content_hash:saved.content_hash};
 const negative=await call('outreach_email_step_check',identity);
 assert.equal(negative.ready,false); // Actual source context has no verified fixture mailbox.
 await sql('RESET ROLE; GRANT INSERT,UPDATE ON outreach_activities TO v2_scratch_runtime;');
 // A fixed context double permits exercising the downstream verified branch without a provider call.
 const context=structuredClone(claim.input);
 context.report.trust.fields={...context.report.trust.fields,emails:[{value:context.lead.email,status:'provider_verified'}]};
 const cfg={...config,timezone:'UTC',sending_window:{start_hour:0,end_hour:24,weekdays:[1,2,3,4,5,6,7]},email_dispatch:{enabled:true,credential_ref:'SCRATCH_ONLY',sender_email:'scratch-sender@example.org',daily_limit:10,mailbox_rolling_limit:10,min_interval_seconds:300}};
 context.campaign.config=cfg;
 if(process.argv.includes('--basic-policy')){
  cfg.email_verification_policy='basic';
  context.lead.email='scratch-basic@gmail.com';
  context.report.trust.fields.emails=[];
  context.report.trust.conflicts=[];
  await sql("UPDATE cleaned_leads SET email='scratch-basic@gmail.com',email_verification_status=NULL WHERE org_id=1 AND id=167;");
  await sql("INSERT INTO lead_contacts(org_id,lead_id,email,method,evidence,status,relevance_status,created_at) VALUES(1,167,'scratch-basic@gmail.com','published_website','[{\"email\":\"scratch-basic@gmail.com\",\"method\":\"published_website\",\"source_url\":\"https://fixture.example/contact\"}]','pending','eligible',now()) ON CONFLICT(org_id,lead_id,email) DO UPDATE SET evidence=excluded.evidence,status='pending',relevance_status='eligible',method='published_website',created_at=now(),verification=NULL;");
  context.email_eligibility=await call('outreach_email_eligibility',context);
  assert.equal(context.email_eligibility.classification,'basic_unverified');
 }else delete context.email_eligibility; // Legacy verified-context double.
 if(process.argv.includes('--sender-connections')){
  const subject='c'.repeat(64);
  await sql("INSERT INTO org_sender_memberships(org_id,subject,role) VALUES(1,'"+subject+"','owner');");
  await sql("INSERT INTO sender_connections(org_id,connection_id,owner_subject,provider,credential_ref,email,sharing,state,send_capable,reply_capable,checked_at,daily_limit,mailbox_rolling_limit,min_interval_seconds) VALUES(1,'dispatch-fixture','"+subject+"','gmail','SCRATCH_ONLY','scratch-sender@example.org','private','ready',true,true,clock_timestamp(),10,10,300);");
  cfg.sender_connection={connection_id:'dispatch-fixture',provider:'gmail',version:1,subject};
 }
 await sql('UPDATE strategy_campaign_versions SET config='+quote(cfg)+' WHERE campaign_id='+Number(context.campaign.id)+';');
 await sql('CREATE OR REPLACE FUNCTION strategy_context(p_org integer,p_campaign bigint,p_lead integer) RETURNS jsonb LANGUAGE sql STABLE AS $ctx$ SELECT CASE WHEN p_org=1 AND p_campaign='+Number(context.campaign.id)+' AND p_lead='+Number(context.lead.id)+' THEN '+quote(context)+' ELSE NULL END $ctx$;');
 await sql('SET LOCAL ROLE v2_scratch_runtime;');
 // Rebuild using synthetic current config, never mutate a deployed plan or real verification status.
 const body=require('../organization-policy/customer-plan.cjs').build({...claim,input:context},{integrationEnabled:true}).plan;
 async function saveBody(){identity.content_hash=(await sql('UPDATE strategy_plans SET body='+quote(body)+',content_hash=md5(('+quote(body)+')::text) WHERE id='+Number(saved.plan_id)+' RETURNING content_hash;'))[0];}
 async function approve(){const r=await call('strategy_approval',{...identity,action:'approve',actor:'SCRATCH MOCK DISPATCH',acknowledge_customer_content:true,acknowledge_customer_content_hash:identity.content_hash});assert.equal(r.approved_content,true,JSON.stringify(r));}
 await saveBody();await approve();
 let reservation=await call('outreach_email_step_reserve',identity);assert.equal(reservation.reserved,true,JSON.stringify(reservation));
 let args={...identity,lease:reservation.lease,credential_ref:'SCRATCH_ONLY',sender_email:'scratch-sender@example.org',to_email:context.lead.email,subject:body.artifacts.email_draft.subject,body:body.artifacts.email_draft.body};
 assert.equal((await call('outreach_email_step_begin',args)).reason,'plan_transport_not_authorized');
 body.execution_authorized=true;await saveBody();await approve();
 await sql('UPDATE outreach_activities SET dispatch_metadata=jsonb_set(dispatch_metadata,\'{content_hash}\','+quote(identity.content_hash)+') WHERE id='+Number(reservation.activity_id)+';');
 args={...args,...identity};
 assert.equal(validate({org_id:1,lead_id:context.lead.id,email:context.lead.email,body,strategy_context:context}).content_valid,true);
 assert.equal((await call('outreach_email_step_begin',{...args,body:'tampered'})).reason,'approved_message_or_recipient_mismatch');
 assert.equal((await call('outreach_email_step_begin',{...args,credential_ref:'OTHER'})).reason,'sender_policy_missing_or_mismatched');
 if(process.argv.includes('--sender-connections')){
  await sql("UPDATE sender_connections SET state='disabled' WHERE org_id=1 AND connection_id='dispatch-fixture';");
  assert.equal((await call('outreach_email_step_begin',args)).reason,'sender_connection_not_ready');
  await sql("UPDATE sender_connections SET state='ready' WHERE org_id=1 AND connection_id='dispatch-fixture'; UPDATE org_sender_memberships SET active=false WHERE org_id=1 AND subject='"+'c'.repeat(64)+"';");
  assert.equal((await call('outreach_email_step_begin',args)).reason,'sender_membership_revoked');
  await sql("UPDATE org_sender_memberships SET active=true WHERE org_id=1 AND subject='"+'c'.repeat(64)+"';");
 }
 const begun=await call('outreach_email_step_begin',args);assert.equal(begun.execution_authorized,true,JSON.stringify(begun));
 assert.equal((await call('outreach_email_step_begin',args)).ready,false);
 if(process.argv.includes('--smtp-receipts')){
  await sql('SAVEPOINT smtp_receipts;');
  const id=Number(reservation.activity_id),message_id='<scratch@example.org>';
  await sql("UPDATE sender_connections SET provider='smtp',inbox_credential_ref='IMAP_SCRATCH' WHERE org_id=1 AND connection_id='dispatch-fixture';");
  await sql("UPDATE strategy_campaign_versions SET config=jsonb_set(config,'{sender_connection,provider}','\"smtp\"'::jsonb) WHERE campaign_id="+Number(context.campaign.id)+';');
  await sql("UPDATE outreach_activities SET status='reserved',dispatch_metadata=(dispatch_metadata-'quota_day'-'started_at')||'{\"state\":\"reserved\"}'::jsonb WHERE id="+id+';');
  const smtpArgs={...args,connection_id:'dispatch-fixture',inbox_credential_ref:'IMAP_SCRATCH',message_id,references:[],checkpoint:{mailbox:'INBOX',uid_validity:'2',uid_next:'8'}};
  assert.equal((await call('outreach_email_step_begin',args)).reason,'smtp_execution_not_integrated'); // Gmail remains isolated.
  assert.equal((await call('outreach_smtp_begin',{...smtpArgs,inbox_credential_ref:'OTHER'})).reason,'smtp_inbox_binding_mismatch');
  assert.equal((await call('outreach_smtp_begin',{...smtpArgs,body:'changed'})).reason,'approved_message_or_recipient_mismatch');
  const smtpBegin=await call('outreach_smtp_begin',smtpArgs);assert.equal(smtpBegin.execution_authorized,true,JSON.stringify(smtpBegin));
  assert.equal((await call('outreach_smtp_begin',smtpArgs)).ready,false);
  assert.equal((await call('outreach_smtp_finish',{...args,org_id:999999,outcome:'provider_accepted',message_id})).saved,false);
  const receipt=await call('outreach_smtp_finish',{...args,outcome:'provider_accepted',message_id});assert.equal(receipt.saved,true,JSON.stringify(receipt));assert.equal(receipt.state,'provider_accepted');
  assert.equal((await call('outreach_smtp_finish',{...args,outcome:'provider_accepted',message_id})).idempotent,true);
  const scan={org_id:1,activity_id:id,connection_id:'dispatch-fixture',credential_ref:'SCRATCH_ONLY',inbox_credential_ref:'IMAP_SCRATCH',sender_email:args.sender_email,message_id,expected_checkpoint:smtpArgs.checkpoint,checkpoint:{mailbox:'INBOX',uid_validity:'2',uid_next:'10'},events:[],reviews:[]};
  assert.equal((await call('outreach_imap_scan_finish',scan)).saved,true);
  assert.equal((await call('outreach_imap_scan_finish',scan)).reason,'stale_scan');
  scan.expected_checkpoint=scan.checkpoint;scan.checkpoint={...scan.checkpoint,uid_next:'11'};
  assert.equal((await call('outreach_imap_scan_finish',{...scan,checkpoint:{...scan.checkpoint,uid_validity:'3'}})).reason,'uid_validity_changed');
  for(const bad of [null,'bad',{}])assert.equal((await call('outreach_imap_scan_finish',{...scan,events:bad})).saved,false);
  scan.events=[{org_id:1,activity_id:id,kind:'opt_out',event_id:'imap:'+'d'.repeat(64),source_ref:{mailbox:'INBOX',uid_validity:'2',uid:'10'}}];
  const matched=await call('outreach_imap_scan_finish',scan);assert.equal(matched.saved,true,JSON.stringify(matched));
  assert.equal((await call('outreach_email_step_check',{...identity,step:2})).ready,false);
  await sql('ROLLBACK TO SAVEPOINT smtp_receipts;');
  console.log('PASS SMTP receipt identity/idempotency; IMAP atomic stop/cursor, stale scans, epoch changes, malformed arrays (scratch only).');
 }
 const finish=await call('outreach_email_step_finish',{...args,outcome:'provider_accepted',external_id:'abcdef1234567890'});assert.equal(finish.saved,true,JSON.stringify(finish));
 // Functions using now() see transaction start, while finish uses wall time.
 // Normalize only this mock receipt timestamp within this single-transaction test.
 await sql('UPDATE outreach_activities SET sent_at=now() AT TIME ZONE \'UTC\' WHERE id='+Number(reservation.activity_id)+';');
 const next={...identity,step:2};
 assert.equal((await call('outreach_email_step_check',next)).reason,'delay_not_elapsed');
 // Advance only fixture history, never wait or send a follow-up.
 await sql("UPDATE outreach_activities SET sent_at=(now()-interval '4 days') AT TIME ZONE 'UTC',dispatch_metadata=dispatch_metadata||jsonb_build_object('started_at',now()-interval '4 days','reply_scan',jsonb_build_object('checked_at',now(),'review_required',false)) WHERE id="+Number(reservation.activity_id)+';');
 const due=await call('outreach_email_step_check',next);assert.equal(due.ready,true,JSON.stringify(due));
 await sql('UPDATE outreach_activities SET replied_at=now() WHERE id='+Number(reservation.activity_id)+';');
 assert.equal((await call('outreach_email_step_check',next)).ready,false);
 await sql('ROLLBACK TO SAVEPOINT customer_dispatch;');
 return {actual_context_denial:negative.reason,positive_context:process.argv.includes('--basic-policy')?'SYNTHETIC published-contact fixture with real SQL basic eligibility; no verification or sending':'SYNTHETIC verified-email context double; no external verification or sending',passed:['transport release required','hash-bound customer approval','reservation','current-context content validation','message and sender mismatch rejection','one begin only','mock receipt persistence','follow-up delay','due follow-up','reply stops follow-up']};
};
