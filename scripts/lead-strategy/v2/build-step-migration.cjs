'use strict';
// Extend the existing lease/approval/quota mechanism to approved email steps.
const fs=require('fs'),assert=require('assert/strict');
const read=n=>fs.readFileSync('database/migrations/'+n,'utf8');
function fn(source,name){const start=source.indexOf('CREATE OR REPLACE FUNCTION '+name+'(');assert(start>=0);const end=source.indexOf('END $$;',start);assert(end>start);return source.slice(start,end+7);}
const base=read('019_outreach_dispatch_handoff.sql');
let follow=fn(read('022_followup_readiness.sql'),'outreach_followup_check');
follow=follow.replace("AND dispatch_metadata->>'step'=n::text) THEN",`AND dispatch_metadata->>'step'=n::text
 AND NOT (dispatch_metadata->>'state'='reserved' AND coalesce(dispatch_metadata->>'lease','')<>'' AND dispatch_metadata->>'lease'=coalesce(p->>'lease',''))) THEN`);
const check=`CREATE OR REPLACE FUNCTION outreach_email_step_check(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE base jsonb; followup jsonb;
BEGIN
 IF coalesce(p->>'step','') !~ '^([1-9]|10)$' THEN RETURN '{"ready":false,"execution_authorized":false,"reason":"invalid_step"}';END IF;
 base:=outreach_dispatch_check(p||'{"step":1}');
 IF base->>'ready' IS DISTINCT FROM 'true' THEN RETURN base;END IF;
 IF EXISTS(SELECT 1 FROM outreach_activities WHERE org_id=(base->>'org_id')::integer AND lead_id=(base->>'lead_id')::integer AND dispatch_metadata->>'stop_reason' IN ('wrong_person','meeting_booked','opt_out')) THEN
 RETURN '{"ready":false,"execution_authorized":false,"reason":"stop_event_recorded"}';END IF;
 IF p->>'step'<>'1' THEN
 followup:=outreach_followup_check(p);
 IF followup->>'ready' IS DISTINCT FROM 'true' THEN RETURN followup;END IF;
 END IF;
 RETURN base||jsonb_build_object('step',(p->>'step')::integer);
END $$;`;
let reserve=fn(base,'outreach_dispatch_reserve').replaceAll('outreach_dispatch_reserve','outreach_email_step_reserve').replaceAll('outreach_dispatch_check','outreach_email_step_check').replace("'step','1'","'step',p->>'step'");
let recheck=fn(base,'outreach_dispatch_recheck').replaceAll('outreach_dispatch_recheck','outreach_email_step_recheck').replaceAll('outreach_dispatch_check','outreach_email_step_check').replace("dispatch_metadata->>'step'='1'","dispatch_metadata->>'step'=p->>'step'");
let begin=fn(read('021_email_sending_window.sql'),'outreach_email_begin').replaceAll('outreach_email_begin','outreach_email_step_begin').replaceAll('outreach_dispatch_recheck','outreach_email_step_recheck');
begin=begin.replace('cfg jsonb; policy jsonb;','cfg jsonb; policy jsonb; message jsonb;');
const marker=" IF coalesce(v.body->'artifacts'->'email_draft'->>'subject','')=''";assert(begin.includes(marker));
begin=begin.replace(marker,` IF p->>'step'='1' THEN message:=v.body->'artifacts'->'email_draft';
 ELSE SELECT item INTO message FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v.body->'artifacts'->'followup_drafts')='array' THEN v.body->'artifacts'->'followup_drafts' ELSE '[]'::jsonb END) item WHERE item->>'step'=p->>'step' LIMIT 1; END IF;
`+marker);
begin=begin.replaceAll("v.body->'artifacts'->'email_draft'->>","message->>");
begin=begin.replace("cfg->'sequence'->0->>'channel'", "cfg->'sequence'->((p->>'step')::integer-1)->>'channel'");
begin=begin.replace("OR cfg->'sequence'->0->>'delay_days' IS DISTINCT FROM '0'", "OR (p->>'step'='1' AND cfg->'sequence'->0->>'delay_days' IS DISTINCT FROM '0')");
let finish=fn(read('020_email_dispatch_lifecycle.sql'),'outreach_email_finish').replaceAll('outreach_email_finish','outreach_email_step_finish').replace("p->>'step' IS DISTINCT FROM '1'",()=>"coalesce(p->>'step','') !~ '^([1-9]|10)$'").replace("dispatch_metadata->>'step'='1'","dispatch_metadata->>'step'=p->>'step'");
const names=['outreach_email_step_check','outreach_email_step_reserve','outreach_email_step_recheck','outreach_email_step_begin','outreach_email_step_finish'].map(n=>n+'(jsonb)').join(',');
fs.writeFileSync('database/migrations/023_email_sequence_dispatch.sql',`-- Approved email steps use the existing per-org quota and per-plan/step lease identity.
-- No activation, policy seeding, budget changes or mutation of approved plans.
BEGIN;
${[follow,check,reserve,recheck,begin,finish].join('\n\n')}
REVOKE ALL ON FUNCTION ${names} FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ${names} TO n8n_user;
COMMIT;
`);
console.log('Generated migration 023; not applied. Original first-step functions retained.');
