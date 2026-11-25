'use strict';
// Pure packaging. New copies only; original graphs/notes and manual gates survive.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),policy=require('./campaign-slice.cjs'),gmail=require('./gmail-package.cjs'),smtp=require('./smtp-workflows.cjs');
function build({slice,connection,principal,project_id,postgres,email,reply},now=Date.now()){
 policy.validate(slice,now);assert.equal(connection.org_id,slice.binding.org_id);assert.equal(connection.email,slice.binding.email);assert.equal(connection.credential_ref,slice.binding.credential_ref);
 require('./connections.cjs').binding(connection,principal,now);
 assert(connection.limits.daily_limit<=10&&connection.limits.mailbox_rolling_limit<=10&&connection.limits.min_interval_seconds>=300,'EXISTING_LIMITS_REQUIRED');
 let send,poll;
 if(connection.provider==='gmail'){
  const prepared=gmail.prepare(email,reply,connection,principal,now);send=prepared.email;poll=prepared.reply;
  const get=name=>send.nodes.find(n=>n.name===name),serialized=JSON.stringify(slice),gate=get('Daily limit check');
  assert(gate.parameters.jsCode.includes('const binding=null;'));
  gate.parameters.jsCode=gate.parameters.jsCode.replace('const binding=null;',`const release=${serialized};\nconst allows=${policy.allows.toString()};\nconst binding=release.binding;`).replace('const result=policies.select(item.json,binding,',`if(!allows(item.json,release))return [];\nconst p=item.json.sender_policy;if(!p||p.daily_limit>10||p.mailbox_rolling_limit>10||p.min_interval_seconds<300)return [];\nconst result=policies.select(item.json,binding,`);
  const earlyProof={org_id:slice.binding.org_id,plan_id:slice.plan.plan_id,step:slice.target_step,content_hash:slice.plan.content_hash,to_email:slice.plan.recipient,sender_email:slice.binding.email,credential_ref:slice.binding.credential_ref,authority:policy.authority(slice)};
  const query=get('Get Email-Ready Leads').parameters;assert(query.query.includes('WHERE p.org_id='));query.query=query.query.replace('WHERE p.org_id=',`WHERE steps.step=${slice.target_step} AND p.id=${slice.plan.plan_id} AND (email_campaign_dispatch_gate('${JSON.stringify(earlyProof).replace(/'/g,"''")}'::jsonb)->>'allowed')='true' AND p.org_id=`);
  const transport=get('Send Email - Gmail');assert(transport.parameters.url.includes('EMAIL_TRANSPORT_NOT_ENABLED'));transport.retryOnFail=false;transport.parameters.url=`={{ (() => { const release=${serialized};const allows=${policy.allows.toString()};if($json.dispatch_allowed!==true||!allows($('Daily limit check').item.json,release))throw new Error('CAMPAIGN_SLICE_NOT_AUTHORIZED');return 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'; })() }}`;
  const begin=get('Begin Email Attempt').parameters;assert(begin.query.includes('JSON.stringify({org_id:'));begin.query=begin.query.replace('JSON.stringify({org_id:',`JSON.stringify({authority:${JSON.stringify(policy.authority(slice))},org_id:`);
  const mailbox=poll.nodes.find(n=>n.name==='Bound Mailbox Gate');mailbox.parameters={mode:'runOnceForEachItem',jsCode:`return {json:${JSON.stringify(slice.binding)}};`};
  const recent=poll.nodes.find(n=>n.name==='Get Recent Outreach Emails').parameters;assert(recent.query.includes("AND a.channel='email'"));recent.query=recent.query.replace("AND a.channel='email'",`AND a.dispatch_metadata->>'plan_id'='${slice.plan.plan_id}' AND a.channel='email'`);
 }else{
  assert.equal(connection.provider,'smtp');const copies=smtp.build(connection,postgres);send=copies.find(w=>w.nodes.some(n=>n.parameters?.operation==='send'));poll=copies.find(w=>w.nodes.some(n=>n.parameters?.operation==='poll'));
  for(const w of [send,poll])for(const n of w.nodes)if(n.type==='CUSTOM.managedSender')n.type='CUSTOM.managedCampaignSender';send.nodes.find(n=>n.type==='CUSTOM.managedCampaignSender').parameters.release=JSON.stringify(slice);
 }
 for(const[k,w]of [['send',send],['reply',poll]]){w.name=`Campaign slice ${slice.authority.slice_id} ${k}`;w.active=false;for(const f of ['id','versionId','activeVersionId','pinData','staticData','shared'])delete w[f];w.settings={...w.settings,saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false};w.nodes.push({id:'campaign-authority-boundary',name:'Campaign authority boundary',type:'n8n-nodes-base.stickyNote',typeVersion:1,position:[900,-520],parameters:{width:600,height:230,content:`Exact plan ${slice.plan.plan_id}, step ${slice.target_step}; authority revision ${slice.authority.revision}; expires ${slice.expires_at}. Requires migrations 056/057 and current database slice authority at send admission. Preserve replies when pausing sends. Install inactive; do not bypass quota, lease, suppression or uncertainty checks.`}});}
 assert(/^[A-Za-z0-9_-]{1,100}$/.test(project_id||''),'CREDENTIAL_PROJECT_REQUIRED');
 const data={format:'email_campaign_slice_bundle_v1',batch_id:slice.authority.slice_id,project_id,slice:structuredClone(slice),workflows:{send,reply:poll},active:false};return{...data,digest:crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex')};
}
function verify(bundle,now=Date.now(),allowExpired=false){const{digest,...data}=bundle;assert.equal(crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex'),digest,'CAMPAIGN_BUNDLE_CHANGED');assert.equal(bundle.format,'email_campaign_slice_bundle_v1');assert.equal(bundle.batch_id,bundle.slice.authority.slice_id);if(!allowExpired)policy.validate(bundle.slice,now);assert(/^[A-Za-z0-9_-]{1,100}$/.test(bundle.project_id||''));for(const w of Object.values(bundle.workflows)){assert.equal(w.active,false);assert(!w.id);}return bundle;}
module.exports={build,verify};
