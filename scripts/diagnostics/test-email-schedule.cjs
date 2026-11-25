'use strict';
const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict');
const container='lead_diag_pg_20261011',db='scratch_v2_release_20261014';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:60000,maxBuffer:2e6});if(r.status!==0)throw Error(String(r.stderr||r.error).slice(0,1800));return r.stdout.trim();}
const info=JSON.parse(docker(['inspect',container]))[0];assert.equal(info.HostConfig.NetworkMode,'none');assert(info.State.Running);
const sql=q=>docker(['exec','-i',container,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',db],q);
sql(fs.readFileSync('database/migrations/021_email_sending_window.sql','utf8'));
console.log(sql(fs.readFileSync('tests/lead-strategy/sending-window.sql','utf8')));
const timing={timezone:'UTC',sending_window:{start_hour:0,end_hour:24,weekdays:[1,2,3,4,5,6,7]},sequence:[{step:1,channel:'email',delay_days:0}]};
let fixture=fs.readFileSync('tests/lead-strategy/email-lifecycle.sql','utf8');
fixture=fixture.replace('{"email_dispatch":',JSON.stringify(timing).slice(0,-1)+',"email_dispatch":');
fixture=fixture.replace('"artifacts":{"email_draft":','"artifacts":{"schedule":'+JSON.stringify(timing)+',"email_draft":');
// Verify that mismatched approved timing blocks before any attempt is charged.
fixture=fixture.replace(" r:=outreach_email_begin(p);ASSERT",` UPDATE strategy_campaign_versions SET config=jsonb_set(config,'{timezone}','"Asia/Karachi"') WHERE campaign_id=c;
 ASSERT outreach_email_begin(p)->>'reason'='approved_schedule_required';
 UPDATE strategy_campaign_versions SET config=jsonb_set(config,'{timezone}','"UTC"') WHERE campaign_id=c;
 r:=outreach_email_begin(p);ASSERT`);
console.log(sql(fixture));
const workflow=JSON.parse(fs.readFileSync('workflows/07a_email_outreach_executor.json','utf8'));
sql('BEGIN; SET LOCAL ROLE v2_scratch_runtime; '+workflow.nodes.find(n=>n.name==='Get Email-Ready Leads').parameters.query+'; ROLLBACK;');
console.log('PASS: actual 07A candidate SQL executes in scratch under runtime role.');
console.log('021 tested only in '+db+'; live unchanged.');
