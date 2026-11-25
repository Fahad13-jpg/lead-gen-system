'use strict';
const fs=require('fs'),assert=require('assert/strict');
const helper=`-- Scheduling gate only. No activation, plan edits, policy seeding or quota increase.
BEGIN;
CREATE OR REPLACE FUNCTION outreach_email_window(cfg jsonb, checked_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE w jsonb; zone text; local_time timestamp; start_hour integer; end_hour integer; days jsonb;
BEGIN
 w:=cfg->'sending_window'; zone:=cfg->>'timezone';days:=w->'weekdays';
 IF checked_at IS NULL OR NOT isfinite(checked_at) OR zone IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=zone)
 OR jsonb_typeof(w) IS DISTINCT FROM 'object'
 OR coalesce(w->>'start_hour','') !~ '^([0-9]|1[0-9]|2[0-3])$'
 OR coalesce(w->>'end_hour','') !~ '^([1-9]|1[0-9]|2[0-4])$'
 OR (CASE WHEN jsonb_typeof(days)='array' THEN jsonb_array_length(days)=0 ELSE true END) THEN
 RETURN '{"allowed":false,"reason":"invalid_sending_window"}'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(days) d WHERE jsonb_typeof(d)<>'number' OR d::text !~ '^[1-7]$') THEN
 RETURN '{"allowed":false,"reason":"invalid_sending_window"}';END IF;
 start_hour:=(w->>'start_hour')::integer;end_hour:=(w->>'end_hour')::integer;
 IF start_hour>=end_hour THEN RETURN '{"allowed":false,"reason":"invalid_sending_window"}';END IF;
 local_time:=checked_at AT TIME ZONE zone;
 IF NOT days @> to_jsonb(extract(isodow FROM local_time)::integer)
 OR extract(hour FROM local_time)<start_hour OR extract(hour FROM local_time)>=end_hour THEN
 RETURN jsonb_build_object('allowed',false,'reason','outside_sending_window','timezone',zone); END IF;
 RETURN jsonb_build_object('allowed',true,'reason','within_sending_window','timezone',zone);
END $$;
`;
const source=fs.readFileSync('database/migrations/020_email_dispatch_lifecycle.sql','utf8');
let begin=source.slice(source.indexOf('CREATE OR REPLACE FUNCTION outreach_email_begin'),source.indexOf('CREATE OR REPLACE FUNCTION outreach_email_finish'));
const marker=' -- Conservative org cap:';assert(begin.includes(marker));
begin=begin.replace(marker,` -- Require the approved plan's timing to match its current campaign version.
 IF v.body->'artifacts'->'schedule'->>'timezone' IS DISTINCT FROM cfg->>'timezone'
 OR v.body->'artifacts'->'schedule'->'sending_window' IS DISTINCT FROM cfg->'sending_window'
 OR v.body->'artifacts'->'schedule'->'sequence' IS DISTINCT FROM cfg->'sequence'
 OR cfg->'sequence'->0->>'channel' IS DISTINCT FROM 'email'
 OR cfg->'sequence'->0->>'delay_days' IS DISTINCT FROM '0' THEN
 RETURN '{"ready":false,"execution_authorized":false,"reason":"approved_schedule_required"}'; END IF;
 ck:=outreach_email_window(cfg,clock_timestamp());
 IF ck->>'allowed' IS DISTINCT FROM 'true' THEN
 RETURN ck||jsonb_build_object('ready',false,'execution_authorized',false); END IF;
 ck:=outreach_dispatch_recheck(p);
 IF ck->>'ready' IS DISTINCT FROM 'true' THEN RETURN ck;END IF;
`+marker);
fs.writeFileSync('database/migrations/021_email_sending_window.sql',helper+begin+`REVOKE ALL ON FUNCTION outreach_email_window(jsonb,timestamptz),outreach_email_begin(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outreach_email_window(jsonb,timestamptz),outreach_email_begin(jsonb) TO n8n_user;
COMMIT;
`);
console.log('Generated unapplied migration 021; 020 preserved.');
