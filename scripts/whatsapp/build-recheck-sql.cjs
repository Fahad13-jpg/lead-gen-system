'use strict';
// Offline generation only. No database, provider or workflow operations.
const fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('database/migrations/048_whatsapp_followups.sql','utf8');
const start=source.indexOf('CREATE OR REPLACE FUNCTION outreach_whatsapp_gate_046('),end=source.indexOf('END $$;',start);
assert(start>=0&&end>start);let gate=source.slice(start,end+7);
function change(from,to){assert.equal(gate.split(from).length,2,'SQL anchor changed');gate=gate.replace(from,()=>to);}
change('idx integer;','idx integer;observation jsonb;recheck_ok boolean:=false;');
change("t:=coalesce(nullif(d->'templates_by_step'->requested::text,'null'::jsonb),CASE WHEN requested=1 THEN d->'template' END);",`t:=coalesce(nullif(d->'templates_by_step'->requested::text,'null'::jsonb),CASE WHEN requested=1 THEN d->'template' END);
  IF requested>1 THEN
   SELECT * INTO previous_activity FROM outreach_activities z WHERE z.org_id=v.org_id AND z.lead_id=v.lead_id AND z.channel='whatsapp' AND z.dispatch_metadata->>'version'='whatsapp_v1' AND z.dispatch_metadata->>'plan_id'=v.id::text AND z.dispatch_metadata->>'step'=(requested-1)::text;
   observation:=previous_activity.dispatch_metadata->'whatsapp_rechecks'->requested::text;
   IF observation IS NOT NULL THEN
    recheck_ok:=outreach_whatsapp_recheck_valid(observation,jsonb_build_object('org_id',v.org_id,'plan_id',v.id::text,'content_hash',v.content_hash,'step',requested,'previous_activity_id',previous_activity.id,'connection_id',a->>'connection_id','credential_ref',a->>'credential_ref','phone_number_id',a->>'phone_number_id','waba_id',a->>'waba_id','api_version',a->>'api_version','template',t-'checked_at'));
    IF NOT recheck_ok THEN RETURN '{"allowed":false,"reason":"provider_recheck_required"}';END IF;
   END IF;
  END IF;`);
change("NOT coalesce((c->>'verified_at')::timestamptz BETWEEN now()-interval '24 hours' AND now(),false)","(NOT recheck_ok AND NOT coalesce((c->>'verified_at')::timestamptz BETWEEN now()-interval '24 hours' AND now(),false))");
change("NOT coalesce((t->>'checked_at')::timestamptz BETWEEN now()-interval '24 hours' AND now(),false)","(NOT recheck_ok AND NOT coalesce((t->>'checked_at')::timestamptz BETWEEN now()-interval '24 hours' AND now(),false))");
const helpers=fs.readFileSync('scripts/whatsapp/recheck-functions.sql','utf8');
// Keep stale due candidates reachable for an explicitly enabled recheck port.
// No claim/send is authorized here; the runner must re-enter the full gate.
const queueStart=source.indexOf('CREATE OR REPLACE FUNCTION outreach_whatsapp_queue('),queueEnd=source.indexOf('$$;',queueStart);
let queue=source.slice(queueStart,queueEnd+3);
const queueGuard="outreach_whatsapp_gate(jsonb_build_object('org_id',v.org_id,'plan_id',v.id::text,'content_hash',v.content_hash,'step',s.step))->>'allowed'='true'";
assert.equal(queue.split(queueGuard).length,2);
queue=queue.replace(queueGuard,()=>`(${queueGuard} OR (s.step>1 AND outreach_whatsapp_recheck_input(jsonb_build_object('org_id',v.org_id,'plan_id',v.id::text,'content_hash',v.content_hash,'step',s.step))->>'ready'='true'))`);
fs.writeFileSync('database/migrations/049_whatsapp_recheck.sql',`-- LOCAL / UNAPPLIED. Requires 046, 047, 048. No new tables/webhooks.
-- Mutable provider observations use existing predecessor dispatch metadata.
-- Never changes an approved plan, campaign config, hash, fingerprint, expiry or quote.
-- Connector wiring/live recheck behavior remains UNVERIFIED; do not deploy yet.
BEGIN;
${helpers}
${gate}
${queue}
REVOKE ALL ON FUNCTION outreach_whatsapp_recheck_valid(jsonb,jsonb),outreach_whatsapp_recheck_input(jsonb),outreach_whatsapp_recheck_store(jsonb),outreach_whatsapp_gate_046(jsonb),outreach_whatsapp_queue(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_whatsapp_recheck_valid(jsonb,jsonb),outreach_whatsapp_recheck_input(jsonb),outreach_whatsapp_recheck_store(jsonb),outreach_whatsapp_gate_046(jsonb),outreach_whatsapp_queue(jsonb) TO n8n_user;
COMMIT;
`);
console.log('Built local migration 049; no external operations.');
