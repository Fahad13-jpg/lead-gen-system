'use strict';
const fs=require('node:fs'),{parse}=require('../../dashboard/node_modules/flatted'),{localPool}=require('../dashboard/start-local-auth.cjs');
async function main(){const db=localPool();try{
 const local=JSON.parse(fs.readFileSync('workflows/06C_outreach_strategy_generator.json','utf8'));
 const live=(await db.query("SELECT nodes FROM workflow_entity WHERE id='27W04lgTGdgFMWUx'")).rows[0];
 console.log(JSON.stringify({node_parity:local.nodes.filter(n=>['Prepare Strategy','Validate and Assemble Draft','Build Preview'].includes(n.name)).map(n=>({name:n.name,identical:JSON.stringify(n.parameters)===JSON.stringify(live.nodes.find(x=>x.name===n.name)?.parameters)}))}));
 for(const name of ['strong','weak','thin']){const path='.local/strategy-quality-approved-20261108/'+name+'.json';if(!fs.existsSync(path))continue;const record=JSON.parse(fs.readFileSync(path));if(!record.job_id)continue;
 const job=(await db.query('SELECT id,execution_id,status FROM strategy_jobs WHERE org_id=1 AND id='+Number(record.job_id))).rows[0];
 const row=(await db.query('SELECT d.data FROM strategy_jobs j JOIN execution_data d ON d."executionId"=j.execution_id::integer WHERE j.id='+Number(record.job_id)+' AND j.org_id=1')).rows[0];if(!row){console.log(JSON.stringify({case:name,job,raw_execution_retained:false}));continue;}
 const data=parse(row.data),runs=data.resultData?.runData||data.data?.resultData?.runData;const first=n=>runs?.[n]?.[0]?.data?.main?.[0]?.[0]?.json;
 const p=first('Prepare Strategy'),r=first('Compose With Groq');
 const evidence={case:name,job_id:record.job_id,fit:p?.prepared?.brief?.qualifier,permitted_channels:p?.prepared?.brief?.permitted_channels,facts:p?.prepared?.brief?.facts,http_status:r?.statusCode,finish_reason:r?.body?.choices?.[0]?.finish_reason,reply:r?.body?.choices?.[0]?.message?.content,usage:r?.body?.usage};
 fs.writeFileSync(path.replace('.json','-evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 }
 }finally{await db.end();}}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
