'use strict';
// Installed Cipher interoperability only: ephemeral key and invented data.
// Never reads the container configuration, database, or real credentials.
const cp=require('node:child_process');
const {program}=require('../dashboard/gmail-token-crypto.cjs');
const validator=`let raw='';process.stdin.on('data',b=>raw+=b);process.stdin.on('end',()=>{try{
 const assert=require('node:assert/strict'),vm=require('node:vm'),{EventEmitter}=require('node:events');
 const {Cipher}=require(require.resolve('n8n-core',{paths:['/usr/local/lib/node_modules/n8n']}));
 const key=require('node:crypto').randomBytes(32).toString('hex'),cipher=new Cipher({encryptionKey:key});
 const old={clientId:'fixture-client',clientSecret:'old-fixture',scope:'fixture-scope',leadGenGoogleSubject:'fixture-subject',leadGenGoogleEmail:'fixture@example.test',oauthTokenData:{access_token:'old-fixture',refresh_token:'old-fixture'}};
 const input={cipher:cipher.encrypt(old),client_id:old.clientId,client_secret:'new-fixture',google_subject:old.leadGenGoogleSubject,email:old.leadGenGoogleEmail,tokens:{access_token:'new-access-fixture',refresh_token:'new-refresh-fixture'}};
 const stdin=new EventEmitter();let output='';const mockProcess={env:{N8N_ENCRYPTION_KEY:key},stdin,stdout:{write:s=>output+=s},exit:()=>{throw Error('FIXTURE_EXIT')}};
 vm.runInNewContext(JSON.parse(raw).program,{require,Buffer,process:mockProcess});stdin.emit('data',JSON.stringify(input));stdin.emit('end');
 assert(!mockProcess.exitCode);const next=JSON.parse(cipher.decrypt(output));
 assert.equal(next.leadGenGoogleSubject,old.leadGenGoogleSubject);assert.equal(next.leadGenGoogleEmail,old.leadGenGoogleEmail);assert.equal(next.scope,old.scope);assert.equal(next.clientId,old.clientId);assert.deepEqual(next.oauthTokenData,input.tokens);assert.equal(next.clientSecret,input.client_secret);
 console.log(JSON.stringify({passed:true,installed_cipher:true,ephemeral_key:true,identity_preserved:true,tokens_replaced:true,provider_requests:0,database_changed:false}));
 }catch{console.error('GMAIL_CIPHER_FIXTURE_FAILED');process.exitCode=1}});`;
const r=cp.spawnSync('docker',['exec','-i','n8n','node','-e',validator],{input:JSON.stringify({program}),encoding:'utf8',timeout:60000,maxBuffer:4096,windowsHide:true});
if(r.status!==0){console.error(JSON.stringify({error:'GMAIL_CIPHER_FIXTURE_FAILED',exit_code:r.status,transport:r.error?.code||null}));process.exitCode=1;}else process.stdout.write(r.stdout);
