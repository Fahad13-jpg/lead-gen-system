'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.resolve('.local/calling-tools-20261028');
async function main(){
 const config=JSON.parse(fs.readFileSync(path.join(dir,'private.json'),'utf8')),url=process.argv[2]||'http://127.0.0.1:5678/webhook/retell-call-tools-v1';
 const send=async(body,token)=>{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json',...(token?{'x-call-tool-token':token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(55000)});let json;try{json=await r.json();}catch{}return {status:r.status,json};};
 const bad=await send({},undefined);assert.equal(bad.status,401,'UNAUTHENTICATED_REQUEST_MUST_BE_REJECTED');
 const check=await send({name:'connection_check'},config.token);assert.equal(check.status,200);assert.equal(check.json?.calendar_connected,true,'CALENDAR_CHECK_FAILED:'+JSON.stringify(check.json));
 fs.writeFileSync(path.join(dir,'calendar-check.json'),JSON.stringify(check.json,null,2));
 const invalid=await send({name:'opt_out',args:{event_id:'smoke'},call:{call_id:'call_invalid',agent_id:'wrong',agent_version:0,call_type:'phone_call'}},config.token);assert.equal(invalid.json?.action_completed,false);
 const report={checked_at:new Date().toISOString(),endpoint:url,unauthenticated_rejected:true,google_calendar_connected:true,calendar_count:check.json.calendars.length,invalid_identity_blocked:true,events_written:0,phone_calls_placed:0};fs.writeFileSync(path.join(dir,'endpoint-check.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e.message.replace(/key_[A-Za-z0-9_-]+/g,'[REDACTED]').slice(0,350));process.exitCode=1;});
