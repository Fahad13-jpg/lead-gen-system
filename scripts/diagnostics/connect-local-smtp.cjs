'use strict';
// Operator-only onboarding for the user-confirmed local org1 account. No sending.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const dir='.local/smtp-org1-onboarding',ids=['managedSmtpsend','managedSmtppoll','managedSmtpcheck'];
const credentialIds={smtp:'f7o3zaJQT0NrtdCN',imap:'P8hawleMrjjt1qQF'};
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:120000,maxBuffer:20e6});assert.equal(r.status,0,'Docker operation failed; private output suppressed');return r.stdout.trim();}
const sql=q=>docker(['exec','-i','postgres_db','psql','-XAt','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db'],q),json=q=>JSON.parse(sql(q));
const quote=v=>"'"+String(v).replace(/'/g,"''")+"'";
try{
 assert(!fs.existsSync(dir),'Existing onboarding: inspect saved progress instead of repeating');
 const project=sql("SELECT \"projectId\" FROM shared_workflow WHERE \"workflowId\"='managedSmtpcheck' LIMIT 1");assert(/^[A-Za-z0-9]+$/.test(project));
 for(const [type,id] of Object.entries(credentialIds))assert.equal(sql(`SELECT count(*) FROM credentials_entity c JOIN shared_credentials s ON s."credentialsId"=c.id WHERE c.id=${quote(id)} AND c.type=${quote(type)} AND s."projectId"=${quote(project)} AND s.role='credential:owner'`),'1');
 const workflows=json("SELECT json_agg(to_jsonb(w)) FROM workflow_entity w WHERE id IN ('managedSmtpsend','managedSmtppoll','managedSmtpcheck')");assert.equal(workflows.length,3);assert(workflows.every(w=>w.active===false));
 assert.equal(sql("SELECT count(*) FROM sender_connections WHERE org_id=1 AND connection_id='fahad-gmail-smtp'"),'0');
 fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/before-workflows.json',JSON.stringify(workflows,null,2));
 // This namespace represents a local operator/project, NOT a Flutter customer identity.
 // Customer authentication stays disabled until its real issuer/membership is configured.
 const subject=crypto.createHash('sha256').update('local-n8n-project\0'+project).digest('hex');
 const payload={action:'create',connection_id:'fahad-gmail-smtp',provider:'smtp',credential_ref:credentialIds.smtp,inbox_credential_ref:credentialIds.imap,email:'mohmmadfahad53408@gmail.com',sharing:'private',limits:{daily_limit:10,mailbox_rolling_limit:10,min_interval_seconds:300}};
 const transaction=`BEGIN;
 INSERT INTO org_sender_memberships(org_id,subject,role) VALUES(1,${quote(subject)},'admin') ON CONFLICT(org_id,subject) DO NOTHING;
 DO $check$ DECLARE result jsonb; BEGIN result:=sender_connection_manage(1,${quote(subject)},${quote(JSON.stringify(payload))}::jsonb);IF result->>'connection_id' IS DISTINCT FROM 'fahad-gmail-smtp' THEN RAISE EXCEPTION 'Sender registration failed';END IF;END $check$;
 COMMIT;`;
 sql(transaction);
 fs.writeFileSync(dir+'/operator.json',JSON.stringify({org_id:1,subject,namespace:'local-n8n-project',project,customer_login:false}));
 for(const w of workflows){
  const node=w.nodes.find(n=>n.type==='CUSTOM.managedSender');assert(node);assert.equal(node.parameters.release,'null');
  node.parameters.binding=JSON.stringify({org_id:1,connection_id:payload.connection_id});
  node.credentials.smtp={id:credentialIds.smtp,name:'Fahad Gmail SMTP'};node.credentials.imap={id:credentialIds.imap,name:'Fahad Gmail IMAP'};
  delete w.createdAt;delete w.updatedAt;delete w.versionId;delete w.activeVersionId;
  fs.writeFileSync(dir+'/'+w.id+'.json',JSON.stringify(w,null,2));
  docker(['cp',dir+'/'+w.id+'.json','n8n:/tmp/'+w.id+'-onboarding.json']);
  docker(['exec','n8n','n8n','import:workflow','--input=/tmp/'+w.id+'-onboarding.json','--projectId='+project]);
 }
 for(const id of ids){const w=json(`SELECT json_build_object('active',active,'nodes',nodes) FROM workflow_entity WHERE id=${quote(id)}`);assert.equal(w.active,false);const n=w.nodes.find(n=>n.type==='CUSTOM.managedSender');assert.equal(n.credentials.smtp.id,credentialIds.smtp);assert.equal(n.credentials.imap.id,credentialIds.imap);assert.equal(n.parameters.release,'null');}
 console.log(JSON.stringify({registered:true,connection_id:payload.connection_id,credentials_bound:true,workflows_active:false,release:null,emails_sent:0,customer_login:false}));
}catch(e){console.error(e.message);process.exitCode=1;}
