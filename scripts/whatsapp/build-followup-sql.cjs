'use strict';
// Local SQL artifact builder only; never connects to a database.
const fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('database/migrations/046_whatsapp_foundation.sql','utf8');
function functionSql(name){const start=source.indexOf('CREATE OR REPLACE FUNCTION '+name+'('),end=source.indexOf('END $$;',start);assert(start>=0&&end>start);return source.slice(start,end+7);}
function replaceOnce(text,from,to){assert.equal(text.split(from).length,2,'Expected one SQL anchor: '+from.slice(0,80));return text.replace(from,()=>to);}
let gate=functionSql('outreach_whatsapp_gate');
gate=replaceOnce(gate,'FUNCTION outreach_whatsapp_gate(', 'FUNCTION outreach_whatsapp_gate_046(');
gate=replaceOnce(gate,'local_time timestamp;w jsonb;', 'local_time timestamp;w jsonb;requested integer;seq jsonb;entry jsonb;previous_entry jsonb;previous_activity outreach_activities%ROWTYPE;idx integer;');
gate=replaceOnce(gate,"IF coalesce(p->>'step','1')<>'1' THEN RETURN '{\"allowed\":false,\"reason\":\"followup_template_review_required\"}';END IF;", `IF coalesce(p->>'step','1') !~ '^([1-9]|10)$' THEN RETURN '{"allowed":false,"reason":"invalid_whatsapp_step"}';END IF;
 requested:=coalesce(p->>'step','1')::integer;`);
gate=replaceOnce(gate,"d:=x->'campaign'->'config'->'whatsapp_dispatch';a:=v.body->'artifacts'->'whatsapp_dispatch';c:=d->'connection';t:=d->'template';permission:=d->'consents'->v.lead_id::text;",`d:=x->'campaign'->'config'->'whatsapp_dispatch';a:=v.body->'artifacts'->'whatsapp_dispatch';c:=d->'connection';t:=d->'template';permission:=d->'consents'->v.lead_id::text;
 seq:=v.body->'artifacts'->'whatsapp_sequence';
 IF seq IS NOT NULL THEN
  IF seq->>'version' IS DISTINCT FROM 'whatsapp_sequence_v1' OR seq->>'org_id' IS DISTINCT FROM v.org_id::text OR seq->>'lead_id' IS DISTINCT FROM v.lead_id::text OR seq->'execution_authorized' IS DISTINCT FROM 'false'::jsonb
  OR jsonb_typeof(seq->'steps') IS DISTINCT FROM 'array' OR jsonb_typeof(x->'campaign'->'config'->'sequence') IS DISTINCT FROM 'array' THEN RETURN '{"allowed":false,"reason":"invalid_whatsapp_sequence"}';END IF;
  IF jsonb_array_length(seq->'steps') NOT BETWEEN 1 AND 10 OR jsonb_array_length(seq->'steps')<>jsonb_array_length(x->'campaign'->'config'->'sequence') OR requested>jsonb_array_length(seq->'steps') THEN RETURN '{"allowed":false,"reason":"invalid_whatsapp_sequence"}';END IF;
  FOR idx IN 1..jsonb_array_length(seq->'steps') LOOP
   entry:=seq->'steps'->(idx-1);
   IF entry->'step' IS DISTINCT FROM to_jsonb(idx) OR entry->>'channel' IS DISTINCT FROM 'whatsapp' OR entry->'execution_authorized'='true'::jsonb
   OR entry->'artifact'->'execution_authorized' IS DISTINCT FROM 'false'::jsonb
   OR entry->'previous_step' IS DISTINCT FROM (CASE WHEN idx=1 THEN 'null'::jsonb ELSE to_jsonb(idx-1) END)
   OR entry->>'delay_basis' IS DISTINCT FROM (CASE WHEN idx=1 THEN 'initial' ELSE 'previous_confirmed_send' END)
   OR coalesce(entry->>'delay_days','') !~ '^([0-9]|[1-5][0-9]|60)$'
   OR entry->'delay_days' IS DISTINCT FROM x->'campaign'->'config'->'sequence'->(idx-1)->'delay_days'
   OR x->'campaign'->'config'->'sequence'->(idx-1)->'step' IS DISTINCT FROM to_jsonb(idx)
   OR x->'campaign'->'config'->'sequence'->(idx-1)->>'channel' IS DISTINCT FROM 'whatsapp'
   OR (idx=1 AND entry->'delay_days' IS DISTINCT FROM '0'::jsonb) THEN RETURN '{"allowed":false,"reason":"invalid_whatsapp_sequence"}';END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(seq->'steps') WITH ORDINALITY q(prior,n) WHERE n<idx AND prior->'artifact'->>'rendered'=entry->'artifact'->>'rendered') THEN RETURN '{"allowed":false,"reason":"repeated_step_message_requires_revision"}';END IF;
  END LOOP;
  IF seq->'steps'->0->'artifact' IS DISTINCT FROM a THEN RETURN '{"allowed":false,"reason":"first_step_artifact_changed"}';END IF;
  entry:=seq->'steps'->(requested-1);a:=entry->'artifact';
  t:=coalesce(nullif(d->'templates_by_step'->requested::text,'null'::jsonb),CASE WHEN requested=1 THEN d->'template' END);
 ELSIF requested<>1 OR d ? 'templates_by_step' THEN RETURN '{"allowed":false,"reason":"followup_template_review_required"}';END IF;`);
gate=replaceOnce(gate,"rendered IS DISTINCT FROM v.body->'artifacts'->>'whatsapp_draft'", "(requested=1 AND rendered IS DISTINCT FROM v.body->'artifacts'->>'whatsapp_draft')");
gate=replaceOnce(gate," RETURN jsonb_build_object('allowed',true,'artifact',a,'config',d,'lead_id',v.lead_id,'org_id',v.org_id,'plan_id',v.id,'execution_authorized',false);",` IF requested>1 THEN
  previous_entry:=seq->'steps'->(requested-2);
  SELECT * INTO previous_activity FROM outreach_activities z WHERE z.org_id=v.org_id AND z.channel='whatsapp' AND z.lead_id=v.lead_id AND z.dispatch_metadata->>'version'='whatsapp_v1' AND z.dispatch_metadata->>'plan_id'=v.id::text AND z.dispatch_metadata->>'step'=(requested-1)::text;
  IF NOT FOUND OR previous_activity.status<>'provider_accepted' OR previous_activity.external_id IS NULL OR previous_activity.sent_at IS NULL
  OR previous_activity.dispatch_metadata->>'state' IS DISTINCT FROM 'provider_accepted' OR previous_activity.dispatch_metadata->>'delivery_status'='failed'
  OR previous_activity.dispatch_metadata->>'content_hash' IS DISTINCT FROM v.content_hash OR previous_activity.dispatch_metadata->'artifact' IS DISTINCT FROM previous_entry->'artifact'
  OR previous_activity.dispatch_metadata->>'recipient' IS DISTINCT FROM a->>'recipient' OR previous_activity.dispatch_metadata->>'connection_id' IS DISTINCT FROM a->>'connection_id'
  THEN RETURN '{"allowed":false,"reason":"previous_confirmed_send_required"}';END IF;
  IF (previous_activity.sent_at AT TIME ZONE 'UTC')+(entry->>'delay_days')::integer*interval '1 day'>now() THEN RETURN '{"allowed":false,"reason":"followup_not_due"}';END IF;
 END IF;
 RETURN jsonb_build_object('allowed',true,'artifact',a,'config',d,'lead_id',v.lead_id,'org_id',v.org_id,'plan_id',v.id,'step',requested,'execution_authorized',false);`);
let begin=functionSql('outreach_whatsapp_begin');
begin=replaceOnce(begin,"'step','1','content_hash'", "'step',g->>'step','content_hash'");
const queue=`CREATE OR REPLACE FUNCTION outreach_whatsapp_queue(p jsonb) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('execution_authorized',false,'items',coalesce(jsonb_agg(candidate ORDER BY created_at,id,step),'[]'::jsonb)) FROM (
  SELECT v.created_at,v.id,s.step,jsonb_build_object('org_id',v.org_id,'plan_id',v.id::text,'content_hash',v.content_hash,'step',s.step) AS candidate
  FROM (SELECT * FROM strategy_plans WHERE org_id=CASE WHEN p->>'org_id' ~ '^[1-9][0-9]{0,8}$' THEN (p->>'org_id')::integer ELSE 0 END AND body->'artifacts'->'whatsapp_dispatch'->>'version'='whatsapp_v1' ORDER BY created_at,id LIMIT 50) v
  CROSS JOIN LATERAL generate_series(1,CASE WHEN jsonb_typeof(v.body->'artifacts'->'whatsapp_sequence'->'steps')='array' THEN least(10,jsonb_array_length(v.body->'artifacts'->'whatsapp_sequence'->'steps')) ELSE 1 END) s(step)
  WHERE NOT EXISTS(SELECT 1 FROM outreach_activities a WHERE a.org_id=v.org_id AND a.channel='whatsapp' AND a.dispatch_metadata->>'plan_id'=v.id::text AND a.dispatch_metadata->>'step'=s.step::text)
  AND outreach_whatsapp_gate(jsonb_build_object('org_id',v.org_id,'plan_id',v.id::text,'content_hash',v.content_hash,'step',s.step))->>'allowed'='true'
  ORDER BY v.created_at,v.id,s.step LIMIT 50
 ) candidates;
$$;`;
const output=`-- LOCAL / UNAPPLIED. Requires 046 and 047. Generated by scripts/whatsapp/build-followup-sql.cjs.
-- NOT RELEASE-READY: multi-day template freshness conflicts with immutable snapshot approval.
-- See documentation/WHATSAPP_REMAINING_SCOPE.md; stale evidence intentionally stays blocked.
-- Reuses the 046 gate checks and 047 incoming suppression wrapper; no new tables/webhooks.
-- Existing function OIDs, leases, reservations, approval flow and budget checks are retained.
BEGIN;
${gate}
${begin}
${queue}
REVOKE ALL ON FUNCTION outreach_whatsapp_gate_046(jsonb),outreach_whatsapp_begin(jsonb),outreach_whatsapp_queue(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_whatsapp_gate_046(jsonb),outreach_whatsapp_begin(jsonb),outreach_whatsapp_queue(jsonb) TO n8n_user;
COMMIT;
`;
fs.writeFileSync('database/migrations/048_whatsapp_followups.sql',output);
console.log('Built local migration 048; no database connection or workflow import.');
