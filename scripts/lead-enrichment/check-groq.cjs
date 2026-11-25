'use strict';
// Run inside n8n. Never print decrypted credentials or provider response bodies.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'groq-check-'));fs.chmodSync(dir,0o700);
 try{
  const file=path.join(dir,'credential.json');
  const run=cp.spawnSync('n8n',['export:credentials','--id=QQB9yzE6weHJvRcp','--decrypted','--output='+file],{encoding:'utf8',timeout:90000});
  if(run.status!==0||!fs.existsSync(file)){console.log(JSON.stringify({status:'credential_export_unavailable'}));return;}
  fs.chmodSync(file,0o600);
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  const key=data.find(c=>c.id==='QQB9yzE6weHJvRcp'&&c.type==='groqApi')?.data?.apiKey;
  if(!key){console.log(JSON.stringify({status:'credential_missing_key'}));return;}
  const r=await fetch('https://api.groq.com/openai/v1/models',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(20000)});
  const j=await r.json();
  console.log(JSON.stringify({credential:'Groq API',http_status:r.status,replacement_available:j.data?.some(m=>m.id==='openai/gpt-oss-120b')||false,error_code:j.error?.code||null}));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(JSON.stringify({status:'credential_check_failed',error_type:e.name,code:e.cause?.code||e.code||null}));process.exitCode=1;});
