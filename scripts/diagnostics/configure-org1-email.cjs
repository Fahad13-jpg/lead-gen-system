'use strict';
// Approved org1 sender limits and basic checks. Sending remains disabled.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
function sql(q){const r=cp.spawnSync('docker',['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],{input:q,encoding:'utf8',timeout:30000});assert.equal(r.status,0,'Database operation failed');return r.stdout.trim();}
const quote=v=>"'"+JSON.stringify(v).replace(/'/g,"''")+"'::jsonb";
const current=JSON.parse(sql("SELECT row_to_json(t) FROM (SELECT c.id,c.org_id,c.version,v.config FROM strategy_campaigns c JOIN strategy_campaign_versions v ON v.org_id=c.org_id AND v.campaign_id=c.id AND v.version=c.version WHERE c.org_id=1 AND c.id=1) t"));assert(current);
const policy={enabled:false,credential_ref:'ErvKkvbo4c5GQjPn',sender_email:'mohmmadfahad53408@gmail.com',daily_limit:10,mailbox_rolling_limit:10,min_interval_seconds:300};
assert(require('../lead-strategy/v2/sender-policy.cjs').validate(policy).valid);
if(process.argv[2]==='apply'){
 assert.equal(sql("SELECT count(*) FROM strategy_jobs WHERE status IN ('pending','processing')"),'0');
 assert.equal(sql("SELECT count(*) FROM strategy_plans"),'0','Existing plans require impact review');
 assert.equal(sql("SELECT count(*) FROM credentials_entity WHERE id='ErvKkvbo4c5GQjPn' AND type='gmailOAuth2'"),'1');
 const config={...current.config,email_verification_policy:'basic',email_dispatch:policy};
 if(JSON.stringify(current.config.email_dispatch)===JSON.stringify(policy)&&current.config.email_verification_policy==='basic')console.log('Already configured; sending disabled');
 else{
  const backup='.local/email-policy-033/campaign-before.json';assert(!fs.existsSync(backup),'Previous configuration exists; inspect instead of replaying');fs.writeFileSync(backup,JSON.stringify(current));
  const result=JSON.parse(sql('SELECT strategy_campaign_save('+quote({org_id:1,campaign_id:1,expected_version:current.version,config})+');'));assert.equal(result.http_status,200,JSON.stringify(result));
  console.log(JSON.stringify({configured:true,campaign_id:1,version:result.version,policy:'basic',limits:{daily:10,rolling_24h:10,spacing_seconds:300},sending_enabled:false}));
 }
}else{
 assert.equal(process.argv[2],'inspect');console.log(JSON.stringify({campaign_id:current.id,version:current.version,mode:current.config.mode,policy:current.config.email_verification_policy||'provider_required',sender_configured:!!current.config.email_dispatch,sending_enabled:current.config.email_dispatch?.enabled===true}));
}
