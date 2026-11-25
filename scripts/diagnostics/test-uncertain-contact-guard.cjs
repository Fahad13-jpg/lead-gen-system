'use strict';
const fs=require('fs'),assert=require('assert/strict'),{docker}=require('./gmail-test-client.cjs');
const pg='lead_diag_pg_20261011',db='scratch_email_release_20261019';
assert.equal(JSON.parse(docker(['inspect',pg]))[0].HostConfig.NetworkMode,'none');
const sql=q=>docker(['exec','-i',pg,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d',db],q);
sql('SET ROLE email_release_owner_20261019;\n'+fs.readFileSync('database/migrations/031_email_uncertain_contact_guard.sql','utf8'));
let fixture=fs.readFileSync('.local/followup-readiness-fixture.sql','utf8').replace('SET LOCAL ROLE v2_scratch_runtime;','SET LOCAL ROLE email_release_owner_20261019;');
fixture=fixture.replace('END $test$;',`
 ASSERT outreach_email_contact_gate(1,167,'test@example.org','demo@example.org')->>'reason'='contact_attempt_requires_reconciliation';
 ASSERT outreach_email_contact_gate(1,999999,'test@example.org','different@example.org')->>'reason'='contact_attempt_requires_reconciliation';
 ASSERT outreach_email_contact_gate(999999,167,'test@example.org','demo@example.org')->>'allowed'='true';
 -- Only fixture rows are changed, inside this rollback transaction.
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||'{"state":"attempting"}' WHERE org_id=1 AND lead_id=167;
 ASSERT outreach_email_contact_gate(1,167,'new@example.org','demo@example.org')->>'reason'='contact_attempt_requires_reconciliation';
 UPDATE outreach_activities SET dispatch_metadata=dispatch_metadata||'{"state":"reserved"}' WHERE org_id=1 AND lead_id=167;
 ASSERT outreach_email_contact_gate(1,167,'test@example.org','demo@example.org')->>'allowed'='true';
END $test$;`);
console.log(sql(fixture));console.log('PASS: ambiguous/attempting contact blocks across plans, lead aliases and senders; tenant isolation and unattempted reservation behavior retained. Scratch only.');
