'use strict';
// Existing isolated scratch database only. DDL and all checks roll back.
const cp=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const container='lead_016_1794141179811',database='scratch_contact_refresh_20261108';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:60000,maxBuffer:2e6});if(r.status!==0)throw Error((r.stderr||'SCRATCH_COMMAND_FAILED').slice(0,1400));return r.stdout.trim();}
async function main(){
 assert.equal(docker(['inspect',container,'--format','{{.HostConfig.NetworkMode}}']),'none');
 const wasRunning=docker(['inspect',container,'--format','{{.State.Running}}'])==='true';
 try{
  docker(['start',container]);let ready=false;
  for(let i=0;i<30;i++){if(cp.spawnSync('docker',['exec',container,'pg_isready','-U','n8n_user'],{stdio:'ignore',timeout:5000}).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,200));}assert(ready,'SCRATCH_NOT_READY');
  const definitions=`SELECT jsonb_agg(jsonb_build_object('name',p.proname,'owner',p.proowner,'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid)) ORDER BY p.proname) FROM pg_proc p WHERE p.oid IN ('outreach_email_begin(jsonb)'::regprocedure,'outreach_email_step_begin(jsonb)'::regprocedure,'outreach_smtp_begin(jsonb)'::regprocedure)`;
  const migration=fs.readFileSync('database/migrations/055_email_native_transport_gate.sql','utf8').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
  const tests=fs.readFileSync('tests/lead-strategy/native-email-transport.sql','utf8');
  const script=`\\o /dev/null
BEGIN;
SELECT set_config('scratch.email_before',(${definitions})::text,true);
SELECT set_config('scratch.email_counts',(SELECT jsonb_build_object('activities',(SELECT count(*) FROM outreach_activities),'requests',(SELECT count(*) FROM strategy_ai_requests),'plans',(SELECT count(*) FROM strategy_plans),'approvals',(SELECT count(*) FROM strategy_approvals))::text),true);
${migration}
${tests}
DO $check$ DECLARE prior jsonb; item jsonb; actual record; BEGIN
 FOR item IN SELECT * FROM jsonb_array_elements(current_setting('scratch.email_before')::jsonb) LOOP
  SELECT p.proowner,p.proacl::text acl,pg_get_functiondef(p.oid) definition INTO actual FROM pg_proc p WHERE p.oid=to_regprocedure((item->>'name')||'(jsonb)');
  ASSERT actual.proowner::text=item->>'owner','owner changed';
  ASSERT actual.acl IS NOT DISTINCT FROM item->>'acl','grants changed';
  ASSERT actual.definition=replace(item->>'definition','IF v.body->>''execution_authorized'' IS DISTINCT FROM ''true'' THEN','IF NOT outreach_email_transport_marker_allowed(v.body) THEN'),'unrelated function code changed';
 END LOOP;
 ASSERT current_setting('scratch.email_counts')::jsonb=(SELECT jsonb_build_object('activities',(SELECT count(*) FROM outreach_activities),'requests',(SELECT count(*) FROM strategy_ai_requests),'plans',(SELECT count(*) FROM strategy_plans),'approvals',(SELECT count(*) FROM strategy_approvals))),'business records changed';
 ASSERT has_function_privilege('n8n_user','outreach_email_transport_marker_allowed(jsonb)','EXECUTE');
END $check$;
ROLLBACK;
\\o
SELECT 'SCRATCH_NATIVE_EMAIL_GATE_PASSED';`;
  assert(docker(['exec','-i',container,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',database],script).includes('SCRATCH_NATIVE_EMAIL_GATE_PASSED'));
  const result={passed:true,database,migration:'055_email_native_transport_gate.sql',live_applied:false,rolled_back:true,three_existing_functions_changed_only_at_marker_guard:true,owners_and_grants_preserved:true,model_calls:0,outreach_sent:0,unverified:['Actual provider delivery','Full native approval-to-send acceptance; marker checks are not dispatch authorization']};
  fs.mkdirSync('.local/native-email-transport-20261109',{recursive:true});fs.writeFileSync('.local/native-email-transport-20261109/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{if(!wasRunning)docker(['stop',container]);}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
