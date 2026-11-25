'use strict';
// Offline-testable orchestration. No default network client, HTTP callback or token store.
const crypto=require('node:crypto');
const scopes=['openid','email','https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.readonly'];
const assert=(ok,code)=>{if(!ok)throw Error(code);};
function sessions({now=Date.now,limit=1000}={}){
 const values=new Map();return{
  issue(value){for(const[k,v]of values)if(v.expires<=now())values.delete(k);assert(values.size<limit,'GMAIL_SIGNUP_BUSY');const state=crypto.randomBytes(32).toString('base64url');values.set(state,{...value,expires:now()+300000});return state;},
  consume(state,binding){const v=values.get(state);if(!v||v.expires<=now())return null;if(['org_id','subject','client_id','redirect_uri'].some(k=>v[k]!==binding[k]))return null;values.delete(state);return v;}
 };
}
function onboarding(deps){
 const c=deps.config||{},now=deps.now||Date.now,store=deps.sessions||sessions({now});
 function ready(){try{const origin=new URL(c.origin),redirect=new URL(c.redirect_uri);return c.enabled===true&&/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(c.client_id||'')&&origin.origin===c.origin&&(origin.protocol==='https:'||['http://localhost:3002','http://127.0.0.1:3002'].includes(origin.origin))&&redirect.origin===origin.origin&&redirect.pathname==='/oauth/gmail/callback'&&!redirect.search&&!redirect.hash&&['principal','exchangeCode','verifyIdentity','getProfile','provisionCredential','registerSender','quarantineCredential'].every(k=>typeof deps[k]==='function');}catch{return false;}}
 async function principal(token,org,sharing){assert(Number.isSafeInteger(org)&&org>0,'INVALID_ORG');const p=await deps.principal(token,org);assert(p?.org_id===org&&/^[a-f0-9]{64}$/.test(p.subject||'')&&['owner','admin','member'].includes(p.role),'MEMBERSHIP_REQUIRED');if(sharing==='team')assert(['owner','admin'].includes(p.role),'TEAM_SENDER_ADMIN_REQUIRED');return p;}
 async function issue(p,sharing,reconnect){
  const verifier=crypto.randomBytes(32).toString('base64url'),nonce=crypto.randomBytes(32).toString('base64url');
  const state=await store.issue({org_id:p.org_id,subject:p.subject,client_id:c.client_id,redirect_uri:c.redirect_uri,verifier,nonce,sharing,...(reconnect?{reconnect}:{})});
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:c.client_id,redirect_uri:c.redirect_uri,response_type:'code',scope:scopes.join(' '),access_type:'offline',prompt:'consent select_account',state,nonce,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',...(reconnect?{login_hint:reconnect.email}:{})}).toString();
  return{authorization_url:url.href,expires_in_seconds:300};
 }
 return{ready,
  async begin(token,input){assert(ready(),'GMAIL_SETUP_REQUIRED');assert(input&&Object.keys(input).every(k=>['org_id','sharing'].includes(k))&&['private','team'].includes(input.sharing),'INVALID_GMAIL_SIGNUP');const p=await principal(token,input.org_id,input.sharing);
   return issue(p,input.sharing);
  },
  async beginReconnect(token,input){
   assert(ready()&&typeof deps.reconnectTarget==='function'&&typeof deps.replaceCredential==='function','GMAIL_SETUP_REQUIRED');
   assert(input&&Object.keys(input).length===4&&Object.keys(input).every(k=>['org_id','connection_id','expected_version','acknowledge_reconnect'].includes(k))&&/^gmail_[a-f0-9]{32}$/.test(input.connection_id||'')&&Number.isSafeInteger(input.expected_version)&&input.expected_version>0&&input.acknowledge_reconnect===true,'INVALID_GMAIL_SIGNUP');
   const p=await principal(token,input.org_id),target=await deps.reconnectTarget(token,{org_id:input.org_id,connection_id:input.connection_id,expected_version:input.expected_version});
   assert(target?.org_id===p.org_id&&target.connection_id===input.connection_id&&target.version===input.expected_version&&typeof target.email==='string','GMAIL_RECONNECT_FORBIDDEN');
   return issue(p,target.sharing,{connection_id:target.connection_id,expected_version:target.version,email:target.email});
  },
  async finish(token,input){assert(ready(),'GMAIL_SETUP_REQUIRED');assert(input&&Object.keys(input).every(k=>['org_id','state','code'].includes(k))&&typeof input.state==='string'&&/^[A-Za-z0-9_-]{43}$/.test(input.state)&&typeof input.code==='string'&&input.code.length>0&&input.code.length<=8192&&!/[\x00-\x20]/.test(input.code),'INVALID_GMAIL_CALLBACK');
   const p=await principal(token,input.org_id),b=await store.consume(input.state,{org_id:p.org_id,subject:p.subject,client_id:c.client_id,redirect_uri:c.redirect_uri});assert(b,'GMAIL_STATE_EXPIRED');await principal(token,input.org_id,b.reconnect?undefined:b.sharing);
   let ref,stage='token_exchange';
   try{
    // Production adapter must verify the Google ID-token signature, issuer/audience and expiry.
    const tokens=await deps.exchangeCode({code:input.code,code_verifier:b.verifier,redirect_uri:c.redirect_uri,client_id:c.client_id});
    stage='granted_access';
    assert(typeof tokens?.access_token==='string'&&typeof tokens.refresh_token==='string'&&tokens.refresh_token.length>0,'GMAIL_OFFLINE_ACCESS_REQUIRED');
    const granted=new Set(String(tokens.scope||'').split(' '));assert(scopes.slice(2).every(s=>granted.has(s)),'GMAIL_SCOPES_MISSING');
    stage='google_identity';const identity=await deps.verifyIdentity({id_token:tokens.id_token,audience:c.client_id,nonce:b.nonce});
    assert(identity?.email_verified===true&&identity.aud===c.client_id&&identity.nonce===b.nonce&&['accounts.google.com','https://accounts.google.com'].includes(identity.iss)&&typeof identity.sub==='string'&&Number.isFinite(identity.exp)&&identity.exp*1000>now(),'GMAIL_IDENTITY_UNCONFIRMED');
    stage='mailbox_profile';const profile=await deps.getProfile({access_token:tokens.access_token});const email=String(profile?.emailAddress||'').toLowerCase();assert(email===String(identity.email||'').toLowerCase()&&email.length<=254&&/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email),'GMAIL_MAILBOX_MISMATCH');
    if(b.reconnect){
     assert(email===b.reconnect.email,'GMAIL_RECONNECT_ACCOUNT_MISMATCH');stage='credential_reconnect';
     const saved=await deps.replaceCredential(token,{org_id:b.org_id,connection_id:b.reconnect.connection_id,expected_version:b.reconnect.expected_version,email,google_subject:identity.sub,tokens,...(b.oauth_state_hash?{oauth_state_hash:b.oauth_state_hash}:{})});
     assert(saved?.org_id===b.org_id&&saved.connection_id===b.reconnect.connection_id&&saved.version===b.reconnect.expected_version+1&&saved.state==='pending_check'&&typeof saved.credential_ref==='string','GMAIL_RECONNECT_UNCONFIRMED');
     const result={org_id:b.org_id,connection_id:saved.connection_id,version:saved.version,state:'pending_check',reconnected:true,campaign_rebind_required:true,execution_authorized:false};
     if(typeof deps.checkSender==='function'){try{const checked=await deps.checkSender(token,{org_id:b.org_id,connection_id:saved.connection_id,credential_ref:saved.credential_ref,email});if(checked?.state==='ready'&&checked.execution_authorized===false){result.state='ready';result.version=checked.version;}}catch{try{deps.onFailure?.({stage:'reconnect_capability_check',reason:'CHECK_UNCONFIRMED'});}catch{}}}
     return result;
    }
    const connection_id='gmail_'+crypto.randomBytes(16).toString('hex');
    stage='credential_storage';const stored=await deps.provisionCredential({org_id:b.org_id,owner_subject:b.subject,connection_id,email,tokens,client_id:c.client_id,google_subject:identity.sub,...(b.oauth_state_hash?{oauth_state_hash:b.oauth_state_hash}:{})});ref=stored?.credential_ref;assert(typeof ref==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(ref),'GMAIL_CREDENTIAL_UNCONFIRMED');
    stage='sender_registration';const result=await deps.registerSender(token,{org_id:b.org_id,connection_id,provider:'gmail',credential_ref:ref,email,sharing:b.sharing,limits:{daily_limit:10,mailbox_rolling_limit:10,min_interval_seconds:300}});
    assert(result?.org_id===b.org_id&&result.connection_id===connection_id&&result.state==='pending_check','GMAIL_REGISTRY_UNCONFIRMED');
    // Registration succeeded. A subsequent check failure must not quarantine or
    // remove this valid enrollment; it remains pending for operator reconciliation.
    if(typeof deps.checkSender==='function'){
     try{const checked=await deps.checkSender(token,{org_id:b.org_id,connection_id,credential_ref:ref,email});
      if(checked?.state==='ready'&&checked.execution_authorized===false)return{org_id:b.org_id,connection_id,state:'ready',execution_authorized:false};
     }catch{try{deps.onFailure?.({stage:'initial_capability_check',reason:'CHECK_UNCONFIRMED'});}catch{}}
    }
    return{org_id:b.org_id,connection_id,state:'pending_check',execution_authorized:false};
   }catch(error){
    const allowed=['GMAIL_OFFLINE_ACCESS_REQUIRED','GMAIL_SCOPES_MISSING','GMAIL_IDENTITY_UNCONFIRMED','GMAIL_MAILBOX_MISMATCH','GMAIL_CREDENTIAL_PROJECT_REQUIRED','GMAIL_CREDENTIAL_STORAGE_UNCONFIRMED','GMAIL_CREDENTIAL_UNCONFIRMED','GMAIL_REGISTRY_UNCONFIRMED','GMAIL_PROVIDER_UNCONFIRMED'];
    try{deps.onFailure?.({stage,reason:allowed.includes(error?.message)?error.message:'STEP_FAILED'});}catch{}
    if(ref)try{await deps.quarantineCredential({credential_ref:ref,reason:'gmail_signup_incomplete'});}catch{}
    if(b.reconnect&&['GMAIL_RECONNECT_FORBIDDEN','GMAIL_RECONNECT_VERSION_CONFLICT','GMAIL_RECONNECT_ACCOUNT_MISMATCH','GMAIL_RECONNECT_IDENTITY_REVIEW_REQUIRED'].includes(error?.message))throw error;
    throw Error('GMAIL_CONNECTION_UNCONFIRMED');}
  }
 };
}
module.exports={onboarding,sessions,scopes};
