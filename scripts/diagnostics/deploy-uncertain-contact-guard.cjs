'use strict';
// Additive safety fix only. Never changes approvals, activities or activation.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),cp=require('child_process');
const dir=path.resolve('.local/email-contact-guard-deployment-20261019');
function sql(q){const r=cp.spawnSync('docker',['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],{input:q,encoding:'utf8',timeout:60000,maxBuffer:2e6});if(r.status!==0)throw Error('CONTACT_GUARD_DEPLOYMENT_STOPPED');return r.stdout.trim();}
const previous=fs.readFileSync('database/migrations/029_delivery_scan_checkpoint.sql','utf8');
const next=fs.readFileSync('database/migrations/031_email_uncertain_contact_guard.sql','utf8');
const body=s=>s.slice(s.indexOf('CREATE OR REPLACE FUNCTION outreach_email_contact_gate')).match(/AS \$\$([\s\S]*?)END \$\$;/)[1]+'END ';
const normalize=s=>s.replace(/\r\n/g,'\n').trim();
assert.equal(normalize(sql("SELECT prosrc FROM pg_proc WHERE oid='outreach_email_contact_gate(integer,integer,text,text)'::regprocedure")),normalize(body(previous)),'Live baseline changed');
assert.equal(sql("SELECT count(*) FROM workflow_entity WHERE id IN ('gTjsUEP8VLlxKfWf','TrgeZrs4ILZnrXuJ') AND active"),'0');
assert(!fs.existsSync(dir),'Prior deployment evidence exists');fs.mkdirSync(dir);
fs.writeFileSync(path.join(dir,'previous-function.sql'),sql("SELECT pg_get_functiondef('outreach_email_contact_gate(integer,integer,text,text)'::regprocedure)"));
sql(next);
assert.equal(normalize(sql("SELECT prosrc FROM pg_proc WHERE oid='outreach_email_contact_gate(integer,integer,text,text)'::regprocedure")),normalize(body(next)));
const result={deployed_at:new Date().toISOString(),migration:31,function:'outreach_email_contact_gate',definition_verified:true,activity_changes:false,activation_changes:false,sends:0};
fs.writeFileSync('documentation/strategy-contract-v2/email-contact-guard-deployment-20261019.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
