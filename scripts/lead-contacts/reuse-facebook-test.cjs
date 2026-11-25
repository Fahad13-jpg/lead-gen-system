'use strict';
const fs=require('node:fs'),rt=require('/home/node/.n8n/contact-stage/runtime.cjs');
const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
(async()=>{const dir='/home/node/.n8n/contact-stage/facebook-test';const report=JSON.parse(fs.readFileSync(dir+'/result.json')),manifest=JSON.parse(fs.readFileSync(dir+'/manifest.json'));
 if(report.status!=='SUCCEEDED'||report.run_id!=='u7K9P9qT3GUB8MX13')throw Error('Unexpected prior test');
 const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_db'});await db.connect();
 try{await db.query('BEGIN');
  for(const lead of manifest.leads){const profile=rt.facebookProfile(lead.facebook),row=report.items.find(r=>rt.facebookProfile(r.facebookUrl)===profile);if(!row)throw Error('Missing result identity');
   const current=(await db.query(`SELECT l.org_id,l.cleaned_id,s.raw_data->'socialLinks'->>'facebook' AS profile FROM cleaning_links l JOIN staging_leads s ON s.id=l.staging_id AND s.org_id=l.org_id WHERE s.id=$1 AND contact_eligible(l.org_id,l.cleaned_id,s.id)`,[lead.id])).rows[0];
   if(!current||rt.facebookProfile(current.profile)!==profile)throw Error('Business profile changed');
   const publicFields=Object.fromEntries(['facebookUrl','pageUrl','title','email','phone','website','websites','address'].map(k=>[k,row[k]??null]));
   await db.query(`INSERT INTO contact_social_cache(org_id,profile,result,checked_at,expires_at) VALUES($1,$2,$3,$4::timestamptz,$4::timestamptz+interval '7 days') ON CONFLICT(org_id,profile) DO NOTHING`,[current.org_id,profile,publicFields,report.finished_at]);
   await db.query(`INSERT INTO contact_social_jobs(org_id,lead_id,staging_id,profile,input_fingerprint) VALUES($1,$2,$3,$4,contact_input_fingerprint($1,$2,$3)) ON CONFLICT DO NOTHING`,[current.org_id,current.cleaned_id,lead.id,profile]);
  }await db.query('COMMIT');console.log('Reused three prior paid results with original timestamps. No provider calls or new charges.');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
