'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {service,pageUrl,messengerUrl}=require('../../scripts/dashboard/facebook-manual.cjs');
function fixture(){
 const f={stopped:false,unsubscribed:false,queries:[],pages:[{page_url:'https://www.facebook.com/example.business/',messenger_url:'https://m.me/example.business'}]};
 f.api=service({identity:{principal:async(t,org)=>({org_id:7,active:org===7})},pool:{query:async(sql,args)=>{f.queries.push({sql,args});return{rows:sql.includes('FROM strategy_plans')?(f.draft?[f.draft]:[]):sql.startsWith('SELECT id')?[{id:3}]:sql.includes('AS unsubscribed')?[{stopped:f.stopped,unsubscribed:f.unsubscribed}]:f.pages};}}});
 f.p={org_id:7,lead_id:3,page_url:f.pages[0].page_url,message:'Hello, business.\nCan we discuss our offer?',acknowledge_manual_contact:true};return f;
}
test('manual copy/open rechecks organization, target and stops without provider calls or SQL writes',async()=>{
 const f=fixture(),r=await f.api.prepare('token',f.p);assert.equal(r.url,'https://m.me/example.business');assert.equal(r.message,f.p.message);assert.equal(r.message_sent,false);assert.equal(r.execution_authorized,false);assert.equal(r.provider_verified,false);
 assert(f.queries.every(q=>q.sql.startsWith('SELECT')));assert(f.queries.every(q=>JSON.stringify(q.args)==='[7,3]'));
 f.pages[0].messenger_url=null;assert.equal((await f.api.prepare('token',f.p)).url,f.p.page_url);
 for(const patch of [{stopped:true},{unsubscribed:true},{pages:[]}]){const g=fixture();Object.assign(g,patch);await assert.rejects(g.api.prepare('token',g.p),/FACEBOOK_MANUAL_BLOCKED/);}
 await assert.rejects(f.api.prepare('token',{...f.p,org_id:8}),/MEMBERSHIP_REQUIRED/);
 await assert.rejects(f.api.prepare('token',{...f.p,page_url:'https://www.facebook.com/other/'}),/FACEBOOK_MANUAL_BLOCKED/);
});
test('only the current approved Messenger artifact is prefilled and exact copy is rechecked',async()=>{
 const f=fixture();f.draft={id:12,content_hash:'a'.repeat(32),campaign_name:'My campaign',body:{strategy:{step1:{channel:'messenger',parts:[{text:'Approved message'}]}},artifacts:{messenger_manual:{version:'messenger_manual_v1',execution_mode:'manual_only',message:'Approved message',target:{page_url:f.p.page_url}}}}};
 const context=await f.api.context('token',{org_id:'7',lead_id:'3'});assert.equal(context.draft.message,'Approved message');
 const p={...f.p,message:'Approved message',source_plan_id:12,source_content_hash:'a'.repeat(32)};assert.equal((await f.api.prepare('token',p)).message_sent,false);
 await assert.rejects(f.api.prepare('token',{...p,message:'Changed message'}),/FACEBOOK_MANUAL_BLOCKED/);f.draft=null;await assert.rejects(f.api.prepare('token',p),/FACEBOOK_MANUAL_BLOCKED/);
 const sql=f.queries.find(q=>q.sql.includes('FROM strategy_plans')).sql;for(const clause of ["a.action='approve'","p.content_hash=md5(p.body::text)","strategy_context","c.version=p.campaign_version","p.expires_at>now()","p.body#>>'{strategy,step1,channel}'='messenger'"])assert(sql.includes(clause));
});
test('input cannot inject destinations, credentials, control characters or false approval',async()=>{
 const f=fixture();for(const patch of [{message:''},{message:'x'.repeat(2001)},{message:'x\u0000'},{acknowledge_manual_contact:false},{url:'https://evil.example/'},{page_url:'https://facebook.com@evil.example/page/'},{source_plan_id:12}])await assert.rejects(f.api.prepare('token',{...f.p,...patch}),/INVALID_FILTER/);
 assert.equal(f.queries.length,0);for(const u of ['javascript:alert(1)','https://www.facebook.com/login/','https://www.facebook.com/groups/example/','https://www.facebook.com/example/?next=evil'])assert.equal(pageUrl(u),null);
 assert.equal(messengerUrl('https://m.me/hello?redirect=evil'),null);assert.equal(messengerUrl('https://m.me.evil.example/hello'),null);
});
