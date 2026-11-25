'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {provider}=require('../../scripts/whatsapp/signup-provider.cjs');
const config={app_id:'2132619344002820',configuration_id:'1321599346730988',api_version:'v25.0',https_origin:'https://fixture.example',app_secret:'PRIVATE_APP_SECRET'};
test('signup uses fixed app exchange, app-authenticated inspection and token-bound account listing',async()=>{
 const seen=[],p=provider({config,fetch:async(url,o)=>{seen.push({url,o});const u=new URL(url);assert.equal(u.origin,'https://graph.facebook.com');assert.equal(o.redirect,'error');
  if(u.pathname.endsWith('/oauth/access_token')){assert.equal(u.searchParams.get('client_secret'),config.app_secret);assert.equal(u.searchParams.get('code'),'ONE_USE_CODE');return new Response(JSON.stringify({access_token:'PRIVATE_CUSTOMER_TOKEN'}));}
  if(u.pathname.endsWith('/debug_token')){assert.equal(o.headers.Authorization,'Bearer '+config.app_id+'|'+config.app_secret);return new Response(JSON.stringify({data:{app_id:config.app_id,is_valid:true,scopes:['whatsapp_business_management','whatsapp_business_messaging'],expires_at:0,data_access_expires_at:0}}));}
  assert.equal(u.pathname,'/v25.0/123456789/phone_numbers');assert.equal(o.headers.Authorization,'Bearer PRIVATE_CUSTOMER_TOKEN');return new Response(JSON.stringify({data:[{id:'987654321',other:'not_returned'}]}));
 }});
 const token=await p.exchangeCode({code:'ONE_USE_CODE',app_id:config.app_id,configuration_id:config.configuration_id,origin:config.https_origin});
 assert.equal((await p.inspectToken(token)).is_valid,true);assert.deepEqual(await p.accountPhones({...token,waba_id:'123456789'}),{data:[{id:'987654321'}]});assert.equal(seen.length,3);
 await assert.rejects(p.exchangeCode({code:'x',app_id:'OTHER'}),/BINDING/);assert.equal(seen.length,3);
});
test('provider errors, network uncertainty, invalid JSON and oversized bodies are redacted without retry',async()=>{
 for(const fetch of [async()=>{throw Error('PRIVATE_SECRET_URL');},async()=>new Response('PRIVATE_PROVIDER_BODY',{status:400}),async()=>new Response('not json'),async()=>new Response('x'.repeat(65537))]){
  let calls=0;const p=provider({config,fetch:async(...args)=>{calls++;return fetch(...args);}});
  await assert.rejects(p.exchangeCode({code:'ONE_USE_CODE',app_id:config.app_id,configuration_id:config.configuration_id,origin:config.https_origin}),e=>e.message==='WHATSAPP_META_AUTHORIZATION_UNCONFIRMED');assert.equal(calls,1);
 }
});
test('inspection rejects a token belonging to a different app',async()=>{
 const p=provider({config,fetch:async()=>new Response(JSON.stringify({data:{app_id:'other',is_valid:true,scopes:[]}}))});await assert.rejects(p.inspectToken({access_token:'TOKEN'}),/UNCONFIRMED/);
});
