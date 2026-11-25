'use strict';
const fs=require('fs'),cp=require('child_process'),path=require('path'),assert=require('assert/strict');
const dir=path.resolve('.local/dispatch-foundation-20261014');
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:20e6,timeout:120000});if(r.status)throw Error('Docker/database operation failed: '+String(r.stderr||'').slice(0,400));return r.stdout.trim();}
function sql(q){return docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q);}
const snapshot=`SELECT json_build_object('activity_count',(SELECT count(*) FROM outreach_activities),'plans',(SELECT coalesce(json_agg(json_build_object('id',id,'content_hash',content_hash,'body_hash',md5(body::text)) ORDER BY id),'[]') FROM strategy_plans),'strategy_ai_count',(SELECT count(*) FROM strategy_ai_requests),'enrichment_ai_count',(SELECT count(*) FROM enrichment_ai_requests),'senders',(SELECT json_agg(json_build_object('id',id,'active',active) ORDER BY id) FROM workflow_entity WHERE name ~* '(^7[A-D]? |^8 |outreach executor|follow.?up manager)'));`;
try{
 assert.equal(sql("SELECT count(*) FROM information_schema.columns WHERE table_name='outreach_activities' AND column_name='dispatch_metadata'"),'0','Already applied; inspect rather than replay');
 assert.equal(sql("SELECT count(*) FROM workflow_entity WHERE active AND name ~* '(^7[A-D]? |^8 |outreach executor|follow.?up manager)'"),'0','Sender unexpectedly active');
 fs.mkdirSync(dir,{recursive:true});const before=JSON.parse(sql(snapshot));fs.writeFileSync(path.join(dir,'before.json'),JSON.stringify(before),{flag:'wx'});
 docker(['exec','postgres_db','pg_dump','-U','n8n_user','-d','lead_db','-Fc','-f','/tmp/before-dispatch-20261014.dump']);docker(['cp','postgres_db:/tmp/before-dispatch-20261014.dump',path.join(dir,'before.dump')]);
 // Apply both reviewed migrations atomically; each source file's outer transaction is removed here.
 const combined=['018_outreach_dispatch_metadata.sql','019_outreach_dispatch_handoff.sql'].map(f=>fs.readFileSync('database/migrations/'+f,'utf8').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'')).join('\n');
 sql('BEGIN;\n'+combined+'\nCOMMIT;');
 const after=JSON.parse(sql(snapshot));assert.deepEqual(after,before,'Unexpected ledger, plan, activity or activation change');
 assert.equal(sql("SELECT outreach_dispatch_check('{\"org_id\":1,\"plan_id\":9223372036854775807,\"step\":1}') ->> 'ready'"),'false');
 assert.equal(sql("SELECT has_function_privilege('n8n_user','outreach_dispatch_reserve(jsonb)','EXECUTE')"),'t');
 assert.equal(sql("SELECT count(*) FROM outreach_activities WHERE dispatch_metadata <> '{}'::jsonb"),'0');
 const report={at:new Date().toISOString(),migrations:[18,19],activity_rows_unchanged:true,plan_hashes_unchanged:true,ai_ledger_counts_unchanged:true,sender_activation_unchanged:true,production_dispatches_reserved:0,transport_connected:false,model_calls:0,sent:false};
 fs.writeFileSync('documentation/strategy-contract-v2/dispatch-deployment.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch(e){console.error(e.message);process.exitCode=1;}
