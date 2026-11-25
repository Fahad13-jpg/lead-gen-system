'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createServer}=require('../../scripts/dashboard/http.cjs');
function request(server,{url='/dashboard-api/session',method='GET',headers={},body={}}={}){
  return new Promise(resolve=>{
    const res={headers:{},headersSent:false,setHeader(k,v){this.headers[k]=v;},writeHead(status,values){this.status=status;Object.assign(this.headers,values);this.headersSent=true;},end(body){let parsed=null;if(body){try{parsed=JSON.parse(String(body));}catch{parsed=String(body);}}resolve({status:this.status,body:parsed,headers:this.headers});}};
    server.emit('request',{url,method,headers:{host:'localhost:3002',authorization:'Bearer fixture-token',...headers},async *[Symbol.asyncIterator](){yield typeof body==='string'?body:JSON.stringify(body);}},res);
  });
}
const server=identity=>createServer({identity,buildRoot:'.local/nonexistent-static-fixture'});
test('explicit production host is allowed without trusting forwarded hosts or sibling domains',async()=>{
 const s=createServer({identity:{session:async()=>({verified:true})},publicOrigin:'https://app.example.com',buildRoot:'.local/nonexistent'});
 assert.equal((await request(s,{url:'/health/live',headers:{host:'app.example.com',origin:'https://app.example.com'}})).status,200);
 for(const headers of [{host:'evil.example.com','x-forwarded-host':'app.example.com'},{host:'app.example.com',origin:'https://other.example.com'},{host:'app.example.com.evil.test'}])assert.equal((await request(s,{url:'/health/live',headers})).status,403);
});
test('readiness reports only dependency availability and keeps errors private',async()=>{
 const healthy=createServer({buildRoot:'.local/nonexistent',health:async()=>{}}),bad=createServer({buildRoot:'.local/nonexistent',health:async()=>{throw Error('PRIVATE_DATABASE_SECRET');}});
 assert.deepEqual((await request(healthy,{url:'/health/ready'})).body,{status:'ok'});
 const result=await request(bad,{url:'/health/ready'});assert.equal(result.status,503);assert.deepEqual(result.body,{status:'unavailable'});
 assert.equal((await request(bad,{url:'/health/live'})).status,200);
});

test('Apify recovery routes require bearer and exact origin and do not expose internal failures',async()=>{
 let calls=0;const s=createServer({identity:{},gathering:{prepareApify:async()=>{calls++;return{recovery_token:'fixture'};},reconcileApify:async()=>{throw Error('PRIVATE_KEY_DATA');}},buildRoot:'.local/nonexistent'});
 const p={url:'/dashboard-api/apify/prepare',method:'POST',headers:{origin:'http://localhost:3002','content-type':'application/json'},body:{org_id:7,apify_api_key:'apify_api_fixture'}};
 assert.equal((await request(s,{...p,headers:{...p.headers,authorization:''}})).status,401);assert.equal((await request(s,{...p,headers:{...p.headers,origin:'https://evil.example'}})).status,403);assert.equal(calls,0);
 assert.equal((await request(s,p)).body.recovery_token,'fixture');assert.deepEqual((await request(s,{...p,url:'/dashboard-api/apify/reconcile',body:{org_id:7,recovery_token:'fixture'}})).body,{error:'APIFY_RECOVERY_UNAVAILABLE'});
});

test('workspace creation accepts a verified session route without an organization and retains origin/auth guards',async()=>{
 let calls=0;const s=createServer({identity:{},enrollment:{create:async()=>{calls++;throw Error('PRIVATE_DB_DATA');},status:async()=>({saved:false})},buildRoot:'.local/nonexistent'});
 const p={url:'/dashboard-api/workspace/create',method:'POST',headers:{origin:'http://localhost:3002','content-type':'application/json'},body:{name:'My workspace',request_id:'11111111-1111-4111-8111-111111111111',acknowledge_owner:true}};
 assert.equal((await request(s,{...p,headers:{...p.headers,authorization:''}})).status,401);assert.equal((await request(s,{...p,headers:{...p.headers,origin:'https://evil.example'}})).status,403);assert.equal(calls,0);assert.deepEqual((await request(s,p)).body,{error:'WORKSPACE_CREATION_UNCONFIRMED'});assert.equal((await request(s,{url:'/dashboard-api/workspace/status?request_id=11111111-1111-4111-8111-111111111111'})).body.saved,false);
});

test('SMS settings/release routes require bearer, exact origin and redact unknown failures',async()=>{
 let calls=0;const s=createServer({identity:{},sms:{status:async()=>({configured:false}),release:async()=>{calls++;throw Error('PRIVATE_PROVIDER_PASSWORD');}},buildRoot:'.local/nonexistent'});
 const p={url:'/dashboard-api/sms/release',method:'POST',headers:{origin:'http://localhost:3002','content-type':'application/json'}};
 assert.equal((await request(s,{...p,headers:{...p.headers,authorization:''}})).status,401);assert.equal((await request(s,{...p,headers:{...p.headers,origin:'https://evil.example'}})).status,403);assert.equal(calls,0);assert.deepEqual((await request(s,p)).body,{error:'SMS_ACTION_UNCONFIRMED'});assert.equal((await request(s,{url:'/dashboard-api/api/sms?org_id=7'})).body.configured,false);
});

test('manual Facebook routes require authentication and origin, and redact provider-free preparation failures',async()=>{
 let calls=0;const s=createServer({identity:{},facebook:{context:async()=>({manual_only:true,available:true}),prepare:async()=>{calls++;throw Error('FACEBOOK_MANUAL_BLOCKED');}},buildRoot:'.local/nonexistent'});
 const p={url:'/dashboard-api/facebook/manual/prepare',method:'POST',headers:{origin:'http://localhost:3002','content-type':'application/json'}};
 assert.equal((await request(s,{...p,headers:{...p.headers,authorization:''}})).status,401);assert.equal(calls,0);
 assert.equal((await request(s,{...p,headers:{...p.headers,origin:'https://evil.example'}})).status,403);assert.equal(calls,0);
 assert.equal((await request(s,p)).status,409);assert.equal((await request(s,{url:'/dashboard-api/api/facebook-manual?org_id=7&lead_id=3'})).body.manual_only,true);
 s.close();
});

test('manual WhatsApp context/prepare requires authentication and preserves known-stop rejection',async()=>{
 let calls=0;const s=createServer({identity:{},whatsapp:{manualContext:async()=>({available:true,manual_only:true}),prepareManual:async()=>{calls++;throw Error('WHATSAPP_MANUAL_BLOCKED');}},buildRoot:'.local/nonexistent'});
 const p={url:'/dashboard-api/whatsapp/manual/prepare',method:'POST',headers:{origin:'http://localhost:3002','content-type':'application/json'}};
 assert.equal((await request(s,{...p,headers:{...p.headers,authorization:''}})).status,401);assert.equal(calls,0);
 assert.equal((await request(s,p)).status,409);assert.equal((await request(s,{url:'/dashboard-api/api/whatsapp-manual?org_id=7&lead_id=3'})).body.manual_only,true);
});

test('WhatsApp sender inspection is a fixed authenticated action with redacted provider failures',async()=>{
 let calls=0;const s=createServer({identity:{},whatsapp:{check:async()=>{calls++;throw Error('PRIVATE_TOKEN_DETAIL');}},buildRoot:'.local/nonexistent'});
 const p={url:'/dashboard-api/whatsapp/sender/check',method:'POST',headers:{origin:'http://localhost:3002','content-type':'application/json'},body:{org_id:7,connection_id:'one',expected_version:2}};
 assert.equal((await request(s,{...p,headers:{...p.headers,authorization:''}})).status,401);assert.equal(calls,0);
 assert.deepEqual((await request(s,p)).body,{error:'WHATSAPP_CHECK_UNCONFIRMED'});assert.equal(calls,1);
});

test('WhatsApp signup gets origin from HTTP headers and redacts unknown exchange failures',async()=>{
 let calls=0;const s=createServer({identity:{},whatsapp:{beginSignup:async(t,p,origin)=>{calls++;assert.equal(origin,'http://localhost:3002');assert.equal(t,'fixture-token');throw Error('WHATSAPP_SIGNUP_SETUP_REQUIRED');},completeSignup:async()=>{calls++;throw Error('PRIVATE_ACCESS_TOKEN');}},buildRoot:'.local/nonexistent'});
 const input={url:'/dashboard-api/whatsapp/signup/begin',method:'POST',headers:{origin:'http://localhost:3002','content-type':'application/json'},body:{org_id:7}};
 assert.equal((await request(s,{...input,headers:{...input.headers,authorization:''}})).status,401);assert.equal(calls,0);
 assert.deepEqual((await request(s,input)).body,{error:'WHATSAPP_SIGNUP_SETUP_REQUIRED'});
 const result=await request(s,{...input,url:'/dashboard-api/whatsapp/signup/complete'});assert.equal(result.status,503);assert.deepEqual(result.body,{error:'WHATSAPP_SIGNUP_UNCONFIRMED'});
});

test('WhatsApp reads/actions require bearer and origin; private write failures stay redacted',async()=>{
 let writes=0,reads=0;const s=createServer({identity:{},whatsapp:{status:async()=>{reads++;return{available:true,customer_signup_available:false,execution_authorized:false};},review:async()=>{writes++;throw Error('PRIVATE_CREDENTIAL_DATABASE_DETAIL');}},buildRoot:'.local/nonexistent'});
 const read={url:'/dashboard-api/api/whatsapp-status?org_id=7'},write={url:'/dashboard-api/whatsapp/inbox/review',method:'POST',headers:{origin:'http://localhost:3002','content-type':'application/json'}};
 assert.equal((await request(s,{...read,headers:{authorization:''}})).status,401);
 assert.equal((await request(s,{...write,headers:{...write.headers,origin:'https://other.example'}})).status,403);assert.equal(writes,0);assert.equal(reads,0);
 assert.equal((await request(s,read)).body.customer_signup_available,false);
 const failed=await request(s,write);assert.equal(failed.status,503);assert.deepEqual(failed.body,{error:'WHATSAPP_WRITE_UNCONFIRMED'});assert.equal(writes,1);
 const denied=createServer({identity:{},whatsapp:{manage:async()=>{throw Error('WHATSAPP_ACTION_REJECTED');}},buildRoot:'.local/nonexistent'});
 assert.equal((await request(denied,{...write,url:'/dashboard-api/whatsapp/sender/manage'})).status,409);
 assert.equal((await request(s,{url:'/dashboard-api/whatsapp/check',method:'POST',headers:write.headers})).status,405);
});
test('calling settings use fixed authenticated routes and redact uncertain writes',async()=>{
 let calls=0;const s=createServer({identity:{},calling:{read:async()=>({execution_authorized:false}),save:async()=>{calls++;throw Error('private commit detail');}},buildRoot:'.local/nonexistent'});
 const input={url:'/dashboard-api/calling/settings',method:'POST',headers:{origin:'http://localhost:3002','content-type':'application/json'}};
 assert.equal((await request(s,{url:'/dashboard-api/api/calling-settings?org_id=7&campaign_id=3',headers:{authorization:''}})).status,401);assert.equal((await request(s,{...input,headers:{...input.headers,origin:'https://evil.example'}})).status,403);assert.equal(calls,0);
 assert.equal((await request(s,{url:'/dashboard-api/api/calling-settings?org_id=7&campaign_id=3'})).status,200);assert.deepEqual((await request(s,input)).body,{error:'CALLING_SETTINGS_WRITE_UNCONFIRMED'});assert.equal(calls,1);
});
test('LinkedIn manual read/action routes require authentication and exact origin; writes redact unknown errors',async()=>{
 let calls=0;const s=createServer({identity:{},linkedin:{queue:async()=>({items:[],manual_only:true,execution_authorized:false}),event:async()=>{calls++;throw Error('private database details');}},buildRoot:'.local/nonexistent'});
 const input={url:'/dashboard-api/linkedin/event',method:'POST',headers:{origin:'http://localhost:3002','content-type':'application/json'}};
 assert.equal((await request(s,{url:'/dashboard-api/api/linkedin-queue?org_id=7',headers:{authorization:''}})).status,401);
 assert.equal((await request(s,{...input,headers:{...input.headers,origin:'https://evil.example'}})).status,403);assert.equal(calls,0);
 assert.equal((await request(s,{url:'/dashboard-api/api/linkedin-queue?org_id=7'})).body.manual_only,true);
 assert.deepEqual((await request(s,input)).body,{error:'LINKEDIN_WRITE_UNCONFIRMED'});assert.equal(calls,1);
});
test('campaign authority routes require bearer/origin and redact uncertain writes',async()=>{let calls=0;const s=createServer({identity:{},authority:{status:async()=>({available:false,execution_authorized:false}),change:async()=>{calls++;throw Error('private database details');}},buildRoot:'.local/nonexistent'}),input={url:'/dashboard-api/campaign-authority/change',method:'POST',headers:{origin:'http://localhost:3002','content-type':'application/json'}};assert.equal((await request(s,{...input,headers:{...input.headers,authorization:''}})).status,401);assert.equal((await request(s,{...input,headers:{...input.headers,origin:'https://evil.example'}})).status,403);assert.equal(calls,0);const r=await request(s,input);assert.equal(r.status,503);assert.deepEqual(r.body,{error:'CAMPAIGN_AUTHORITY_WRITE_UNCONFIRMED'});assert.equal((await request(s,{url:'/dashboard-api/api/campaign-authority?org_id=7&campaign_id=8&campaign_version=3'})).status,200);});

test('batch control/list use fixed authenticated routes, origin enforcement and redacted errors',async()=>{
 let calls=0;const s=createServer({identity:{},batch:{listEmailBatches:async()=>({batches:[],execution_authorized:false}),controlEmailBatch:async()=>{calls++;throw Error('private-path-or-token');}},buildRoot:'.local/nonexistent'});
 const input={url:'/dashboard-api/email-batch/control',method:'POST',headers:{origin:'http://localhost:3002','content-type':'application/json'}};
 assert.equal((await request(s,{...input,headers:{...input.headers,authorization:''}})).status,401);assert.equal((await request(s,{...input,headers:{...input.headers,origin:'https://evil.example'}})).status,403);assert.equal(calls,0);const result=await request(s,input);assert.equal(result.status,503);assert.deepEqual(result.body,{error:'EMAIL_BATCH_CONTROL_UNCONFIRMED'});assert.equal(calls,1);
 assert.equal((await request(s,{url:'/dashboard-api/api/email-batches?org_id=7&campaign_id=8'})).status,200);
 const disabled=createServer({identity:{},batch:{controlEmailBatch:async()=>{throw Error('EMAIL_BATCH_START_DISABLED');}},buildRoot:'.local/nonexistent'});assert.equal((await request(disabled,input)).status,409);
});

test('email preflight is an authenticated fixed read route and cannot mutate or proxy',async()=>{
 let calls=0;const s=createServer({identity:{},data:{emailPreflight:async(token,p)=>{calls++;assert.equal(token,'fixture-token');assert.equal(p.plan_ids,'9');return{execution_authorized:false};}},buildRoot:'.local/nonexistent'});
 const url='/dashboard-api/api/email-preflight?org_id=7&campaign_id=8&campaign_version=3&plan_ids=9';
 assert.equal((await request(s,{url,headers:{authorization:''}})).status,401);assert.equal((await request(s,{url,method:'POST'})).status,405);assert.equal(calls,0);assert.equal((await request(s,{url})).status,200);assert.equal(calls,1);
});

test('follow-up queue requires authentication and delegates only the fixed read route',async()=>{
 let calls=0;const s=createServer({identity:{},data:{emailFollowups:async(token,p)=>{calls++;assert.equal(token,'fixture-token');assert.equal(p.campaign_id,'8');return{items:[],execution_authorized:false};}},buildRoot:'.local/nonexistent'}),url='/dashboard-api/api/email-followups?org_id=7&campaign_id=8';
 assert.equal((await request(s,{url,headers:{authorization:''}})).status,401);assert.equal((await request(s,{url,method:'POST'})).status,405);assert.equal(calls,0);const r=await request(s,{url});assert.equal(r.status,200);assert.equal(r.body.execution_authorized,false);assert.equal(calls,1);
});

test('SMTP enrollment keeps bearer/origin checks and redacts uncertain credential operations',async()=>{
 let calls=0;const s=createServer({identity:{},smtp:{connectSmtp:async()=>{calls++;throw Error('secret-bearing storage error');}},buildRoot:'.local/nonexistent'});
 const requestData={url:'/dashboard-api/smtp/connect',method:'POST',headers:{origin:'http://localhost:3002','content-type':'application/json'},body:{org_id:7}};
 assert.equal((await request(s,{...requestData,headers:{...requestData.headers,authorization:''}})).status,401);
 assert.equal((await request(s,{...requestData,headers:{...requestData.headers,origin:'https://other.example'}})).status,403);
 assert.equal(calls,0);const result=await request(s,requestData);assert.equal(result.status,503);assert.deepEqual(result.body,{error:'SMTP_CONNECTION_UNCONFIRMED'});assert.equal(calls,1);
});

test('SMTP replacement exposes definite version/ownership denials but redacts uncertain writes',async()=>{
 for(const[error,status,publicError]of [['SMTP_VERSION_CONFLICT',409,'SMTP_VERSION_CONFLICT'],['SMTP_REPLACEMENT_REJECTED',409,'SMTP_REPLACEMENT_REJECTED'],['SECRET_STORAGE_FAILURE',503,'SMTP_REPLACEMENT_UNCONFIRMED']]){
  const s=createServer({identity:{},smtp:{replaceSmtp:async()=>{throw Error(error);}},buildRoot:'.local/nonexistent'});const r=await request(s,{url:'/dashboard-api/smtp/replace',method:'POST',headers:{origin:'http://localhost:3002','content-type':'application/json'},body:{org_id:7}});assert.equal(r.status,status);assert.deepEqual(r.body,{error:publicError});
 }
});

test('Gmail reconnect uses the fixed OAuth origin and returns definitive account/version denials',async()=>{
 for(const[error,status]of [['GMAIL_RECONNECT_ACCOUNT_MISMATCH',409],['GMAIL_RECONNECT_VERSION_CONFLICT',409],['GMAIL_RECONNECT_FORBIDDEN',403]]){const s=createServer({identity:{},gmail:{origin:'http://localhost:3002',beginReconnectGmail:async()=>{throw Error(error);}},buildRoot:'.local/nonexistent'});const r=await request(s,{url:'/dashboard-api/gmail/reconnect/begin',method:'POST',headers:{origin:'http://localhost:3002','content-type':'application/json'}});assert.equal(r.status,status);assert.equal(r.body.error,error);}
});
test('campaign content has a bounded larger request size without widening other actions',async()=>{
 const s=createServer({identity:{},gathering:{saveCampaign:async()=>({saved:true}),preview:async()=>({preview:true})},buildRoot:'.local/nonexistent-static-fixture'});
 const headers={origin:'http://localhost:3002','content-type':'application/json'};
 assert.equal((await request(s,{url:'/dashboard-api/campaign/create',method:'POST',headers,body:{text:'x'.repeat(10000)}})).status,200);
 assert.equal((await request(s,{url:'/dashboard-api/campaign/create',method:'POST',headers,body:{text:'x'.repeat(66000)}})).status,400);
 assert.equal((await request(s,{url:'/dashboard-api/search/preview',method:'POST',headers,body:{text:'x'.repeat(10000)}})).status,400);
});
test('campaign edit conflict and no-match are definitive, not uncertain writes',async()=>{
 for(const [error,status]of [['CAMPAIGN_VERSION_CONFLICT',409],['CAMPAIGN_NOT_FOUND',404]]){
  const s=createServer({identity:{},gathering:{saveCampaign:async()=>{throw Error(error);}},buildRoot:'.local/nonexistent-static-fixture'});
  const r=await request(s,{url:'/dashboard-api/campaign/create',method:'POST',headers:{origin:'http://localhost:3002','content-type':'application/json'},body:{org_id:7}});
  assert.equal(r.status,status);assert.equal(r.body.error,error);
 }
});
test('known strategy preflight rejection is definitive and distinct from an uncertain write',async()=>{
 const s=createServer({identity:{},gathering:{requestStrategy:async()=>{throw Error('STRATEGY_PROCESSING_PAUSED');}},buildRoot:'.local/nonexistent-static-fixture'});
 const r=await request(s,{url:'/dashboard-api/strategy/request',method:'POST',headers:{origin:'http://localhost:3002','content-type':'application/json'},body:{org_id:7}});
 assert.equal(r.status,409);assert.equal(r.body.error,'STRATEGY_PROCESSING_PAUSED');assert.equal(r.headers['Cache-Control'],'no-store');
});
test('session delegates to verifier and disables caching',async()=>{
  const result=await request(server({session:async token=>{assert.equal(token,'fixture-token');return{verified:true};}}));
  assert.equal(result.status,200);assert.equal(result.headers['Cache-Control'],'no-store');assert.equal(result.body.verified,true);
});
test('rejects arbitrary host, cross-origin and cross-site requests before auth',async()=>{
  let called=false;const s=server({session:async()=>{called=true;}});
  for(const headers of [{host:'evil.test'},{origin:'https://evil.test'},{'sec-fetch-site':'cross-site'}])assert.equal((await request(s,{headers})).status,403);
  assert.equal(called,false);
});
test('rejects mutation methods and malformed bearer tokens',async()=>{
  const s=server({session:async()=>{throw Error('must not run');}});
  assert.equal((await request(s,{method:'POST'})).status,405);
  assert.equal((await request(s,{headers:{authorization:'Bearer secret\nheader'}})).status,401);
  assert.equal((await request(s,{headers:{authorization:''}})).status,401);
});
test('rejects token/query identity injection and internal endpoints',async()=>{
  const s=server({session:async()=>{throw Error('must not run');}});
  assert.equal((await request(s,{url:'/dashboard-api/session?org_id=1'})).status,400);
  assert.equal((await request(s,{url:'/webhook/start-scraping'})).status,503);
  assert.equal((await request(s,{url:'/dashboard-api/api/stats'})).status,503);
});
test('auth failures are 401 and provider errors are redacted 503',async()=>{
  for(const [message,status]of [['AUTHENTICATION_FAILED',401],['private-provider-detail',503]]){
    const result=await request(server({session:async()=>{throw Error(message);}}));
    assert.equal(result.status,status);assert.ok(!JSON.stringify(result.body).includes('private-provider-detail'));
  }
});
test('bounded local rate limit does not call provider after limit',async()=>{
  let calls=0;const s=createServer({identity:{session:async()=>{calls++;return{};}},buildRoot:'.local/nonexistent',rateLimit:2});
  assert.equal((await request(s)).status,200);assert.equal((await request(s)).status,200);assert.equal((await request(s)).status,429);assert.equal(calls,2);
});
test('encoded path traversal cannot reach files outside static root',async()=>{
  const result=await request(server({}),{url:'/..%2f..%2f.env'});assert.equal(result.status,403);
});
test('Google callback redirects to a clean URL without returning codes or requiring cross-site credentials',async()=>{
 let captured;const s=createServer({identity:{},gmail:{capture:p=>{captured=p.get('code');return true;}},buildRoot:'.local/nonexistent'});
 const r=await request(s,{url:'/oauth/gmail/callback?state=fixture&code=PRIVATE_CODE',headers:{'sec-fetch-site':'cross-site',authorization:''}});
 assert.equal(r.status,302);assert.equal(r.headers.Location,'/settings?gmail_return=1');assert.equal(captured,'PRIVATE_CODE');assert.ok(!JSON.stringify(r).includes('PRIVATE_CODE'));
 assert.equal((await request(s,{url:'/dashboard-api/session',headers:{'sec-fetch-site':'cross-site'}})).status,403);
});
test('cross-site link navigation serves app pages but keeps APIs and Gmail return parameters guarded',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'gmail-return-'));
 try{
  await fs.writeFile(path.join(root,'index.html'),'<html>Settings shell</html>');
  const s=createServer({identity:{session:async()=>{throw Error('must not run');}},buildRoot:root});
  const headers={'sec-fetch-site':'cross-site','sec-fetch-mode':'navigate','sec-fetch-dest':'document',accept:'text/html',authorization:''};
  const result=await request(s,{url:'/settings?gmail_return=1',headers});
  assert.equal(result.status,200);assert.equal(result.body,'<html>Settings shell</html>');
  assert.equal((await request(s,{url:'/settings',headers})).status,200);
  assert.equal((await request(s,{url:'/settings',headers:{...headers,origin:'https://web.whatsapp.com'}})).status,200);
  for(const url of ['/settings?gmail_return=1&extra=1','/dashboard-api/session','/dashboard-api/gmail/finish','/oauth/other'])assert.equal((await request(s,{url,headers})).status,403);
  assert.equal((await request(s,{url:'/settings',method:'POST',headers})).status,403);
  for(const overrides of [{origin:'https://evil.test'},{'sec-fetch-mode':'cors'},{'sec-fetch-dest':'iframe'}])assert.equal((await request(s,{url:'/settings?gmail_return=1',headers:{...headers,...overrides}})).status,403);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('search actions require exact same origin, JSON and an authenticated fixed route',async()=>{
 let calls=0;const s=createServer({identity:{},gathering:{preview:async(token,body)=>{calls++;assert.equal(body.org_id,7);return{preview:true};}},buildRoot:'.local/nonexistent'});
 const input={url:'/dashboard-api/search/preview',method:'POST',body:{org_id:7}};
 assert.equal((await request(s,input)).status,400);
 const headers={origin:'http://localhost:3002','content-type':'application/json'};
 assert.equal((await request(s,{...input,headers})).status,200);
 assert.equal((await request(s,{...input,headers:{...headers,authorization:''}})).status,401);
 assert.equal((await request(s,{...input,headers,body:'{invalid'})).status,400);
 assert.equal((await request(s,{...input,headers,body:'x'.repeat(8193)})).status,400);
 assert.equal((await request(s,{...input,headers,url:'/dashboard-api/search/preview?org_id=7'})).status,400);
 assert.equal(calls,1);
});
test('submit returns an acceptance rather than completion and hides uncertain upstream errors',async()=>{
 const headers={origin:'http://localhost:3002','content-type':'application/json'},input={url:'/dashboard-api/search/submit',method:'POST',headers};
 const s=createServer({identity:{},gathering:{submit:async()=>({job_id:9,status:'queued'})},buildRoot:'.local/nonexistent'});
 assert.equal((await request(s,input)).status,202);
 const failed=createServer({identity:{},gathering:{submit:async()=>{throw Error('private transport detail');}},buildRoot:'.local/nonexistent'});
 const r=await request(failed,input);assert.equal(r.status,503);assert.deepEqual(r.body,{error:'SUBMISSION_UNCONFIRMED'});
});


test('calling account routes preserve auth/origin guards and redact uncertain writes',async()=>{
 let calls=0;const s=createServer({identity:{},callingAccounts:{status:async()=>({mode:'byok',execution_authorized:false}),connect:async()=>{calls++;throw Error('SECRET_KEY');}},buildRoot:'.local/nonexistent'});
 const p={url:'/dashboard-api/calling/account/connect',method:'POST',headers:{origin:'http://localhost:3002','content-type':'application/json'}};
 assert.equal((await request(s,{...p,headers:{...p.headers,authorization:''}})).status,401);assert.equal((await request(s,{...p,headers:{...p.headers,origin:'https://evil.example'}})).status,403);assert.equal(calls,0);assert.deepEqual((await request(s,p)).body,{error:'CALLING_ACCOUNT_UNCONFIRMED'});assert.equal((await request(s,{url:'/dashboard-api/api/calling-account?org_id=7'})).body.mode,'byok');
});


test('calling lifecycle uses fixed authenticated routes and redacts uncertain provider/database results',async()=>{
 let calls=0;const s=createServer({identity:{},callingBinding:{read:async()=>({bound:false}),receipt:async()=>({recorded:false}),bind:async()=>{calls++;throw Error('PRIVATE_KEY');},change:async()=>{throw Error('CALLING_ACTIVE_OR_UNCERTAIN');}},buildRoot:'.local/nonexistent'});
 const p={url:'/dashboard-api/calling/account/bind',method:'POST',headers:{origin:'http://localhost:3002','content-type':'application/json'}};
 assert.equal((await request(s,{...p,headers:{...p.headers,authorization:''}})).status,401);assert.equal((await request(s,{...p,headers:{...p.headers,origin:'https://evil.example'}})).status,403);assert.equal(calls,0);assert.deepEqual((await request(s,p)).body,{error:'CALLING_ACCOUNT_UNCONFIRMED'});
 assert.equal((await request(s,{...p,url:'/dashboard-api/calling/account/change'})).status,409);assert.equal((await request(s,{url:'/dashboard-api/api/calling-binding?org_id=7&campaign_id=3'})).body.bound,false);assert.equal((await request(s,{url:'/dashboard-api/api/calling-account-receipt?org_id=7&request_id=fixture'})).body.recorded,false);
});


test('calling configuration check is authenticated, origin guarded and redacts provider failures',async()=>{
 let calls=0;const s=createServer({identity:{},callingPreflight:{status:async()=>({configured:false}),check:async()=>{calls++;throw Error('PRIVATE_PROVIDER_KEY');}},buildRoot:'.local/nonexistent'});
 const p={url:'/dashboard-api/calling/account/check',method:'POST',headers:{origin:'http://localhost:3002','content-type':'application/json'}};
 assert.equal((await request(s,{...p,headers:{...p.headers,authorization:''}})).status,401);assert.equal((await request(s,{...p,headers:{...p.headers,origin:'https://evil.example'}})).status,403);assert.equal(calls,0);assert.deepEqual((await request(s,p)).body,{error:'CALLING_CHECK_UNCONFIRMED'});assert.equal((await request(s,{url:'/dashboard-api/api/calling-preflight?org_id=7'})).body.configured,false);
});


test('calling account verification reveals only allowlisted failure reasons',async()=>{
 let reason='CALLING_API_KEY_REJECTED';const s=createServer({identity:{},callingAccounts:{connect:async()=>{const e=Error('CALLING_ACCOUNT_NOT_VERIFIED');e.publicReason=reason;throw e;}},buildRoot:'.local/nonexistent'});const p={url:'/dashboard-api/calling/account/connect',method:'POST',headers:{origin:'http://localhost:3002','content-type':'application/json'}};
 assert.deepEqual((await request(s,p)).body,{error:'CALLING_ACCOUNT_NOT_VERIFIED',reason:'CALLING_API_KEY_REJECTED'});reason='PRIVATE_SECRET';assert.deepEqual((await request(s,p)).body,{error:'CALLING_ACCOUNT_NOT_VERIFIED',reason:'CALLING_LOOKUP_UNAVAILABLE'});
});


test('SMS login/read failures are definitive while unknown connection writes remain uncertain',async()=>{
 let code='SMS_LOGIN_REJECTED';const s=createServer({identity:{},sms:{connect:async()=>{throw Error(code);}},buildRoot:'.local/nonexistent'});const p={url:'/dashboard-api/sms/connect',method:'POST',headers:{origin:'http://localhost:3002','content-type':'application/json'}};
 for(const reason of ['SMS_LOGIN_REJECTED','SMS_DEVICE_LOOKUP_UNAVAILABLE']){code=reason;const r=await request(s,p);assert.equal(r.status,409);assert.equal(r.body.error,reason);}code='PRIVATE_DB_COMMIT';const r=await request(s,p);assert.equal(r.status,503);assert.deepEqual(r.body,{error:'SMS_ACTION_UNCONFIRMED'});
});


test('SMS device discovery is a fixed origin/auth guarded route with no connection submission',async()=>{
 let reads=0;const s=createServer({identity:{},sms:{devices:async()=>{reads++;return{devices:[],saved:false,messages_sent:0};}},buildRoot:'.local/nonexistent'});const p={url:'/dashboard-api/sms/devices',method:'POST',headers:{origin:'http://localhost:3002','content-type':'application/json'}};assert.equal((await request(s,{...p,headers:{...p.headers,authorization:''}})).status,401);assert.equal((await request(s,{...p,headers:{...p.headers,origin:'https://evil.example'}})).status,403);assert.equal(reads,0);assert.equal((await request(s,p)).body.saved,false);assert.equal(reads,1);
});

test('local port-3000 mode keeps fixed origin checks and returns Google to the same browser origin',async()=>{
 const s=createServer({buildRoot:'.local/nonexistent',localAppOrigin:'http://localhost:3000',gmail:{capture:async()=>false}});
 assert.equal((await request(s,{url:'/health/live',headers:{host:'localhost:3000',origin:'http://localhost:3000'}})).status,200);
 assert.equal((await request(s,{url:'/health/live',headers:{host:'localhost:3000',origin:'https://evil.example'}})).status,403);
 const r=await request(s,{url:'/oauth/gmail/callback?state=invalid',headers:{host:'localhost:3002','sec-fetch-site':'cross-site'}});assert.equal(r.headers.Location,'http://localhost:3000/settings?gmail_return=1');
 assert.throws(()=>createServer({buildRoot:'.local/nonexistent',localAppOrigin:'http://evil.example:3000'}),/LOCAL_ORIGIN_INVALID/);
});


test('local loopback page links redirect to the Firebase-authorized localhost without redirecting APIs',async()=>{
 const s=createServer({identity:{session:async()=>({verified:true})},buildRoot:'.local/nonexistent',localAppOrigin:'http://localhost:3000'});
 const headers={host:'127.0.0.1:3000'};
 for(const url of ['/','/login','/leads/7','/settings?gmail_return=1']){
  const r=await request(s,{url,headers});assert.equal(r.status,302);assert.equal(r.headers.Location,'http://localhost:3000'+url);
 }
 assert.equal((await request(s,{url:'/dashboard-api/session',headers})).status,200);
 assert.equal((await request(s,{url:'/dashboard-api/session',headers:{...headers,authorization:''}})).status,401);
 assert.equal((await request(s,{url:'/health/live',headers})).status,200);
 assert.equal((await request(s,{url:'/login',headers:{...headers,origin:'https://evil.example'}})).status,403);
 assert.equal((await request(s,{url:'//evil.example/login',headers})).headers.Location,undefined);
});


test('paid HTTP actions return a clear denial before touching provider services',async()=>{
 let calls=0;const s=createServer({buildRoot:'.local/nonexistent',sms:{connect:async()=>{calls++;}},packageAccess:{authorize:async()=>{throw Error('PLUS_REQUIRED');},status:async()=>({name:'free'})}});
 const p={url:'/dashboard-api/sms/connect',method:'POST',headers:{origin:'http://localhost:3002','content-type':'application/json'},body:{org_id:7}};
 const r=await request(s,p);assert.equal(r.status,403);assert.deepEqual(r.body,{error:'PLUS_REQUIRED'});assert.equal(calls,0);
 assert.equal((await request(s,{url:'/dashboard-api/api/package?org_id=7',headers:{authorization:''}})).status,401);
 assert.equal((await request(s,{url:'/dashboard-api/api/package?org_id=7'})).body.name,'free');
});
