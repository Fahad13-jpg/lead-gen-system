'use strict';
const cp=require('node:child_process'),assert=require('node:assert/strict');
const query=`BEGIN READ ONLY;
SELECT json_agg(x) FROM (SELECT id,status,"startedAt","stoppedAt" FROM execution_entity WHERE "workflowId"='managedWhatsappCallback046' ORDER BY id DESC LIMIT 8) x;
COMMIT;`;
const r=cp.spawnSync('docker',['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],{input:query,encoding:'utf8',timeout:30000});assert.equal(r.status,0,'CALLBACK_RECEIPT_LOOKUP_FAILED');
const line=r.stdout.split('\n').find(s=>s.startsWith('[')||s==='null');
console.log(JSON.stringify({executions:line?JSON.parse(line):null,payloads_read:false,note:'Workflow success alone does not prove reply correlation or HTTP acceptance.'}));
