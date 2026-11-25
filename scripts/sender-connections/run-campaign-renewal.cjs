'use strict';
const{tick}=require('./campaign-renewal-worker.cjs'),{ports}=require('../dashboard/campaign-renewal-ports.cjs');
async function run({enabled=false,pool,execute,installAndStart,now=Date.now}){
 if(!enabled)return{state:'disabled',campaigns:0,issued:0};
 const rows=(await pool.query(`SELECT c.org_id,c.id AS campaign_id FROM strategy_campaigns c JOIN organizations o ON o.id=c.org_id AND o.status='active' JOIN strategy_campaign_versions v ON v.org_id=c.org_id AND v.campaign_id=c.id AND v.version=c.version WHERE v.config#>>'{_email_execution,status}'='approved' AND v.config#>'{_email_execution,automatic_enabled}'='true'::jsonb AND v.config#>>'{_email_execution,scope,config_hash}'=md5((v.config-'_email_execution')::text) AND EXISTS(SELECT 1 FROM org_sender_memberships m WHERE m.org_id=c.org_id AND m.subject=v.config#>>'{_email_execution,actor_subject}' AND m.active AND m.role IN ('owner','admin')) ORDER BY v.config#>>'{_email_execution,last_renewal,at}' NULLS FIRST,c.id LIMIT 5`)).rows;
 const adapter=ports({pool,execute,installAndStart,now}),results=[];
 for(const row of rows){try{results.push(await tick({...row,campaign_id:Number(row.campaign_id),enabled:true},adapter));}catch{results.push({state:'renewal_unconfirmed',issued:0});}}
 return{state:'tick_complete',campaigns:rows.length,issued:results.reduce((n,r)=>n+r.issued,0),states:results.map(r=>r.state)};
}
async function main(){
 if(process.env.EMAIL_CAMPAIGN_RENEWAL_ENABLED!=='true'){console.log(JSON.stringify({state:'disabled',campaigns:0,issued:0,provider_requests:0}));return;}
 if(!process.argv.includes('--run-local'))throw Error('EXPLICIT_LOCAL_RUN_REQUIRED');
 const{localPool}=require('../dashboard/start-local-auth.cjs'),pool=localPool(),writer=localPool({registryWrite:true});try{const execute=sql=>writer.query(sql),installAndStart=require('../dashboard/campaign-slice-installer.cjs').create({pool,execute});console.log(JSON.stringify(await run({enabled:true,pool,execute,installAndStart})));}finally{await Promise.all([pool.end(),writer.end()]);}
}
module.exports={run,main};if(require.main===module)main().catch(()=>{console.error('CAMPAIGN_RENEWAL_STOPPED; no automatic retry');process.exitCode=1;});
