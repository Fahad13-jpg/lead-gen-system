'use strict';
// Read-only schema inspection. Never prints container environment/credentials.
const cp=require('node:child_process');
const run=(args,input)=>{const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:30000,maxBuffer:200000});if(r.status!==0)throw Error('DATABASE_INSPECTION_FAILED');return r.stdout;};
const info=JSON.parse(run(['inspect','postgres_db']))[0];
const env=Object.fromEntries(info.Config.Env.map(v=>{const i=v.indexOf('=');return[v.slice(0,i),v.slice(i+1)];}));
const sql=`BEGIN READ ONLY;
SELECT json_build_object('columns',(SELECT json_agg(json_build_object('table',table_name,'column',column_name,'type',data_type) ORDER BY table_name,ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('organizations','org_sender_memberships')),'membership_count',(SELECT count(*) FROM org_sender_memberships),'database',current_database());
ROLLBACK;`;
const lines=run(['exec','-i','postgres_db','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',env.POSTGRES_USER,'-d','lead_db'],sql).trim().split('\n');
const result=lines.find(v=>v.startsWith('{'));if(!result)throw Error('SCHEMA_RESULT_MISSING');
console.log(result);
