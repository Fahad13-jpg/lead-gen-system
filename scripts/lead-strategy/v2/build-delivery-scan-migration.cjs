'use strict';
const fs=require('fs'),assert=require('assert/strict');
function fn(source,name){const s=source.indexOf('CREATE OR REPLACE FUNCTION '+name+'('),e=source.indexOf('END $$;',s);assert(s>=0&&e>s);return source.slice(s,e+7);}
let finish=fn(fs.readFileSync('database/migrations/025_gmail_reply_scan.sql','utf8'),'outreach_reply_scan_finish');
finish=finish.replace('reviews jsonb;','reviews jsonb; previous jsonb; next_scan jsonb;');
const marker=' -- Validate the complete batch before any write.';assert(finish.includes(marker));
finish=finish.replace(marker,()=>` previous:=coalesce(a.dispatch_metadata->'delivery_scan','{}'::jsonb);
 next_scan:=p->'delivery_scan_next';
 IF jsonb_typeof(next_scan) IS DISTINCT FROM 'object' OR p->'delivery_scan_previous' IS DISTINCT FROM previous THEN
 RETURN '{"saved":false,"reason":"delivery_scan_stale_or_missing"}'; END IF;
 IF jsonb_typeof(next_scan->'complete') IS DISTINCT FROM 'boolean'
 OR jsonb_typeof(next_scan->'review_required') IS DISTINCT FROM 'boolean'
 OR coalesce(next_scan->>'window_start','') !~ '^[1-9][0-9]{0,15}$'
 OR coalesce(next_scan->>'window_end','') !~ '^[1-9][0-9]{0,15}$' THEN
 RETURN '{"saved":false,"reason":"delivery_scan_invalid"}'; END IF;
 IF (next_scan->>'window_end')::bigint<(next_scan->>'window_start')::bigint
 OR (next_scan->>'window_end')::bigint>extract(epoch FROM clock_timestamp())*1000+1000 THEN
 RETURN '{"saved":false,"reason":"delivery_scan_window_invalid"}'; END IF;
 IF previous->>'complete'='false' THEN
 IF next_scan->'window_start' IS DISTINCT FROM previous->'window_start' OR next_scan->'window_end' IS DISTINCT FROM previous->'window_end' THEN
 RETURN '{"saved":false,"reason":"delivery_scan_window_changed"}'; END IF;
 ELSIF previous ? 'checked_through' AND next_scan->'window_start' IS DISTINCT FROM previous->'checked_through' THEN
 RETURN '{"saved":false,"reason":"delivery_scan_checkpoint_gap"}'; END IF;
 IF next_scan->>'complete'='true' THEN
 IF next_scan->'checked_through' IS DISTINCT FROM next_scan->'window_end' OR nullif(next_scan->>'next_page_token','') IS NOT NULL THEN
 RETURN '{"saved":false,"reason":"delivery_scan_checkpoint_invalid"}'; END IF;
 ELSE
 IF nullif(next_scan->>'next_page_token','') IS NULL OR length(next_scan->>'next_page_token')>2000
 OR next_scan->>'next_page_token'=previous->>'next_page_token'
 OR coalesce(next_scan->'checked_through','null'::jsonb) IS DISTINCT FROM coalesce(previous->'checked_through','null'::jsonb) THEN
 RETURN '{"saved":false,"reason":"delivery_scan_page_invalid"}'; END IF;
 END IF;
 next_scan:=jsonb_set(next_scan,'{review_required}',to_jsonb(previous->>'review_required'='true' OR next_scan->>'review_required'='true' OR jsonb_array_length(p->'reviews')>0));
`+marker);
// Avoid SQL NULL making a newly clear scan's review flag null.
finish=finish.replace("previous->>'review_required'='true' OR", "coalesce(previous->>'review_required'='true',false) OR");
finish=finish.replace("'reply_scan',jsonb_build_object", "'delivery_scan',next_scan,'reply_scan',jsonb_build_object");
let gate=fn(fs.readFileSync('database/migrations/028_email_contact_gate.sql','utf8'),'outreach_email_contact_gate');
const check="   checked:=(a.dispatch_metadata->'reply_scan'->>'checked_at')::timestamptz;";assert(gate.includes(check));
gate=gate.replace(check,()=>`   IF a.dispatch_metadata->'delivery_scan'->>'review_required'='true' THEN RETURN '{"allowed":false,"reason":"conversation_review_required"}'; END IF;
   IF a.dispatch_metadata->'delivery_scan'->>'complete' IS DISTINCT FROM 'true'
   OR coalesce(a.dispatch_metadata->'delivery_scan'->>'checked_through','') !~ '^[1-9][0-9]{0,15}$' THEN
   RETURN '{"allowed":false,"reason":"reply_check_stale"}'; END IF;
   checked:=to_timestamp((a.dispatch_metadata->'delivery_scan'->>'checked_through')::double precision/1000);
   IF checked>statement_timestamp() OR checked<statement_timestamp()-interval '5 minutes' THEN RETURN '{"allowed":false,"reason":"reply_check_stale"}'; END IF;
`+check);
fs.writeFileSync('database/migrations/029_delivery_scan_checkpoint.sql','-- Local/scratch candidate. Compare-and-set checkpoint; no new tables.\nBEGIN;\n'+finish+'\n'+gate+'\nCOMMIT;\n');
console.log('029 generated locally.');
