'use strict';
// Local operator entry point. Default is status only; never a schedule or HTTP action.
const fs=require('node:fs'),path=require('node:path');
async function main(){
 const dir=path.resolve(__dirname,'../../.local/calling-transport'),mode=process.argv[2]||'--status';if(!['--status','--once','--poll'].includes(mode))throw Error('INVALID_MODE');
 let config={enabled:false};try{config=JSON.parse(fs.readFileSync(path.join(dir,'config.json'),'utf8'));}catch{}
 if(mode==='--status'){console.log(JSON.stringify({send_enabled:config.enabled===true,scheduled:false,provider_requests:0}));return;}
 if(mode==='--once'&&config.enabled!==true){console.log(JSON.stringify({state:'disabled',provider_requests:0}));return;}
 if(!Number.isSafeInteger(config.org_id)||config.org_id<=0)throw Error('OPERATOR_ORG_REQUIRED');
 const pool=require('../dashboard/start-local-auth.cjs').localPool({registryWrite:true});
 try{const transaction=async operation=>{const client=await pool.connect();try{await client.query('BEGIN');const r=await operation(client);await client.query('COMMIT');return r;}catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}};
  const account=require('./account-provider.cjs');const worker=require('./owned-transport.cjs').worker({pool,transaction,vault:account.vault(path.resolve(dir,'../calling-accounts/encryption.key')),inspection:account.provider(),transport:require('./owned-transport.cjs').provider(),enabled:()=>config.enabled===true,
   toolBinding:async a=>{try{const rows=JSON.parse(fs.readFileSync(path.join(dir,'tool-bindings.json'),'utf8'));if(!Array.isArray(rows))return null;return rows.find(b=>b.org_id===a.org_id&&b.account_version===a.version)||null;}catch{return null;}}});
  console.log(JSON.stringify(await worker[mode==='--poll'?'poll':'once'](config.org_id)));
 }finally{await pool.end();}
}
if(require.main===module)main().catch(()=>{console.error('CALLING_OPERATOR_CHECK_FAILED');process.exitCode=1;});
