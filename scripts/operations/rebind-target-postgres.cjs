'use strict';
// Target-only maintenance. Keeps encrypted originals and does not activate workflows.
const fs=require('node:fs'),path=require('node:path');
async function main(){
 const root='/usr/local/lib/node_modules/n8n';
 const {Client}=require(require.resolve('pg',{paths:[root]}));
 const {Cipher}=require(require.resolve('n8n-core',{paths:[root]}));
 if(process.env.DEPLOYMENT_STAGE!=='staging'||process.env.DB_POSTGRESDB_HOST!=='postgres')throw Error('TARGET_STAGING_REQUIRED');
 const password=fs.readFileSync(process.env.DB_POSTGRESDB_PASSWORD_FILE,'utf8').trim();
 const cfg=JSON.parse(fs.readFileSync('/home/node/.n8n/config','utf8'));
 const cipher=new Cipher({encryptionKey:cfg.encryptionKey});
 const db=new Client({host:'postgres',database:'lead_db',user:'n8n_user',password});
 const backup='/home/node/.n8n/target-postgres-before.json';
 await db.connect();
 try{
  const active=(await db.query('SELECT count(*)::integer n FROM workflow_entity WHERE active')).rows[0].n;
  if(active!==0)throw Error('WORKFLOWS_MUST_BE_PAUSED');
  const rows=(await db.query("SELECT id,type,data FROM credentials_entity WHERE type='postgres' ORDER BY id")).rows;
  const candidates=[];
  for(const row of rows){const data=JSON.parse(cipher.decrypt(row.data));
   if((data.database||'lead_db')!=='lead_db'||!['postgres','localhost','127.0.0.1','host.docker.internal'].includes(data.host))continue;
   candidates.push({row,data});
  }
  if(!candidates.length)throw Error('NO_LOCAL_POSTGRES_CREDENTIAL_FOUND');
  if(!fs.existsSync(backup))fs.writeFileSync(backup,JSON.stringify(candidates.map(x=>x.row)),{flag:'wx',mode:0o600});
  await db.query('BEGIN');
  for(const {row,data}of candidates){const next={...data,host:'postgres',port:5432,database:'lead_db',user:'n8n_user',password,ssl:'disable'};const sealed=cipher.encrypt(next);if(JSON.parse(cipher.decrypt(sealed)).password!==password)throw Error('ENCRYPTION_VERIFY_FAILED');await db.query('UPDATE credentials_entity SET data=$1 WHERE id=$2 AND type=$3',[sealed,row.id,'postgres']);}
  await db.query('COMMIT');
  console.log(JSON.stringify({updated_connections:candidates.length,encrypted_originals_preserved:true,workflows_activated:0,secrets_displayed:0}));
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{await db.end();}
}
main().catch(e=>{console.error(/^[A-Z_]+$/.test(e.message)?e.message:'TARGET_REBIND_FAILED');process.exitCode=1;});
