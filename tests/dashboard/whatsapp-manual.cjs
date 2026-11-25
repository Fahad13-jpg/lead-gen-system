'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {service,phone}=require('../../scripts/dashboard/whatsapp-manual.cjs');
function fixture(){const f={phone:'+92 317-5153405',stopped:false,unsubscribed:false,queries:[]};f.api=service({identity:{principal:async(t,org)=>{if(org!==7)throw Error('MEMBERSHIP_REQUIRED');return {org_id:7,active:true};}},pool:{query:async(sql,args)=>{f.queries.push({sql,args});return {rows:sql.includes('FROM strategy_plans')?(f.draft?[f.draft]:[]):sql.startsWith('SELECT id,phone')?[{id:3,phone:f.phone}]:[{stopped:f.stopped,unsubscribed:f.unsubscribed}]};}}});f.p={org_id:7,lead_id:3,recipient:'+923175153405',message:'Hello & welcome?\nPlease reply.',acknowledge_manual_contact:true};return f;}
test('manual prepare creates an encoded single-recipient link without any sending or database writes',async()=>{
 const f=fixture(),r=await f.api.prepare('token',f.p);assert.equal(r.url,'https://wa.me/923175153405?text='+encodeURIComponent(f.p.message));assert.equal(r.message_sent,false);assert.equal(r.provider_verified,false);assert.equal(r.execution_authorized,false);assert(f.queries.every(q=>q.sql.startsWith('SELECT')));assert.deepEqual(f.queries[0].args,[7,3]);
});
test('known opt-outs, replies/stops and changed recipient block manual preparation',async()=>{
 for(const mutate of [f=>f.stopped=true,f=>f.unsubscribed=true,f=>f.phone='+441234567890']){const f=fixture();mutate(f);await assert.rejects(f.api.prepare('token',f.p),/MANUAL_BLOCKED/);}
 const f=fixture();await assert.rejects(f.api.prepare('token',{...f.p,org_id:8}),/MEMBERSHIP_REQUIRED/);
});
test('missing international numbers and unreviewed or forged fields cannot prepare a link',async()=>{
 assert.equal(phone('03175153405'),null);assert.equal(phone('javascript:alert(1)'),null);
 const f=fixture();for(const patch of [{acknowledge_manual_contact:false},{message:''},{message:'x'.repeat(2001)},{message:'x\u0000'},{provider_verified:true},{recipient:'+441234567890?text=oops'}])await assert.rejects(f.api.prepare('token',{...f.p,...patch}),/INVALID_FILTER/);
 assert.equal(f.queries.length,0);f.phone='03175153405';assert.equal((await f.api.context('token',{org_id:'7',lead_id:'3'})).available,false);
});
test('approved WhatsApp content is prefilled only for its saved recipient and current source is rechecked',async()=>{
 const f=fixture();f.draft={id:'12',campaign_id:'4',campaign_name:'My campaign',content_hash:'a'.repeat(32),body:{strategy:{step1:{channel:'whatsapp',parts:[{text:'Approved message'}]}},artifacts:{whatsapp_dispatch:{recipient:f.p.recipient,rendered:'Approved message'}}}};
 const context=await f.api.context('token',{org_id:7,lead_id:3});assert.equal(context.draft.message,'Approved message');assert.equal(context.draft.plan_id,12);
 const query=f.queries.find(q=>q.sql.includes('FROM strategy_plans')).sql;for(const clause of ["a.action='approve'","a.content_hash=p.content_hash","p.expires_at>now()","p.content_hash=md5(p.body::text)","c.version=p.campaign_version","strategy_context","p.body#>>'{strategy,step1,channel}'='whatsapp'"])assert(query.includes(clause));
 const p={...f.p,source_plan_id:12,source_content_hash:'a'.repeat(32)};assert.equal((await f.api.prepare('token',p)).message_sent,false);
 f.draft=null;await assert.rejects(f.api.prepare('token',p),/MANUAL_BLOCKED/);
});
test('unavailable or mismatched saved drafts never replace the editable manual message',async()=>{
 const f=fixture();assert.equal((await f.api.context('token',{org_id:7,lead_id:3})).draft,null);
 f.draft={id:12,body:{artifacts:{whatsapp_dispatch:{recipient:'+441234567890',rendered:'Other recipient'}}}};assert.equal((await f.api.context('token',{org_id:7,lead_id:3})).draft,null);
});
