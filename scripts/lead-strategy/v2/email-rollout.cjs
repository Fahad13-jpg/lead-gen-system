'use strict';
// Build a reviewable, inactive canary release. Never writes policy, approves a
// plan, imports workflows, activates schedules or performs provider requests.
const fs=require('fs'),assert=require('assert/strict'),crypto=require('crypto');
const policies=require('./sender-policy.cjs');
function validate(config,now=Date.now()){
 assert(config&&typeof config==='object'&&!Array.isArray(config));
 assert.deepEqual(Object.keys(config).sort(),['binding','expires_at','plans'].sort(),'Unsupported release field');
 const b=config.binding;
 assert(b&&Object.keys(b).sort().join(',')==='credential_ref,email,org_id');
 assert(Number.isSafeInteger(b.org_id)&&b.org_id>0);
 assert(policies.validate({enabled:false,credential_ref:b.credential_ref,sender_email:b.email,daily_limit:10,mailbox_rolling_limit:10,min_interval_seconds:300}).valid);
 const expiry=Date.parse(config.expires_at);assert(Number.isFinite(expiry)&&expiry>now&&expiry-now<=86400000,'Release must expire within 24 hours');
 assert(Array.isArray(config.plans)&&config.plans.length>0&&config.plans.length<=10);
 const seen=new Set();
 for(const p of config.plans){
  assert.deepEqual(Object.keys(p).sort(),['plan_id','content_hash','recipient','max_step'].sort());
  assert(Number.isSafeInteger(p.plan_id)&&p.plan_id>0&&!seen.has(p.plan_id));seen.add(p.plan_id);
  assert(/^[a-f0-9]{32}$/.test(p.content_hash));
  assert(typeof p.recipient==='string'&&p.recipient===p.recipient.trim().toLowerCase()&&/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(p.recipient));
  assert(Number.isInteger(p.max_step)&&p.max_step>=1&&p.max_step<=2,'Canary permits at most two approved steps');
 }
 return config;
}
function allows(row,c,now=Date.now()){
 if(!c||!Number.isFinite(Date.parse(c.expires_at))||now>=Date.parse(c.expires_at)||Number(row?.org_id)!==c.binding.org_id)return false;
 const p=c.plans.find(p=>String(p.plan_id)===String(row.plan_id));
 return !!p&&row.content_hash===p.content_hash&&row.email===p.recipient&&Number.isInteger(Number(row.step))&&Number(row.step)>=1&&Number(row.step)<=p.max_step;
}
function build(email,reply,config,now=Date.now()){
 validate(config,now);
 const e=structuredClone(email),r=structuredClone(reply),node=(w,name)=>{const n=w.nodes.find(n=>n.name===name);assert(n,'Missing node '+name);return n;};
 const binding=config.binding,serialized=JSON.stringify(config),gate=node(e,'Daily limit check');
 assert(gate.parameters.jsCode.includes('const binding=null;'),'Expected closed source gate');
 assert.equal(node(e,'Send Email - Gmail').credentials.gmailOAuth2.id,binding.credential_ref);
 assert.equal(node(r,'Read Connected Mailbox').credentials.gmailOAuth2.id,binding.credential_ref);
 gate.parameters.jsCode=gate.parameters.jsCode.replace('const binding=null;',`const release=${serialized};\nconst allows=${allows.toString()};\nconst binding=release.binding;`)
 .replace('const result=policies.select(item.json,binding,',`if(!allows(item.json,release))return [];\nconst p=item.json.sender_policy;if(!p||p.daily_limit>10||p.mailbox_rolling_limit>10||p.min_interval_seconds<300)return [];\nconst result=policies.select(item.json,binding,`);
 const transport=node(e,'Send Email - Gmail');
 assert(transport.parameters.url.includes('EMAIL_TRANSPORT_NOT_ENABLED'));
 transport.parameters.url=`={{ (() => { const release=${serialized}; const allows=${allows.toString()}; if($json.dispatch_allowed!==true||!allows($('Daily limit check').item.json,release))throw new Error('EMAIL_RELEASE_NOT_AUTHORIZED'); return 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'; })() }}`;
 transport.retryOnFail=false;
 const query=node(e,'Get Email-Ready Leads').parameters;
 assert(query.query.includes("WHERE p.body->>'version'"));
 // Scope before ordering/LIMIT so unrelated candidates cannot starve the test.
 query.query=query.query.replace("WHERE p.body->>'version'",`WHERE p.org_id=${binding.org_id} AND p.id IN (${config.plans.map(p=>p.plan_id).join(',')}) AND p.body->>'version'`);
 node(r,'Bound Mailbox Gate').parameters={mode:'runOnceForEachItem',jsCode:`return {json:${JSON.stringify(binding)}};`};
 const read=node(r,'Get Recent Outreach Emails').parameters;
 assert(read.query.includes("AND a.channel='email'"));
 // Continue reading the permitted plans after send expiry to catch late replies.
 read.query=read.query.replace("AND a.channel='email'",`AND a.dispatch_metadata->>'plan_id' IN (${config.plans.map(p=>"'"+p.plan_id+"'").join(',')}) AND a.channel='email'`);
 e.active=false;r.active=false;
 return {email:e,reply:r,manifest:{kind:'email_canary',binding,expires_at:config.expires_at,plans:config.plans,active:false,
  limits:{daily:10,rolling_24h:10,spacing_seconds:300},requires_existing_approved_plan_and_enabled_campaign_policy:true,
  hashes:[e,r].map(w=>crypto.createHash('sha256').update(JSON.stringify(w)).digest('hex'))}};
}
function write(configPath,out){
 const path=require('path'),root=path.resolve('.local')+path.sep,target=path.resolve(out);
 assert(target.startsWith(root)&&!fs.existsSync(target),'Use a new directory under .local');
 const c=JSON.parse(fs.readFileSync(configPath,'utf8'));
 const result=build(JSON.parse(fs.readFileSync('workflows/07a_email_outreach_executor.json')),JSON.parse(fs.readFileSync('workflows/09_reply_detection.json')),c);
 fs.mkdirSync(target,{recursive:true});
 for(const [key,name] of [['email','07a_email_outreach_executor.json'],['reply','09_reply_detection.json'],['manifest','manifest.json']])fs.writeFileSync(path.join(target,name),JSON.stringify(result[key],null,2)+'\n');
 return result.manifest;
}
module.exports={validate,allows,build,write};
if(require.main===module){try{console.log(JSON.stringify(write(process.argv[2],process.argv[3])));}catch(e){console.error(e.message);process.exitCode=1;}}
