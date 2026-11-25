'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {gatheringService}=require('../../scripts/dashboard/gathering.cjs');
const prefs=require('../../scripts/dashboard/campaign-preferences.cjs');
const {dataService}=require('../../scripts/dashboard/data.cjs');
const config={name:"Clinic's campaign",mode:'ai',channels:['email'],sender:{name:'Fixture',company:'Fixture'},offer:{name:'Website',description:'Website demonstration',approved_points:['Present services']},cta:{text:'Request demo'},timezone:'Asia/Karachi',tone:'professional',email_verification_policy:'basic',sending_window:{start_hour:9,end_hour:17,weekdays:[1,2,3,4,5]},sequence:[{channel:'email',delay_days:0},{channel:'email',delay_days:3}],sender_connection:{connection_id:'private-binding',provider:'gmail'},offer_profile:{key:'website_presence',source_check_max_age_days:90},future_extension:{keep:true}};
function service(extra={}){return gatheringService({identity:{principal:async()=>({role:'owner'})},strategyReadiness:async()=>({management_available:true}),campaignLoader:async(org,id)=>{assert.equal(org,7);assert.equal(id,1);return{version:3,config};},transport:async()=>assert.fail('Preferences must not pass through the create normalizer again'),...extra});}
const request={org_id:7,campaign_id:1,expected_version:3,preferences:{tone:'concise'}};
test('manual LinkedIn settings use a dedicated AI campaign and preserve trusted target/assignment data',()=>{
 const base={...config,channels:['linkedin'],sequence:[{channel:'linkedin',delay_days:0}],linkedin_manual:{enabled:false,assignee:'trusted-member',target_profiles:{167:'https://www.linkedin.com/in/owner/'}}};
 const settings={enabled:true,daily_task_limit:10,connection_note:'Hello {{company_name}}'};
 const merged=prefs.merge(base,{linkedin_manual:settings});assert.equal(merged.linkedin_manual.assignee,'trusted-member');assert.deepEqual(merged.linkedin_manual.target_profiles,base.linkedin_manual.target_profiles);
 const normalized=require('../../scripts/lead-strategy/runtime.cjs').campaign({org_id:7,config:merged}).config;assert.equal(normalized.linkedin_manual.enabled,true);assert.equal(normalized.sequence[0].channel,'linkedin');
 const projected=prefs.project({id:1,version:4,config:merged}).preferences.linkedin_manual;assert.deepEqual(projected,settings);assert(!JSON.stringify(projected).includes('trusted-member'));assert.equal(base.linkedin_manual.enabled,false);
});
test('browser manual settings cannot assign members, inject target URLs or enable unsupported campaign shapes',()=>{
 const c={mode:'ai',channels:['linkedin']},valid={enabled:true,daily_task_limit:10,connection_note:null};
 for(const bad of [{...valid,assignee:'injected'},{...valid,target_profiles:{167:'https://www.linkedin.com/in/guessed/'}},{...valid,daily_task_limit:101},{...valid,connection_note:'x'.repeat(201)},{...valid,connection_note:'Hello {{unknown}}'}])assert.throws(()=>prefs.manualSettings(bad,c),/INVALID_FILTER/);
 for(const other of [{...c,mode:'template'},{...c,channels:['email','linkedin']},{...c,sequence:[{channel:'email'}]}])assert.throws(()=>prefs.manualSettings(valid,other),/INVALID_FILTER/);
 assert.throws(()=>prefs.merge({...config,linkedin_manual:valid},{tone:'concise',channels:['email']}),/INVALID_FILTER/);
});
test('manual configuration changes save once through the versioned gateway without generation',async()=>{
 const base={...config,channels:['linkedin'],sequence:[{channel:'linkedin',delay_days:0}]};let saved;
 const s=service({campaignLoader:async()=>({version:3,config:base}),campaignSave:async p=>{saved=p;return{status:200,body:{campaign_id:1,version:4}};}});
 await s.saveCampaign('fixture',{...request,preferences:{linkedin_manual:{enabled:true,daily_task_limit:5,connection_note:null}}});assert.equal(saved.expected_version,3);assert.equal(saved.config.linkedin_manual.daily_task_limit,5);
 await assert.rejects(service().saveCampaign('fixture',{org_id:7,config:{...base,linkedin_manual:{enabled:true,daily_task_limit:5,connection_note:null,assignee:'injected'}}}),/INVALID_FILTER/);
});
test('saved public manual settings feed the existing artifact handoff without bypassing matched evidence or execution approval',()=>{
 const cfg=require('../../scripts/lead-strategy/runtime.cjs').campaign({org_id:7,config:prefs.merge({...config,channels:['linkedin'],sequence:[{channel:'linkedin',delay_days:0}]},{linkedin_manual:{enabled:true,daily_task_limit:5,connection_note:'Hello {{company_name}}'}})}).config;
 const now=new Date().toISOString(),input={suppressed:false,replied:false,lead:{id:167,company_name:'Fixture Clinic'},campaign:{config:cfg},report:{trust:{freshness:{research_current:true},conflicts:[]},research:{linkedin:{profiles:[{kind:'person',profile_url:'https://www.linkedin.com/in/fixture-owner/',observed_at:now}]}}}};
 const plan={version:'strategy_v2',state:'ai_completed',execution_authorized:false,approval_required:true,validation_errors:[],blocking_reasons:['v2_offline_only'],strategy:{step1:{channel:'linkedin',parts:[{text:'Would a demonstration be useful?'}]}},artifacts:{}};
 const core=require('../../scripts/linkedin-manual/core.cjs'),result=core.handoff(plan,{integrationEnabled:true,input,now});assert.equal(result.artifacts.linkedin_manual.steps[0].connection_note,'Hello Fixture Clinic');assert.equal(result.artifacts.linkedin_manual.execution_mode,'manual_only');assert.equal(result.approval_required,true);assert.equal(result.execution_authorized,false);assert(!plan.artifacts.linkedin_manual);
 assert.strictEqual(core.handoff(plan,{integrationEnabled:false,input,now}),plan);input.report.research.linkedin.profiles=[];assert.strictEqual(core.handoff(plan,{integrationEnabled:true,input,now}),plan);
});
test('preferences use existing versioned save and retain trusted sender and future fields',async()=>{
 let sent;const s=service({campaignSave:async p=>{sent=p;return{status:200,body:{campaign_id:1,version:4}};}});
 const r=await s.saveCampaign('fixture',request);assert.equal(r.version,4);assert.equal(sent.expected_version,3);assert.equal(sent.config.tone,'concise');assert.deepEqual(sent.config.sender_connection,config.sender_connection);assert.deepEqual(sent.config.future_extension,{keep:true});assert.equal(sent.config.offer_profile.source_check_max_age_days,90);assert.equal(config.tone,'professional');
});
test('stale version and SQL race conflicts are definite rejections without replay',async()=>{
 let calls=0;const s=service({campaignSave:async()=>{calls++;return{status:409,body:{error:'VERSION_CONFLICT'}};}});
 await assert.rejects(s.saveCampaign('fixture',{...request,expected_version:2}),/CAMPAIGN_VERSION_CONFLICT/);assert.equal(calls,0);
 await assert.rejects(s.saveCampaign('fixture',request),/CAMPAIGN_VERSION_CONFLICT/);assert.equal(calls,1);
});
test('membership and role are checked before loading preferences or saving',async()=>{
 const s=service({identity:{principal:async()=>({role:'member'})},campaignLoader:async()=>assert.fail(),campaignSave:async()=>assert.fail()});await assert.rejects(s.saveCampaign('fixture',request),/ROLE_REQUIRED/);
});
test('preferences cannot replace sender, billing, channels, template content or gates',async()=>{
 for(const key of ['sender_connection','offer','templates','channels','monthly_limit','enabled','email_verification_policy'])await assert.rejects(service().saveCampaign('fixture',{...request,preferences:{[key]:'injected'}}),/INVALID_FILTER/);
 await assert.rejects(service().saveCampaign('fixture',{...request,config}),/INVALID_FILTER/);
});
test('invalid schedule, source age and sequence changes fail before any write',async()=>{
 for(const preferences of [{sending_window:{start_hour:17,end_hour:9,weekdays:[1]}},{sending_window:{start_hour:9,end_hour:17,weekdays:[1,1]}},{timezone:'Invalid/Zone'},{source_check_max_age_days:0},{expiry_days:31},{sequence:[{channel:'call',delay_days:0},{channel:'email',delay_days:3}]},{sequence:[{channel:'email',delay_days:0},{channel:'email',delay_days:61}]}])await assert.rejects(service({campaignSave:async()=>assert.fail()}).saveCampaign('fixture',{...request,preferences}),/INVALID_FILTER/);
});
test('uncertain writes are not retried and SQL adapter escapes every interpolated string',async()=>{
 let calls=0;await assert.rejects(service({campaignSave:async()=>{calls++;throw Error('timeout');}}).saveCampaign('fixture',request),/CAMPAIGN_SAVE_UNCONFIRMED/);assert.equal(calls,1);
 let sql;const save=prefs.saver(async q=>{sql=q;return{rows:[{result:{http_status:200,campaign_id:1,version:4}}]};});await save({org_id:7,config:{name:"Clinic's"}});assert(sql.includes("Clinic''s"));assert(!sql.includes("Clinic's"));
});
test('read projection excludes sender connections and arbitrary raw config',()=>{
 const r=prefs.project({id:1,version:3,config});assert.equal(r.version,3);assert.equal(r.preferences.sequence.length,2);assert(!JSON.stringify(r).includes('private-binding'));assert(!JSON.stringify(r).includes('future_extension'));assert.deepEqual(prefs.project(null),{found:false});
});
test('unchanged legacy tone survives an unrelated timing edit',()=>{
 const c={...config,tone:'calm'};assert.equal(prefs.merge(c,{tone:'calm',expiry_days:10}).tone,'calm');assert.throws(()=>prefs.merge(c,{tone:'unapproved-new-tone'}),/INVALID_FILTER/);
});
test('preferences read is organization scoped and checks membership before SQL',async()=>{
 let sql;const s=dataService({identity:{principal:async(t,org)=>assert.equal(org,7)},pool:{query:async q=>{sql=q;return{rows:[{id:1,version:3,config}]};}}});
 const r=await s.campaigns('fixture',{org_id:'7',campaign_id:'1'});assert(r.found);assert(sql.includes('c.org_id=7 AND c.id=1'));assert(sql.includes('v.org_id=c.org_id'));assert(!JSON.stringify(r).includes('private-binding'));
 const denied=dataService({identity:{principal:async()=>{throw Error('MEMBERSHIP_REQUIRED');}},pool:{query:async()=>assert.fail()}});await assert.rejects(denied.campaigns('fixture',{org_id:'7',campaign_id:'1'}),/MEMBERSHIP_REQUIRED/);
 await assert.rejects(s.campaigns('fixture',{org_id:'7',campaign_id:'1 OR true'}),/INVALID_FILTER/);
});
test('offer and channel edits preserve binding and require acknowledgement before changing linked benefits',async()=>{
 const original={...config,offer_fit_rules:[{evidence_terms:['booking'],approved_point_index:0}]};let sent;
 const s=service({campaignLoader:async()=>({version:3,config:original}),campaignSave:async p=>{sent=p;return{status:200,body:{campaign_id:1,version:4}};}});
 const body={...request,preferences:{name:'Updated campaign',offer:{...config.offer,approved_points:['Collect enquiries']},channels:['email','linkedin'],sequence:[{channel:'linkedin',delay_days:0},{channel:'email',delay_days:3}]}};
 await assert.rejects(s.saveCampaign('fixture',body),/CAMPAIGN_BENEFIT_RULE_REVIEW_REQUIRED/);
 await s.saveCampaign('fixture',{...body,acknowledge_benefit_rules_reset:true});assert.deepEqual(sent.config.offer_fit_rules,[]);assert.equal(sent.config.sequence[0].channel,'linkedin');assert.deepEqual(sent.config.sender_connection,config.sender_connection);assert.equal(original.offer_fit_rules.length,1);
});
test('customer email copy preserves whitespace and rejects unsupported channels, language and follow-up mismatch',async()=>{
 const copy={subject:'Demo for {{company_name}}',body:'\nHello {{company_name}}\n\n',followups:['A follow-up.']};let sent;
 const s=service({campaignSave:async p=>{sent=p;return{status:200,body:{campaign_id:1,version:4}};}});
 await s.saveCampaign('fixture',{...request,preferences:{mode:'template',email_template:copy}});assert.equal(sent.config.templates.email.body,copy.body);assert.equal(sent.config.mode,'template');
 for(const preferences of [{mode:'template',email_template:{...copy,followups:[]}},{mode:'template',channels:['email','sms'],email_template:copy},{mode:'template',email_template:{...copy,body:'{{unknown_variable}}'}}])await assert.rejects(s.saveCampaign('fixture',{...request,preferences}),/INVALID_FILTER/);
 const template={...config,mode:'template',templates:{email:copy},language:'en'};assert.throws(()=>prefs.merge(template,{channels:['sms']}),/INVALID_FILTER/);assert.throws(()=>prefs.merge({...template,language:'ur'},{email_template:copy}),/INVALID_FILTER/);
});
test('changing mode/channel keeps dormant customer copy and never accepts copy for an unselected channel',async()=>{
 const copy={subject:'Demo',body:'\nExact copy\n\n',followups:['Exact follow-up']},original={...config,language:'en',mode:'template',templates:{email:copy}};let sent;
 const s=service({campaignLoader:async()=>({version:3,config:original}),campaignSave:async p=>{sent=p;return{status:200,body:{campaign_id:1,version:4}};}});
 await s.saveCampaign('fixture',{...request,preferences:{mode:'ai',channels:['linkedin'],sequence:[{channel:'linkedin',delay_days:0},{channel:'linkedin',delay_days:3}]}});assert.deepEqual(sent.config.templates.email,copy);assert.deepEqual(sent.config.channels,['linkedin']);
 assert.throws(()=>prefs.merge(original,{mode:'ai',channels:['linkedin'],email_template:copy}),/INVALID_FILTER/);
});
function cappedRow(){const subject='a'.repeat(64),ref={connection_id:'sender',version:2,provider:'gmail',subject},policy={enabled:false,credential_ref:'PRIVATE_REF',sender_email:'private@example.org',daily_limit:10,mailbox_rolling_limit:10,min_interval_seconds:300};return{org_id:7,version:3,config:{...config,sender_connection:ref,email_dispatch:policy},sender_daily_snapshot:{org_id:7,...ref,credential_ref:policy.credential_ref,email:policy.sender_email,daily_limit:10}};}

test('email pause versions the campaign without changing sender, limits, plans or release authority',async()=>{
 const row=cappedRow();row.config.email_dispatch.enabled=true;let sent,calls=0;
 const s=service({campaignLoader:async()=>row,campaignSave:async p=>{sent=p;calls++;return{status:200,body:{campaign_id:1,version:4}};}});
 await s.saveCampaign('fixture',{...request,preferences:{pause_email:true}});
 assert.equal(calls,1);assert.equal(sent.expected_version,3);assert.deepEqual(sent.config.email_dispatch,{...row.config.email_dispatch,enabled:false});assert.deepEqual(sent.config.sender_connection,row.config.sender_connection);assert.equal(row.config.email_dispatch.enabled,true);
 for(const preferences of [{pause_email:false},{pause_email:'true'},{pause_email:true,tone:'concise'}])await assert.rejects(s.saveCampaign('fixture',{...request,preferences}),/INVALID_FILTER/);
 assert.equal(calls,1);
 await assert.rejects(service().saveCampaign('fixture',{...request,preferences:{pause_email:true}}),/INVALID_FILTER/);
});
test('daily cap cannot exceed the current sender ceiling or change enabled state, spacing or rolling limits',async()=>{
 const row=cappedRow();let sent;const s=service({campaignLoader:async()=>row,campaignSave:async p=>{sent=p;return{status:200,body:{campaign_id:1,version:4}};}});
 await s.saveCampaign('fixture',{...request,preferences:{email_daily_limit:4}});assert.deepEqual(sent.config.email_dispatch,{...row.config.email_dispatch,daily_limit:4});
 for(const v of [0,11,'4',1.5,null])await assert.rejects(s.saveCampaign('fixture',{...request,preferences:{email_daily_limit:v}}),/INVALID_FILTER/);
});
test('missing, changed, cross-org or mismatched sender bindings cannot configure a cap',async()=>{
 for(const patch of [null,{version:3},{org_id:8},{credential_ref:'other'},{email:'other@example.org'},{provider:'smtp'},{daily_limit:null}]){const row=cappedRow();row.sender_daily_snapshot=patch?{...row.sender_daily_snapshot,...patch}:null;assert.equal(prefs.dailyLimit(row).available,false);await assert.rejects(service({campaignLoader:async()=>row,campaignSave:async()=>assert.fail()}).saveCampaign('fixture',{...request,preferences:{email_daily_limit:2}}),/INVALID_FILTER/);}
});
test('daily cap projection exposes numbers and scope, never credentials or private sender data',()=>{
 const row=cappedRow(),cap=prefs.dailyLimit(row);assert.deepEqual(cap,{available:true,value:10,ceiling:10,scope:'shared_organization_lowest_enabled_campaign',sending_enabled:false});assert(!JSON.stringify(cap).includes('PRIVATE'));assert(!JSON.stringify(cap).includes('private@example.org'));
});
