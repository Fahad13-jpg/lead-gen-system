'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
async function main(){
const dir='.local/whatsapp-callback',prefix=fs.existsSync(dir+'/tunnel.retry.stderr.log')?'tunnel.retry':'tunnel',logs=fs.readFileSync(dir+'/'+prefix+'.stderr.log','utf8')+fs.readFileSync(dir+'/'+prefix+'.stdout.log','utf8');
const localOnly=process.argv.includes('--local');
const ngrokLogs=['ngrok.stdout.log','ngrok.stderr.log'].filter(f=>fs.existsSync(dir+'/'+f)).map(f=>fs.readFileSync(dir+'/'+f,'utf8')).join('\n');
const ngrokURL=ngrokLogs.match(/https:\/\/[a-z0-9-]+\.(?:ngrok-free\.app|ngrok\.io|ngrok\.app|ngrok-free\.dev)/)?.[0];
const base=localOnly?'http://127.0.0.1:5690':ngrokURL||logs.match(/https:\/\/[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com/)?.[0];assert(base,'TUNNEL_URL_NOT_READY');
const token=fs.readFileSync(dir+'/verify-token.txt','utf8').trim(),secret=fs.readFileSync(dir+'/app-secret.txt','utf8').trim();
const challenge='whatsapp_local_verification',query=new URLSearchParams({'hub.mode':'subscribe','hub.verify_token':token,'hub.challenge':challenge});
const checks={};
for(const [name,url,options,expected,body] of [
 ['local_challenge','http://127.0.0.1:5690/whatsapp-meta?'+query,{},200,challenge],
 ['verification_challenge',base+'/whatsapp-meta?'+query,{},200,challenge],
 ['editor_hidden',base+'/',{},404],
 ['unsigned_rejected',base+'/whatsapp-meta',{method:'POST',headers:{'content-type':'application/json'},body:'{}'},401],
 ['signed_empty_batch',base+'/whatsapp-meta',{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':'sha256='+crypto.createHmac('sha256',secret).update('{"object":"whatsapp_business_account","entry":[]}').digest('hex')},body:'{"object":"whatsapp_business_account","entry":[]}'},200,'EVENT_RECEIVED']
]){const r=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(20000)}),text=await r.text();checks[name]={status:r.status,passed:r.status===expected&&(body===undefined||text===body)};}
const result={callback_url:base+'/whatsapp-meta',local_only:localOnly,checks,messages_sent:0,real_meta_events_verified:false};
fs.writeFileSync(dir+(localOnly?'/callback-local-test.json':'/callback-test.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));assert(Object.values(checks).every(c=>c.passed),'CALLBACK_CHECK_FAILED');
}
main().catch(()=>{console.error('CALLBACK_TEST_UNCONFIRMED; private request details suppressed');process.exitCode=1;});
