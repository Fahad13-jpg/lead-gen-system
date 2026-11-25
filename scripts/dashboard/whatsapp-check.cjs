'use strict';
// Credential decryption and fixed Meta GET happen inside n8n's container. Only a
// bounded identity-check result returns; tokens never appear in stdout or args.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
let program;
function inspectorProgram(){
 if(program)return program;
 const files={connection:'connection.cjs',network:'network.cjs',http:'recheck-http.cjs'};
 const modules=Object.entries(files).map(([key,file])=>`${JSON.stringify(key)}:function(module,exports,require){\n${fs.readFileSync(path.resolve(__dirname,'../whatsapp',file),'utf8')}\n}`).join(',');
 program=`const modules={${modules}},cache={};function load(id){if(id.startsWith('node:'))return require(id);if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](m,m.exports,load);return m.exports;}
 let raw='';process.stdin.on('data',b=>{raw+=b;if(raw.length>262144)process.exit(1)});process.stdin.on('end',async()=>{try{
 const {task,encrypted}=JSON.parse(raw),fs=require('fs'),root='/usr/local/lib/node_modules/n8n';
 const {Cipher}=require(require.resolve('n8n-core',{paths:[root]}));
 const encryptionKey=process.env.N8N_ENCRYPTION_KEY||JSON.parse(fs.readFileSync('/home/node/.n8n/config','utf8')).encryptionKey;
 const credential=JSON.parse(new Cipher({encryptionKey}).decrypt(encrypted));
 if(String(credential.businessAccountId)!==task.waba_id||typeof credential.accessToken!=='string'||Date.parse(task.credential_expires_at)<=Date.now())throw Error();
 const result=await load('connection').check(task,{authorizeBinding:async()=>true,authenticatedGet:load('http').createGet(load('network').createReadFetch(),credential.accessToken,{maxResponseBytes:65536})});
 process.stdout.write(JSON.stringify(result));
 }catch{process.exitCode=1}});`;
 return program;
}
function inspectInContainer(input){return new Promise((resolve,reject)=>{
 const child=cp.spawn('docker',['exec','-i','n8n','node','-e',inspectorProgram()],{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='';
 const fail=()=>reject(Error('WHATSAPP_CHECK_UNCONFIRMED'));
 const timer=setTimeout(()=>{child.kill();fail();},20000);
 child.stdout.on('data',b=>{output+=b;if(output.length>32768)child.kill();});child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});
 child.on('error',()=>{clearTimeout(timer);fail();});child.on('close',code=>{clearTimeout(timer);if(code!==0)return fail();try{resolve(JSON.parse(output));}catch{fail();}});
 child.stdin.end(JSON.stringify(input));
});}
function checker({identity,pool,transaction,inspect=inspectInContainer}){
 const flights=new Set();
 return async function check(token,p){
  if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['org_id','connection_id','expected_version'].includes(k))||!Number.isSafeInteger(p.org_id)||p.org_id<1||p.org_id>2147483647||!Number.isSafeInteger(p.expected_version)||p.expected_version<1||p.expected_version>=2147483647||!/^[A-Za-z0-9_-]{1,120}$/.test(p.connection_id||''))throw Error('INVALID_FILTER');
  const a=await identity.principal(token,p.org_id);
  if(a?.active!==true||a.org_id!==p.org_id||!/^[a-f0-9]{64}$/.test(a.subject||''))throw Error('MEMBERSHIP_REQUIRED');
  const key=p.org_id+':'+p.connection_id;if(flights.has(key))throw Error('WHATSAPP_CHECK_BUSY');flights.add(key);
  try{
   const selected=(await pool.query('SELECT sender_whatsapp_check_input($1,$2,$3,$4) AS result',[p.org_id,a.subject,p.connection_id,p.expected_version])).rows[0]?.result;
   if(selected?.ready!==true)throw Error('WHATSAPP_ACTION_REJECTED');
   const task=selected.task;
   if(task?.org_id!==p.org_id||task.connection_id!==p.connection_id||task.version!==p.expected_version)throw Error('WHATSAPP_CHECK_UNCONFIRMED');
   const encrypted=(await pool.query(`SELECT c.data FROM credentials_entity c JOIN shared_credentials sc ON sc."credentialsId"=c.id JOIN shared_workflow w ON w."projectId"=sc."projectId" AND w."workflowId"='managedSmtpcheck' WHERE c.id=$1 AND c.type='whatsAppApi'`,[task.credential_ref])).rows[0]?.data;
   if(typeof encrypted!=='string'||!encrypted)throw Error('WHATSAPP_CHECK_UNCONFIRMED');
   const result=await inspect({task,encrypted});
   if(!result||!['identity_checked','reconnect_required'].includes(result.state)||result.execution_authorized!==false||['org_id','connection_id','credential_ref','waba_id','phone_number_id','api_version'].some(k=>result[k]!==task[k]))throw Error('WHATSAPP_CHECK_UNCONFIRMED');
   const saved=await transaction(async db=>{
    await db.query('SELECT pg_advisory_xact_lock(727413,1)');
    const org=(await db.query("SELECT id FROM organizations WHERE id=$1 AND status='active' FOR UPDATE",[p.org_id])).rows[0];
    if(!org)throw Error('MEMBERSHIP_REQUIRED');
    const member=(await db.query("SELECT m.subject FROM org_sender_memberships m JOIN sender_connections s ON s.org_id=m.org_id AND s.connection_id=$3 AND s.provider='whatsapp' WHERE m.org_id=$1 AND m.subject=$2 AND m.active AND (s.owner_subject=m.subject OR m.role IN ('owner','admin')) FOR SHARE OF m",[p.org_id,a.subject,p.connection_id])).rows[0];
    if(!member)throw Error('MEMBERSHIP_REQUIRED');
    return (await db.query('SELECT sender_whatsapp_checked($1,$2,$3,$4::jsonb) AS result',[p.org_id,p.connection_id,p.expected_version,JSON.stringify(result)])).rows[0]?.result;
   });
   if(saved?.error)throw Error('WHATSAPP_ACTION_REJECTED');
   if(saved?.state!==result.state||saved.version!==p.expected_version+1||saved.sending_verified!==false||saved.execution_authorized!==false)throw Error('WHATSAPP_WRITE_UNCONFIRMED');
   return {org_id:p.org_id,connection_id:p.connection_id,version:saved.version,state:saved.state,sending_verified:false,execution_authorized:false};
  }finally{flights.delete(key);}
 };
}
module.exports={checker,inspectInContainer};
