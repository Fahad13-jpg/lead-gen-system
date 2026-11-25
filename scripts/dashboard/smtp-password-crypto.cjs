'use strict';
// Decrypt/rotate/re-encrypt inside n8n. Neither its key nor decrypted credentials
// are exported to the host. Passwords travel through stdin, never command args.
const cp=require('node:child_process');
const program=`let raw='';process.stdin.on('data',b=>{raw+=b;if(raw.length>131072)process.exit(1)});process.stdin.on('end',()=>{try{const fs=require('fs'),root='/usr/local/lib/node_modules/n8n';const{Cipher}=require(require.resolve('n8n-core',{paths:[root]}));const key=process.env.N8N_ENCRYPTION_KEY||JSON.parse(fs.readFileSync('/home/node/.n8n/config','utf8')).encryptionKey;if(!key)throw Error();const cipher=new Cipher({encryptionKey:key}),p=JSON.parse(raw),result={};if(typeof p.email!=='string'||p.email.startsWith('='))throw Error();for(const kind of ['smtp','imap']){const password=p[kind+'_password'];if(typeof password!=='string'||!password.length||password.length>4096||password.startsWith('=')||/[\\r\\n\\x00]/.test(password))throw Error();const data=JSON.parse(cipher.decrypt(p[kind+'_cipher']));if(typeof data.user!=='string'||data.user.toLowerCase()!==p.email||typeof data.host!=='string'||!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,63}$/.test(data.host))throw Error();if(kind==='smtp'&&(![465,587].includes(Number(data.port))||data.disableStartTls))throw Error();if(kind==='imap'&&(Number(data.port)!==993||data.secure!==true||data.allowUnauthorizedCerts))throw Error();const next={...data,password};result[kind]=cipher.encrypt(next);if(cipher.decrypt(result[kind])!==JSON.stringify(next))throw Error();}process.stdout.write(JSON.stringify(result));}catch{process.exitCode=1}});`;
function rotateInContainer(input){const adapter=require('./credential-adapter-client.cjs').fromEnvironment();if(adapter)return adapter.rotateSmtp(input);return new Promise((resolve,reject)=>{
 const child=cp.spawn('docker',['exec','-i','n8n','node','-e',program],{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='',settled=false;
 const fail=()=>{if(!settled){settled=true;reject(Error('SMTP_ENCRYPTION_UNCONFIRMED'));}};
 const timer=setTimeout(()=>{child.kill();fail();},20000);
 child.stdout.on('data',b=>{output+=b;if(output.length>262144){child.kill();fail();}});child.stderr.on('data',()=>{});child.on('error',fail);
 child.on('close',code=>{clearTimeout(timer);if(settled)return;if(code!==0)return fail();try{const result=JSON.parse(output);if(!['smtp','imap'].every(k=>typeof result[k]==='string'&&/^[A-Za-z0-9+/=]+$/.test(result[k])))throw Error();settled=true;resolve(result);}catch{fail();}});
 child.stdin.on('error',fail);child.stdin.end(JSON.stringify(input));
 });}
module.exports={rotateInContainer,program};
