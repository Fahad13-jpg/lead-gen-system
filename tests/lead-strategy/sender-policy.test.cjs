'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const p=require('../../scripts/lead-strategy/v2/sender-policy.cjs');
const setup=()=>({org_id:1,credential_ref:'mock',sender_email:'sender@example.org',daily_limit:10,mailbox_rolling_limit:20,min_interval_seconds:300});
test('native gate uses version-scoped policy and preserves item linkage',()=>{
 const fs=require('fs'),w=JSON.parse(fs.readFileSync('workflows/07a_email_outreach_executor.json','utf8'));
 const get=name=>w.nodes.find(n=>n.name===name);
 const ref=get('Load Sender Profile').credentials.gmailOAuth2.id;
 const d=p.draft({...setup(),credential_ref:ref});
 const code=get('Daily limit check').parameters.jsCode;
 assert.deepEqual(new Function(code)(),[]);
 const testCode=code.replace('const binding=null;','const binding='+JSON.stringify(d.binding)+';');
 const valid={org_id:1,sender_policy:{...d.email_dispatch,enabled:true}};
 const out=new Function('$input',testCode)({all:()=>[{json:{...valid,org_id:2}},{json:valid}]});
 assert.equal(out.length,1);assert.deepEqual(out[0].pairedItem,{item:1});assert.equal(out[0].json.sender.org_id,1);
 assert(get('Get Email-Ready Leads').parameters.query.includes('cv.version=p.campaign_version) AS sender_policy'));
});
test('setup produces disabled review draft without inventing limits',()=>{
 const d=p.draft(setup());assert.equal(d.email_dispatch.enabled,false);assert.equal(d.execution_authorized,false);
 assert.throws(()=>p.draft({...setup(),daily_limit:undefined}),/daily_limit_required/);
 assert.throws(()=>p.draft({...setup(),access_token:'secret'}),/UNSUPPORTED_SETUP_FIELD/);
});
test('matching org policy resolves sender only after explicit binding',()=>{
 const d=p.draft(setup()),row={org_id:'1',sender_policy:{...d.email_dispatch,enabled:true}};
 assert.equal(p.select(row,d.binding,'mock').ready,true);
 for(const [change,reason] of [[{org_id:2},'organization_mismatch'],[{sender_policy:d.email_dispatch},'sender_disabled']])assert.equal(p.select({...row,...change},d.binding,'mock').reason,reason);
 assert.equal(p.select(row,null,'mock').ready,false);
 assert.equal(p.select(row,d.binding,'different').ready,false);
 assert.equal(p.select({...row,sender_policy:{...row.sender_policy,sender_email:'other@example.org'}},d.binding,'mock').reason,'sender_policy_mismatch');
});
for(const [key,value] of [['daily_limit',0],['daily_limit','10'],['mailbox_rolling_limit',10000],['min_interval_seconds',0],['sender_email','Sender@example.org'],['credential_ref','bad\nref'],['enabled','true']])test('reject invalid sender policy '+key+' '+JSON.stringify(value),()=>{
 const policy={...p.draft(setup()).email_dispatch,[key]:value};assert.equal(p.validate(policy).valid,false);
});
