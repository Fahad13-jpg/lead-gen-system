'use strict';
const fs=require('node:fs'),cp=require('node:child_process');
function stagingWorkflowIds(value){
 if(value===undefined||value===null||typeof value==='string'&&!value.trim())return new Set();
 if(typeof value!=='string')throw Error('STAGING_WORKFLOW_ALLOWLIST_INVALID');
 const ids=value.split(',').map(id=>id.trim());
 if(ids.some(id=>! /^[A-Za-z0-9_-]{1,100}$/.test(id))||new Set(ids).size!==ids.length)throw Error('STAGING_WORKFLOW_ALLOWLIST_INVALID');
 return new Set(ids);
}
async function guard({env,query}){
 if(!['staging','production'].includes(env.DEPLOYMENT_STAGE))throw Error('DEPLOYMENT_STAGE_REQUIRED');
 if(env.DEPLOYMENT_STAGE==='staging'&&env.ENABLE_APPROVED_AUTOMATION!=='false')throw Error('STAGING_AUTOMATION_MUST_BE_DISABLED');
 if(env.DEPLOYMENT_STAGE==='production'&&env.STAGING_APPROVED_WORKFLOW_IDS?.trim())throw Error('STAGING_WORKFLOW_ALLOWLIST_INVALID');
 const result=await query('SELECT id FROM workflow_entity WHERE active=true ORDER BY id');
 if(!Array.isArray(result?.rows))throw Error('WORKFLOW_STATE_UNAVAILABLE');
 const activeIds=result.rows.map(row=>row?.id);
 if(activeIds.some(id=>typeof id!=='string'||! /^[A-Za-z0-9_-]{1,100}$/.test(id)))throw Error('WORKFLOW_STATE_UNAVAILABLE');
 let stagingAllowedCount=0;
 if(env.DEPLOYMENT_STAGE==='staging'){
  const approved=stagingWorkflowIds(env.STAGING_APPROVED_WORKFLOW_IDS);
  if(activeIds.some(id=>!approved.has(id)))throw Error('ACTIVE_WORKFLOWS_REQUIRE_REVIEW');
  stagingAllowedCount=approved.size;
 }else if(activeIds.length>0&&env.ENABLE_APPROVED_AUTOMATION!=='true')throw Error('ACTIVE_WORKFLOWS_REQUIRE_REVIEW');
 return{active_workflows:activeIds.length,staging_allowlist_entries:stagingAllowedCount};
}
async function main(){
 const env={...process.env};if(!env.DB_POSTGRESDB_PASSWORD_FILE)throw Error('DATABASE_SECRET_REQUIRED');
 env.DB_POSTGRESDB_PASSWORD=fs.readFileSync(env.DB_POSTGRESDB_PASSWORD_FILE,'utf8').replace(/\r?\n$/,'');delete env.DB_POSTGRESDB_PASSWORD_FILE;
 if(!env.DB_POSTGRESDB_PASSWORD||env.DB_POSTGRESDB_HOST!=='postgres')throw Error('DATABASE_CONFIGURATION_REQUIRED');
 const{Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
 const client=new Client({host:env.DB_POSTGRESDB_HOST,port:5432,database:env.DB_POSTGRESDB_DATABASE,user:env.DB_POSTGRESDB_USER,password:env.DB_POSTGRESDB_PASSWORD,options:'-c default_transaction_read_only=on',connectionTimeoutMillis:5000,query_timeout:5000});
 try{await client.connect();await guard({env,query:sql=>client.query(sql)});}finally{await client.end();}
 const child=cp.spawn('n8n',['start'],{env,stdio:'inherit'});
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
 child.on('error',()=>{console.error('N8N_START_UNAVAILABLE');process.exitCode=1;});child.on('exit',code=>{process.exitCode=code===0?0:1;});
}
if(require.main===module)main().catch(error=>{console.error(error.message==='ACTIVE_WORKFLOWS_REQUIRE_REVIEW'?error.message:'N8N_RELEASE_SETUP_UNAVAILABLE');process.exitCode=1;});
module.exports={guard,stagingWorkflowIds};
