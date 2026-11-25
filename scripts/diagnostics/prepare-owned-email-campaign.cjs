'use strict';
// User-authorized, owned-address acceptance draft. No approvals or provider calls.
// Uses ordinary versioned campaign saves, source-record evidence, enqueue/claim/
// finish functions. Research and provider verification are never fabricated.
const fs=require('node:fs'),assert=require('node:assert/strict');
const dir='.local/owned-email-test-20261115',org=1,campaign=4,from='mohmmadfahad53408@gmail.com',to='fah7861234@gmail.com';
async function main(){assert.ok(process.argv.includes('--prepare-only'));assert.ok(!fs.existsSync(dir+'/prepared.json'),'ALREADY_PREPARED');
 const pool=require('../dashboard/start-local-auth.cjs').localPool({registryWrite:true});let db,transaction=false;try{db=await pool.connect();await db.query('BEGIN');transaction=true;await db.query("SET LOCAL lock_timeout='5s'");
 const call=async(fn,p)=>(await db.query({text:`SELECT ${fn}($1::jsonb) result`,values:[JSON.stringify(p)]})).rows[0].result;
 let c=(await db.query({text:'SELECT c.version,v.config FROM strategy_campaigns c JOIN strategy_campaign_versions v ON v.org_id=c.org_id AND v.campaign_id=c.id AND v.version=c.version WHERE c.org_id=$1 AND c.id=$2 FOR UPDATE OF c',values:[org,campaign]})).rows[0];assert.equal(c?.config.name,'Email integration test');assert.equal(c.config.mode,'template');assert.ok(!c.config._email_execution,'TEST_MUST_REMAIN_UNAPPROVED');
 assert.equal((await db.query('SELECT count(*)::integer n FROM strategy_plans WHERE org_id=$1 AND campaign_id=$2',[org,campaign])).rows[0].n,0,'EXISTING_PLANS_REQUIRE_REVIEW');
 const s=(await db.query({text:"SELECT s.*,m.role FROM sender_connections s JOIN organizations o ON o.id=s.org_id AND o.status='active' JOIN org_sender_memberships m ON m.org_id=s.org_id AND m.subject=s.owner_subject AND m.active AND m.role IN('owner','admin') WHERE s.org_id=$1 AND s.provider='gmail' AND s.email=$2",values:[org,from]})).rows[0];assert.ok(s&&s.state==='ready'&&s.send_capable&&s.reply_capable&&Date.now()-Date.parse(s.checked_at)<86400000,'READY_GMAIL_REQUIRED');
 const bind=(await db.query('SELECT sender_connection_bind($1,$2,$3,$4,$5) result',[org,s.owner_subject,s.connection_id,campaign,c.version])).rows[0].result;assert.ok(!bind.error&&bind.version===c.version+1,'SENDER_BIND_FAILED');
 c=(await db.query('SELECT version,config FROM strategy_campaign_versions WHERE org_id=$1 AND campaign_id=$2 AND version=$3',[org,campaign,bind.version])).rows[0];
 const signature=[c.config.sender.name,c.config.sender.company].join(' | '),footer='Reply STOP to opt out.';
 const finish=text=>{const lines=text.trim().split(/\r?\n/);if(!lines.includes(signature))lines.push('',signature);if(lines.at(-1)!==footer)lines.push(footer);return lines.join('\n');};
 const config={...c.config,email_verification_policy:'basic',timezone:'Asia/Karachi',sending_window:{start_hour:0,end_hour:24,weekdays:[1,2,3,4,5,6,7]},expiry_days:3,
  sequence:[0,0,1].map((delay_days,i)=>({step:i+1,channel:'email',delay_days,condition:i?'no_reply_after_previous_confirmed_send':'initial',stop_on:['reply','opt_out','bounce','wrong_person','meeting_booked']})),
  templates:{...c.config.templates,email:{subject:c.config.templates.email.subject,body:finish(c.config.templates.email.body),followups:[
   finish('This is the second email in our requested system test. Please reply TEST RECEIVED to this email now, so we can verify reply detection and stop the next message.'),
   finish('This is the third email in our requested system test. It should only be sent if no reply or opt-out has been recorded.')]}},
  email_dispatch:{...c.config.email_dispatch,enabled:true,daily_limit:3,mailbox_rolling_limit:3,min_interval_seconds:300}};
 const saved=await call('strategy_campaign_save',{org_id:org,campaign_id:campaign,expected_version:c.version,config});assert.ok(!saved.error&&saved.version===c.version+1,'CAMPAIGN_SAVE_FAILED');
 assert.equal((await db.query('SELECT count(*)::integer n FROM cleaned_leads WHERE org_id=$1 AND email=$2',[org,to])).rows[0].n,0,'EXISTING_RECIPIENT_REVIEW_REQUIRED');
 const provenance={purpose:'owned-account email integration test',recipient_source:'user supplied and confirmed in chat',independent_verification:false,provider_verification:false,test_only:true,campaign_id:campaign};
 const stage=(await db.query({text:"INSERT INTO staging_leads(org_id,source,source_record_id,company_name,email,raw_data,cleaning_status,processing_status,processed) VALUES($1,'owned_account_test',$2,'[TEST] Owner email inbox',$3,$4::jsonb,'cleaned','completed',true) RETURNING id",values:[org,'owned-email-test-20261115',to,JSON.stringify({...provenance,email:to})]})).rows[0];
 const lead=(await db.query({text:"INSERT INTO cleaned_leads(org_id,company_name,email,email_valid,cleaning_metadata) VALUES($1,'[TEST] Owner email inbox',$2,false,$3::jsonb) RETURNING id",values:[org,to,JSON.stringify(provenance)]})).rows[0];
 await db.query('INSERT INTO cleaning_links(staging_id,org_id,cleaned_id) VALUES($1,$2,$3)',[stage.id,org,lead.id]);
 await db.query({text:"INSERT INTO lead_contacts(org_id,lead_id,email,method,evidence,status,relevance_status) VALUES($1,$2,$3,'source_record',$4::jsonb,'unknown','eligible')",values:[org,lead.id,to,JSON.stringify([{email:to,method:'source_record',source_field:'email',staging_id:String(stage.id),...provenance}])]});
 const control=(await db.query('SELECT enabled FROM strategy_controls WHERE id FOR UPDATE')).rows[0];assert.equal(control.enabled,false,'KEEP_GLOBAL_PROCESSING_PAUSED');
 assert.equal((await db.query("SELECT count(*)::integer n FROM strategy_jobs WHERE status IN('pending','processing')")).rows[0].n,0,'OTHER_JOBS_MUST_NOT_BE_CLAIMED');
 const aiBefore=(await db.query('SELECT count(*)::integer n FROM strategy_ai_requests')).rows[0].n;
 const queued=await call('strategy_enqueue',{org_id:org,campaign_id:campaign,lead_id:lead.id,request_id:'owned-email-test-20261115'});assert.ok(!queued.error&&queued.job_id,'ENQUEUE_FAILED');
 // The control is never committed as enabled or visible to other worker sessions.
 await db.query('UPDATE strategy_controls SET enabled=true WHERE id');
 const claim=(await db.query("SELECT strategy_claim('owned-email-test-20261115',1) result")).rows[0]?.result;assert.equal(Number(claim?.id),Number(queued.job_id),'EXACT_TEST_CLAIM_REQUIRED');await db.query('UPDATE strategy_controls SET enabled=false WHERE id');
 const native=require('../lead-strategy/v2/native.cjs'),prepared=native.prepare(claim,{customerTemplatesEnabled:true});assert.equal(prepared.wants_ai,false);assert.ok(prepared.customer_payload,'CUSTOMER_TEMPLATE_REQUIRED');
 const assembled=native.assemble(prepared,{});assert.deepEqual(assembled.plan.blocking_reasons,[]);assert.deepEqual(assembled.plan.validation_errors,[]);assert.equal(assembled.plan.execution_authorized,false);
 const plan=await call('strategy_finish',assembled);assert.equal(plan.saved,true,'PLAN_SAVE_FAILED');
 assert.equal((await db.query('SELECT count(*)::integer n FROM strategy_ai_requests')).rows[0].n,aiBefore,'NO_AI_REQUESTS_ALLOWED');
 const body=(await db.query('SELECT body FROM strategy_plans WHERE id=$1 AND org_id=$2',[plan.plan_id,org])).rows[0].body;assert.equal((await db.query('SELECT outreach_email_transport_marker_allowed($1::jsonb) allowed',[JSON.stringify(body)])).rows[0].allowed,true,'CUSTOMER_FORMAT_NOT_ADMITTED');
 const result={prepared:true,org_id:org,campaign_id:campaign,campaign_version:saved.version,lead_id:lead.id,plan_id:plan.plan_id,content_hash:plan.content_hash,sender:from,recipient:to,subject:config.templates.email.subject,messages:[config.templates.email.body,...config.templates.email.followups],delays_days:[0,0,1],minimum_spacing_seconds:300,daily_limit:3,approved:false,automation_enabled:false,ai_calls:0,emails_sent:0,global_strategy_processing_enabled:false};
 fs.writeFileSync(dir+'/commit-attempt.json',JSON.stringify({plan_id:plan.plan_id,campaign_version:saved.version}));await db.query('COMMIT');transaction=false;fs.writeFileSync(dir+'/prepared.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,messages:undefined}));
 }catch(e){if(transaction)await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db?.release();await pool.end();}}
main().catch(e=>{console.error(/^[A-Z][A-Z_]+$/.test(e.message)?e.message:'OWNED_TEST_PREPARATION_FAILED');process.exitCode=1;});
