'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {localPool}=require('../dashboard/start-local-auth.cjs'),{prepare}=require('../sender-connections/gmail-package.cjs');
async function main(){const pool=localPool();try{
 const rows=(await pool.query(`SELECT s.*,m.role,sc."projectId" AS project FROM sender_connections s JOIN org_sender_memberships m ON m.org_id=s.org_id AND m.subject=s.owner_subject AND m.active JOIN organizations o ON o.id=s.org_id AND o.status='active' JOIN shared_credentials sc ON sc."credentialsId"=s.credential_ref WHERE s.org_id=1 AND s.provider='gmail' AND s.state='ready'`)).rows;
 assert.equal(rows.length,1,'ONE_READY_GMAIL_REQUIRED');const row=rows[0];
 const connection={...row,checked_at:row.checked_at.toISOString(),limits:{daily_limit:row.daily_limit,mailbox_rolling_limit:row.mailbox_rolling_limit,min_interval_seconds:row.min_interval_seconds},capabilities:{send:row.send_capable,read_replies:row.reply_capable}};
 const out=prepare(JSON.parse(fs.readFileSync('workflows/07a_email_outreach_executor.json')),JSON.parse(fs.readFileSync('workflows/09_reply_detection.json')),connection,{org_id:row.org_id,subject:row.owner_subject,role:row.role,active:true});
 const tag=crypto.createHash('sha256').update(row.org_id+':'+row.connection_id+':closed').digest('hex').slice(0,16);
 out.email.id='gmailSend_'+tag;out.reply.id='gmailReply_'+tag;
 out.manifest.project_id=row.project;out.manifest.workflow_ids=[out.email.id,out.reply.id];out.manifest.created_at=new Date().toISOString();
 out.manifest.hashes=[out.email,out.reply].map(w=>crypto.createHash('sha256').update(JSON.stringify(w)).digest('hex'));
 const dir='.local/customer-gmail-'+Date.now();fs.mkdirSync(dir,{recursive:true});
 for(const key of ['email','reply','manifest'])fs.writeFileSync(dir+'/'+key+'.json',JSON.stringify(out[key],null,2));
 console.log(JSON.stringify({bundle:dir,workflows_prepared:2,active:false,execution_authorized:false,live_database_changed:false}));
}finally{await pool.end();}}
main().catch(()=>{console.error('GMAIL_PREPARATION_UNCONFIRMED');process.exitCode=1;});
