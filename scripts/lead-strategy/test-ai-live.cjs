'use strict';
// User-authorized one-off trial: at most three HTTP attempts across restarts.
// No scheduler switches, database writes or sending actions.
const fs=require('node:fs'),assert=require('node:assert/strict'),rt=require('/tmp/strategy-runtime.cjs');
const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
const dir='/home/node/.n8n/strategy-ai-trial-20261011';
fs.mkdirSync(dir,{recursive:true,mode:0o700});
(async()=>{
 const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_db'});await db.connect();
 let prepared,leadId;
 try{
  await db.query('BEGIN READ ONLY');
  assert.equal((await db.query('SELECT count(*)::int n FROM strategy_ai_controls WHERE enabled')).rows[0].n,0,'Automatic strategy AI must remain disabled');
  assert.equal((await db.query('SELECT enabled FROM enrichment_ai_controls WHERE id')).rows[0].enabled,false,'Automatic enrichment AI must remain disabled');
  const sample=JSON.parse(fs.readFileSync('/tmp/strategy-sample-review.json'));
  const rows=(await db.query('SELECT id,org_id,company_name,category,city,email,phone,website,enrichment_report(org_id,id) AS report FROM cleaned_leads WHERE org_id=1 AND id IN (167,445,446,447,449) ORDER BY id')).rows;
  for(const {report,...lead} of rows){if(!report)continue;const p=rt.prepare({lead,report,campaign:{id:0,version:1,config:sample.campaign}});if(p.wants_ai&&!p.context.reasons.length){prepared=p;leadId=lead.id;break;}}
  await db.query('ROLLBACK');
 }finally{await db.end();}
 assert(prepared,'No eligible lead with current evidence');assert(process.env.GROQ_API_KEY,'Groq key unavailable');
 // Atomic reservation counts failed or interrupted requests too; never retry implicitly.
 let attempt;
 for(let n=1;n<=3;n++){try{const fd=fs.openSync(dir+'/attempt-'+n+'.reserved','wx',0o600);fs.writeFileSync(fd,JSON.stringify({lead_id:leadId,reserved_at:new Date().toISOString()}));fs.closeSync(fd);attempt=n;break;}catch(e){if(e.code!=='EEXIST')throw e;}}
 assert(attempt,'Three-attempt trial limit reached');
 const started=Date.now();
 const result={trial:'one_time_user_authorized_max_3_attempts',attempt,lead_id:leadId,model:prepared.request.model,request:prepared.request,evidence:prepared.context.evidence,execution_authorized:false};
 if(process.argv[2]==='host-prepare'){console.log(JSON.stringify({prepared,result,dir}));return;}
 try{
  const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+process.env.GROQ_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(prepared.request),signal:AbortSignal.timeout(45000)});
  const body=await response.json();result.http_status=response.status;result.elapsed_ms=Date.now()-started;result.provider_response=body;
  result.plan=rt.compose(prepared,{statusCode:response.status,body});
 }catch(e){result.elapsed_ms=Date.now()-started;result.error=e.name==='TimeoutError'?'request_timeout':'request_or_parse_failed';result.error_detail={name:e.name,code:e.code,cause_code:e.cause?.code};}
 fs.writeFileSync(dir+'/result-'+attempt+'.json',JSON.stringify(result,null,2),{mode:0o600});
 console.log(JSON.stringify({attempt,lead_id:leadId,http_status:result.http_status,elapsed_ms:result.elapsed_ms,error:result.error,error_detail:result.error_detail,method:result.plan?.generation.method,ai_status:result.plan?.generation.ai_status,validation_errors:result.plan?.validation_errors,usage:result.provider_response?.usage,finish_reason:result.provider_response?.choices?.[0]?.finish_reason}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
