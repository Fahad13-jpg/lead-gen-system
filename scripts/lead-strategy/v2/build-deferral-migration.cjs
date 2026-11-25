'use strict';
const fs=require('fs'),assert=require('assert/strict');
const read=n=>fs.readFileSync('database/migrations/'+n,'utf8');
function fn(source,name){const start=source.indexOf('CREATE OR REPLACE FUNCTION '+name+'(');assert(start>=0);const end=source.indexOf('END $$;',start);assert(end>start);return source.slice(start,end+7);}
let follow=fn(read('023_email_sequence_dispatch.sql'),'outreach_followup_check');
const ignore="AND NOT (dispatch_metadata->>'state'='reserved'";
assert(follow.includes(ignore));follow=follow.replace(ignore,"AND NOT outreach_email_can_resume(dispatch_metadata)\n "+ignore);
let reserve=fn(read('023_email_sequence_dispatch.sql'),'outreach_email_step_reserve');
const conflict=` IF NOT FOUND THEN RETURN '{"ready":false,"reason":"dispatch_already_reserved_or_recorded","execution_authorized":false}';END IF;`;
assert(reserve.includes(conflict));
reserve=reserve.replace(conflict,` IF NOT FOUND THEN
 SELECT * INTO event FROM outreach_activities WHERE org_id=o AND dispatch_metadata->>'plan_id'=pid::text
 AND dispatch_metadata->>'step'=p->>'step' FOR UPDATE;
 IF NOT FOUND OR NOT outreach_email_can_resume(event.dispatch_metadata)
 OR event.dispatch_metadata->>'content_hash' IS DISTINCT FROM checked->>'content_hash' THEN
 RETURN '{"ready":false,"reason":"dispatch_already_reserved_or_recorded","execution_authorized":false}'; END IF;
 UPDATE outreach_activities SET dispatch_metadata=(dispatch_metadata-'deferred_until'-'defer_reason')||jsonb_build_object(
 'lease',l,'lease_until',clock_timestamp()+interval '5 minutes') WHERE id=event.id AND org_id=o RETURNING * INTO event;
 END IF;`);
let begin=fn(read('026_mailbox_capacity.sql'),'outreach_email_step_begin');
const quota=`IF used>=cap THEN RETURN jsonb_build_object('ready',false,'execution_authorized',false,'reason','daily_quota_reached','used',used,'limit',cap); END IF;`;
assert(begin.includes(quota));begin=begin.replace(quota,`IF used>=cap THEN RETURN outreach_email_defer(p,'daily_quota_reached',((clock_timestamp() AT TIME ZONE 'UTC')::date+1)::timestamp AT TIME ZONE 'UTC'); END IF;`);
const capacity=`RETURN mailbox_guard||'{"ready":false,"execution_authorized":false}'::jsonb; END IF;`;
assert(begin.includes(capacity));begin=begin.replace(capacity,`IF mailbox_guard->>'reason' IN ('mailbox_rolling_limit_reached','mailbox_spacing_required') THEN
 RETURN outreach_email_defer(p,mailbox_guard->>'reason',(mailbox_guard->>'next_eligible_at')::timestamptz); END IF;
 RETURN mailbox_guard||'{"ready":false,"execution_authorized":false}'::jsonb; END IF;`);
const window=`RETURN ck||jsonb_build_object('ready',false,'execution_authorized',false); END IF;`;
assert(begin.includes(window));begin=begin.replace(window,`RETURN outreach_email_defer(p,'outside_sending_window',clock_timestamp()+interval '5 minutes'); END IF;`);
const helpers=fs.readFileSync('scripts/lead-strategy/v2/email-deferral.sql','utf8');
fs.writeFileSync('database/migrations/027_email_safe_deferral.sql',`-- Local candidate; no deployment/activation. Reuse only provably unattempted reservations.
BEGIN;
${helpers}
${follow}
${reserve}
${begin}
REVOKE ALL ON FUNCTION outreach_email_can_resume(jsonb),outreach_email_defer(jsonb,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_email_can_resume(jsonb),outreach_email_defer(jsonb,text,timestamptz) TO n8n_user;
COMMIT;
`);
console.log('027 generated locally; no import or live migration.');
