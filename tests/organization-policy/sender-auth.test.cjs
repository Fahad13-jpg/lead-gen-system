'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const auth=require('../../scripts/sender-connections/auth.cjs'),{service}=require('../../scripts/sender-connections/service.cjs');
const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const now=Math.floor(Date.now()/1000),config={issuer:'https://identity.example',audience:'lead-backend',keys:new Map([['test',publicKey.export({type:'spki',format:'pem'})]])};
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
test('migration preserves the latest begin function including contact and uncertainty guards',()=>{
 const fs=require('node:fs'),pattern=/CREATE OR REPLACE FUNCTION outreach_email_step_begin[\s\S]*?END \$\$;/;
 const before=fs.readFileSync('database/migrations/028_email_contact_gate.sql','utf8').match(pattern)[0].replace(/\r/g,'');
 const after=fs.readFileSync('database/migrations/035_sender_connections.sql','utf8').match(pattern)[0].replace(/\r/g,'').replace(/\n -- SENDER_CONNECTION_GATE_START[\s\S]*? -- SENDER_CONNECTION_GATE_END/,'');
 assert.equal(after,before);
});
function token(patch={},head={}){const data=encode({alg:'RS256',kid:'test',...head})+'.'+encode({iss:config.issuer,aud:config.audience,sub:'account|123',iat:now-10,exp:now+300,...patch});return data+'.'+crypto.sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url');}
test('pinned RS256 verifies identity without trusting org/role claims',()=>{
 const a=auth.verify(token(),config,now);assert.match(a.subject,/^[a-f0-9]{64}$/);
 assert.deepEqual(auth.verify(token({org_id:99,role:'owner'}),config,now),a);
});
test('reject expired, future, wrong issuer/audience, unsigned and token-chosen keys',()=>{
 for(const claims of [{exp:now},{iat:now+1},{nbf:now+1},{iss:'other'},{aud:'other'},{sub:''},{exp:now+4000}])assert.throws(()=>auth.verify(token(claims),config,now),/AUTHENTICATION_FAILED/);
 for(const header of [{alg:'none'},{alg:'HS256'},{kid:'missing'},{jku:'https://attacker.example'},{jwk:{}},{crit:['x']}])assert.throws(()=>auth.verify(token({},header),config,now));
 assert.throws(()=>auth.verify(token().replace(/^./,'x'),config,now));
});
test('service resolves org membership server-side and validates credential catalog',async()=>{
 const identity=auth.verify(token(),config,now),queries=[];
 const deps={authConfig:config,query:async q=>{queries.push(q);return q.includes('FROM org_sender_memberships')?{org_id:2,subject:identity.subject,role:'member',active:true}:{state:'pending_check'};},credentialCatalog:async()=>[{id:'cred',org_id:2,type:'gmailOAuth2',active:true}]};
 const s=service(deps),input={org_id:2,connection_id:'one',provider:'gmail',credential_ref:'cred',email:'one@example.org',sharing:'private',limits:{daily_limit:10,mailbox_rolling_limit:10,min_interval_seconds:300}};
 assert.equal((await s.create(token(),input)).state,'pending_check');assert(queries[1].includes(identity.subject));assert(!queries[1].includes(token()));
 await assert.rejects(()=>s.create(token(),{...input,owner_subject:'attacker'}));
 await assert.rejects(()=>s.create(token(),{...input,sharing:'team'}));
 await assert.rejects(()=>s.create(token(),{...input,credential_ref:'foreign'}));
 await assert.rejects(()=>s.create(token(),{...input,org_id:3}));
});
test('client cannot submit successful checks; transitions escape strings and do not enable',async()=>{
 const identity=auth.verify(token(),config,now),queries=[];
 const s=service({authConfig:config,query:async q=>{queries.push(q);return q.includes('FROM org_sender_memberships')?{org_id:2,subject:identity.subject,role:'owner',active:true}:{state:'disabled'};}});
 await assert.rejects(()=>s.transition(token(),{org_id:2,action:'ready',connection_id:'x',expected_version:1}));
 await s.transition(token(),{org_id:2,action:'pause',connection_id:"O'Brien",expected_version:1});
 assert(queries.at(-1).includes("O''Brien"));assert.equal(s.checked,undefined);
 await s.bind(token(),{org_id:2,connection_id:'one',campaign_id:3,expected_version:1});
 assert(queries.at(-1).includes('sender_connection_bind(2,'));assert(queries.at(-1).includes(identity.subject));
 await assert.rejects(()=>s.bind(token(),{org_id:2,connection_id:'one',campaign_id:3,expected_version:1,subject:'forged'}));
});
