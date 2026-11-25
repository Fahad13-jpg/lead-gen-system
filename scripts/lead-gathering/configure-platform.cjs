// Run inside n8n. The existing server environment supplies credentials; never log them.
// Requires explicit operator budget. Does not fund any customer wallet.
const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
const budget=Number(process.argv.find(x=>x.startsWith('--budget='))?.split('=')[1]);
const key=process.env.APIFY_API_KEY;
if(!Number.isFinite(budget)||budget<=0||!key)throw new Error('Positive --budget and server APIFY_API_KEY are required');
const db=new Client({host:process.env.DB_POSTGRESDB_HOST,port:Number(process.env.DB_POSTGRESDB_PORT||5432),database:process.env.DB_POSTGRESDB_DATABASE,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD});
let connected=false;
(async()=>{
 const r=await fetch('https://api.apify.com/v2/users/me',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw new Error('Server Apify account verification failed: HTTP '+r.status);
 const user=(await r.json()).data;if(!user?.id)throw new Error('Provider identity missing');
 await db.connect();connected=true;
 const byok=await db.query("SELECT id,org_id,api_key FROM gathering_accounts WHERE mode='byok' AND enabled ORDER BY id");
 for(const row of byok.rows){
  const v=await fetch('https://api.apify.com/v2/users/me',{headers:{Authorization:'Bearer '+row.api_key},signal:AbortSignal.timeout(30000)});
  if(!v.ok)throw new Error('Cannot verify existing BYOK identity for organization '+row.org_id+'; HTTP '+v.status);
  row.provider_user_id=(await v.json()).data?.id;if(!row.provider_user_id)throw new Error('BYOK identity missing');
 }
 await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(49302811)');
 const accounts=await db.query('SELECT id FROM gathering_accounts ORDER BY id FOR UPDATE');
 const active=await db.query("SELECT count(*) n FROM scraping_jobs WHERE provider_account_id=ANY($1::bigint[]) AND (status IN ('queued','pending','running','needs_review') OR (actual_cost IS NULL AND apify_actor_run_id IS NOT NULL))",[accounts.rows.map(x=>x.id)]);
 if(Number(active.rows[0].n))throw new Error('Selected account has unsettled jobs; finish those before changing configuration');
 const aliases=[];const seen=new Set([user.id]);
 for(const row of byok.rows){
  const unchanged=await db.query('SELECT id FROM gathering_accounts WHERE id=$1 AND api_key=$2',[row.id,row.api_key]);if(!unchanged.rowCount)throw new Error('BYOK key changed during verification; retry configuration');
  if(seen.has(row.provider_user_id)){await db.query('UPDATE gathering_accounts SET enabled=false,provider_user_id=NULL WHERE id=$1',[row.id]);aliases.push(row.org_id);}
  else{await db.query('UPDATE gathering_accounts SET provider_user_id=$2 WHERE id=$1',[row.id,row.provider_user_id]);seen.add(row.provider_user_id);}
 }
 await db.query("UPDATE gathering_accounts SET api_key=$1,provider_user_id=$2,monthly_budget_usd=$3,enabled=true WHERE mode='platform'",[key,user.id,budget]);
 await db.query('COMMIT');console.log(JSON.stringify({platform_configured:true,monthly_budget_usd:budget,verified_byok_connections:byok.rows.length,duplicate_byok_connections_disabled:aliases,customer_wallets_funded:false}));
})().catch(async e=>{console.error(e.message.includes('password')?'Platform configuration failed':e.message);process.exitCode=1;if(connected)await db.query('ROLLBACK').catch(()=>{});}).finally(()=>connected?db.end():undefined);
