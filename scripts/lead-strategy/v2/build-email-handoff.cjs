'use strict';
const fs=require('fs'),assert=require('assert/strict');
const file='workflows/07a_email_outreach_executor.json';
const w=JSON.parse(fs.readFileSync(file,'utf8')),before=structuredClone(w);
const node=name=>w.nodes.find(n=>n.name===name);
// A short tick discovers due work; campaign timing/leases/quota remain in SQL.
node('Schedule Trigger').parameters={rule:{interval:[{field:'minutes',minutesInterval:5}]}};
node('Get Email-Ready Leads').parameters.query=`SELECT p.org_id,p.id AS plan_id,p.lead_id,p.content_hash,p.body,c.email,steps.step,
(SELECT cv.config->'email_dispatch' FROM strategy_campaign_versions cv WHERE cv.org_id=p.org_id AND cv.campaign_id=p.campaign_id AND cv.version=p.campaign_version) AS sender_policy,
(SELECT jsonb_build_object('org_id',prev.org_id,'plan_id',p.id,'step',steps.step-1,'content_hash',prev.dispatch_metadata->>'content_hash',
 'state',prev.dispatch_metadata->>'state','external_id',prev.external_id,'sender_email',prev.dispatch_metadata->>'sender_email','credential_ref',prev.dispatch_metadata->>'credential_ref')
 FROM outreach_activities prev WHERE prev.org_id=p.org_id AND prev.lead_id=p.lead_id AND prev.dispatch_metadata->>'plan_id'=p.id::text
 AND prev.dispatch_metadata->>'step'=(steps.step-1)::text) AS parent_activity,
outreach_email_step_check(jsonb_build_object('org_id',p.org_id,'plan_id',p.id,'step',steps.step,'content_hash',p.content_hash)) AS dispatch_check
FROM strategy_plans p JOIN cleaned_leads c ON c.id=p.lead_id AND c.org_id=p.org_id
CROSS JOIN LATERAL generate_series(1,least(10,CASE WHEN jsonb_typeof(p.body->'artifacts'->'schedule'->'sequence')='array' THEN jsonb_array_length(p.body->'artifacts'->'schedule'->'sequence') ELSE 1 END)) steps(step)
WHERE p.body->>'version'='strategy_v2' AND p.body->'strategy'->'step1'->>'channel'='email'
AND p.expires_at>now()
AND EXISTS(SELECT 1 FROM strategy_campaign_versions cv WHERE cv.org_id=p.org_id AND cv.campaign_id=p.campaign_id
 AND cv.version=p.campaign_version AND outreach_email_window(cv.config,clock_timestamp())->>'allowed'='true')
AND NOT EXISTS(SELECT 1 FROM outreach_activities a WHERE a.org_id=p.org_id AND a.dispatch_metadata->>'plan_id'=p.id::text AND a.dispatch_metadata->>'step'=steps.step::text AND NOT outreach_email_can_resume(a.dispatch_metadata))
ORDER BY p.created_at DESC LIMIT 10`;
node('Get Email-Ready Leads').parameters.query="SELECT * FROM ("+node('Get Email-Ready Leads').parameters.query.replace('LIMIT 10','')+") candidates WHERE dispatch_check->>'ready'='true' ORDER BY plan_id,step LIMIT 10";
const cond=node('Any Emails to Send?').parameters.conditions.conditions[0];
cond.leftValue='={{ $json.dispatch_check?.ready === true ? 1 : 0 }}';
node('Check Not Unsubscribed').parameters.query="SELECT count(*) AS unsubscribe_count FROM unsubscribes WHERE lower(trim(email))=lower(trim('{{ String($json.email || '').replace(/'/g, \"''\") }}'))";
node('Merge Unsubscribe Check').parameters.jsCode="const row=$('Any Emails to Send?').item.json; const v=$json.unsubscribe_count; return {json:{...row,unsubscribe_count:(v===0||v==='0')?0:1}};";
node('Daily limit check').parameters.jsCode="// Transport remains closed: an org-specific sender and atomic daily quota are not configured.\n// Never treat a per-run slice as a daily quota. No reservation or send occurs.\nreturn [];";
const {bundle:customerBundle,contextColumn}=require('./build-customer-executor.cjs');
node('Get Email-Ready Leads').parameters.query=node('Get Email-Ready Leads').parameters.query.replace('p.body,c.email,steps.step,','p.body,c.email,steps.step,\n'+contextColumn);
const helperBundle=customerBundle();
node('Prepare Email Content').parameters.jsCode=helperBundle+"const draft=emailHelpers.executionDraft($json); return {json:{...draft,sender:$json.sender,parent_activity:$json.parent_activity}};";
// Defense in depth for manual node execution: inactive workflows alone do not
// prevent users executing a Gmail node. No credentials are removed or changed.
node('Send Email - Gmail').parameters.sendTo="={{ (() => { throw new Error('EMAIL_TRANSPORT_NOT_ENABLED'); })() }}";
node('Send Email - Gmail').retryOnFail=false;
node('Log Email Sent').parameters.query="SELECT outreach_email_step_finish('{{ JSON.stringify($json.finish_payload).replace(/'/g, \"''\") }}'::jsonb) AS result";
node('Mark Email Sent').parameters.query="SELECT '{{ JSON.stringify($json.result || {saved:false,reason:'receipt_not_persisted'}).replace(/'/g, \"''\") }}'::jsonb AS dispatch_result, false AS legacy_followup_authorized";
const credentials=node('Check Not Unsubscribed').credentials;
function add(name,type,parameters,x){
 const existing=node(name);if(existing){existing.parameters=parameters;return existing;}
 const n={id:'email-v2-'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-'),name,type,typeVersion:type.endsWith('.postgres')?2.6:type.endsWith('.if')?2.2:2,position:[x,-112],parameters};
 if(type.endsWith('.postgres'))n.credentials=structuredClone(credentials);
 w.nodes.push(n);return n;
}
const db=(name,query,x)=>add(name,'n8n-nodes-base.postgres',{operation:'executeQuery',query,options:{}},x);
const code=(name,jsCode,x)=>add(name,'n8n-nodes-base.code',{mode:'runOnceForEachItem',jsCode},x);
function gate(name,expression,x){return add(name,'n8n-nodes-base.if',{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{id:name,leftValue:expression,rightValue:1,operator:{type:'number',operation:'equals'}}],combinator:'and'},options:{}},x);}
const gmailCredentials=structuredClone(node('Send Email - Gmail').credentials);
const gmailRef=gmailCredentials.gmailOAuth2.id;
const senderPolicySource=fs.readFileSync('scripts/lead-strategy/v2/sender-policy.cjs','utf8');
node('Daily limit check').parameters.jsCode=`// Explicit release binding stays unset. SQL remains the atomic quota authority.
const binding=null;
if(!binding)return [];
const policies=(()=>{const module={exports:{}};\n${senderPolicySource}\nreturn module.exports;})();
return $input.all().flatMap((item,i)=>{const result=policies.select(item.json,binding,${JSON.stringify(gmailRef)});
return result.ready?[{json:{...item.json,sender:result.sender},pairedItem:{item:i}}]:[];});`;
function http(name,url,x){const n=add(name,'n8n-nodes-base.httpRequest',{method:'GET',url,authentication:'predefinedCredentialType',nodeCredentialType:'gmailOAuth2',options:{timeout:20000}},x);n.typeVersion=4.2;n.credentials=structuredClone(gmailCredentials);n.retryOnFail=false;return n;}
const repliesSource=fs.readFileSync('scripts/lead-strategy/v2/gmail-replies.cjs','utf8');
const repliesBundle="const gmailHelpers=(()=>{const module={exports:{}};\n"+repliesSource+"\nreturn module.exports;})();\n";
http('Load Sender Profile','https://gmail.googleapis.com/gmail/v1/users/me/profile',1200);
code('Verify Sender Profile',repliesBundle+`const row=$('Daily limit check').item.json;const sender=gmailHelpers.verifyMailbox({...row.sender,org_id:row.org_id},$json,${JSON.stringify(gmailRef)});return {json:{...row,sender}};`,1300);
gate('Email Is Followup?',"={{ $json.step > 1 ? 1 : 0 }}",1450);
http('Load Previous Gmail Message',"={{ 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + encodeURIComponent($json.parent_activity?.external_id || 'missing') + '?format=full' }}",1500);
code('Bind Previous Gmail Message',"const row=$('Prepare Email Content').item.json;return {json:{...row,parent_message:$json}};",1550);
const mimeSource=fs.readFileSync('scripts/lead-strategy/v2/gmail-message.cjs','utf8').replace("require('./gmail-replies.cjs')",'gmailHelpers');
const mimeBundle=repliesBundle+"const mimeHelpers=(()=>{const module={exports:{}};\n"+mimeSource+"\nreturn module.exports;})();\n";
code('Build Gmail MIME',mimeBundle+"const request=mimeHelpers.prepare($json,$json.sender,$json.step>1?{activity:$json.parent_activity,message:$json.parent_message}:null);return {json:{...$json,gmail_request:request}};",1600);
// Gmail API raw MIME supports real conversation headers. Keep an explicit
// transport block even when the HTTP node is executed manually.
const transport=node('Send Email - Gmail');transport.type='n8n-nodes-base.httpRequest';transport.typeVersion=4.2;
transport.parameters={method:'POST',url:"={{ (() => { throw new Error('EMAIL_TRANSPORT_NOT_ENABLED'); })() }}",authentication:'predefinedCredentialType',nodeCredentialType:'gmailOAuth2',sendBody:true,specifyBody:'json',jsonBody:'={{ $json.gmail_request }}',options:{timeout:20000}};
db('Reserve Approved Email',"SELECT outreach_email_step_reserve('{{ JSON.stringify({org_id:$json.org_id,plan_id:$json.plan_id,step:$json.step,content_hash:$json.content_hash}).replace(/'/g, \"''\") }}'::jsonb) AS result",1800);
code('Bind Email Reservation',"const draft=$('Build Gmail MIME').item.json; const r=$json.result; return {json:{...draft,lease:r?.lease,reservation:r,reservation_allowed:r?.ready===true&&r?.reserved===true}};",2000);
gate('Email Reserved?',"={{ $json.reservation_allowed === true ? 1 : 0 }}",2200);
db('Begin Email Attempt',"SELECT outreach_email_step_begin('{{ JSON.stringify({org_id:$json.org_id,plan_id:$json.plan_id,step:$json.step,content_hash:$json.content_hash,lease:$json.lease,credential_ref:$json.sender?.credential_ref,sender_email:$json.sender?.email,to_email:$json.to_email,subject:$json.subject_line,body:$json.email_body}).replace(/'/g, \"''\") }}'::jsonb) AS result",2400);
code('Bind Email Authorization',"const draft=$('Bind Email Reservation').item.json;const r=$json.result;return {json:{...draft,begin_result:r,dispatch_allowed:r?.ready===true&&r?.execution_authorized===true}};",2600);
gate('Email Attempt Authorized?',"={{ $json.dispatch_allowed === true ? 1 : 0 }}",2800);
code('Classify Email Receipt',helperBundle+"const draft=$('Bind Email Authorization').item.json;const outcome=emailHelpers.receipt($json);return {json:{finish_payload:{org_id:draft.org_id,plan_id:draft.plan_id,step:draft.step,content_hash:draft.content_hash,lease:draft.lease,outcome:outcome.state,external_id:outcome.external_id},outcome}};",3200);
// Error output retains item linkage; receipt classification ignores error text.
node('Send Email - Gmail').onError='continueRegularOutput';
node('Send Email - Gmail').alwaysOutputData=true;
for(const name of ['Reserve Approved Email','Begin Email Attempt','Log Email Sent'])node(name).retryOnFail=false;
const link=(from,to)=>w.connections[from]={main:[[{node:to,type:'main',index:0}]]};
const chain=['Build Gmail MIME','Reserve Approved Email','Bind Email Reservation','Email Reserved?','Begin Email Attempt','Bind Email Authorization','Email Attempt Authorized?','Send Email - Gmail','Classify Email Receipt','Log Email Sent','Mark Email Sent'];
for(let i=0;i<chain.length-1;i++)link(chain[i],chain[i+1]);
link('Daily limit check','Load Sender Profile');link('Load Sender Profile','Verify Sender Profile');link('Verify Sender Profile','Prepare Email Content');link('Prepare Email Content','Email Is Followup?');
w.connections['Email Is Followup?']={main:[[{node:'Load Previous Gmail Message',type:'main',index:0}],[{node:'Build Gmail MIME',type:'main',index:0}]]};
link('Load Previous Gmail Message','Bind Previous Gmail Message');link('Bind Previous Gmail Message','Build Gmail MIME');
for(const n of w.nodes){
 if(n.type==='n8n-nodes-base.postgres')n.alwaysOutputData=true;
 if(n.type==='n8n-nodes-base.code')n.parameters.mode=['Daily limit check','Mock Email Ready Leads'].includes(n.name)?'runOnceForAllItems':'runOnceForEachItem';
}
w.active=false;
// Only insert the reservation/begin/receipt path; preserve upstream nodes and notes.
const changed=new Set([...chain,'Daily limit check','Load Sender Profile','Verify Sender Profile','Prepare Email Content','Email Is Followup?','Load Previous Gmail Message','Bind Previous Gmail Message']);
for(const [name,connections] of Object.entries(before.connections))if(!changed.has(name))assert.deepEqual(w.connections[name],connections);
assert.deepEqual(w.nodes.filter(n=>n.type==='n8n-nodes-base.stickyNote'),before.nodes.filter(n=>n.type==='n8n-nodes-base.stickyNote'));
fs.writeFileSync(file,JSON.stringify(w,null,2)+'\n');
console.log('07A lifecycle path built; upstream graph and sticky notes preserved; transport and entry gate remain hard-blocked. No import or activation.');
