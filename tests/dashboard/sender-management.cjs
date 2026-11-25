'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{senderManagement}=require('../../scripts/dashboard/sender-management.cjs');
const subject='a'.repeat(64),input={org_id:7,connection_id:'fixture',expected_version:2,action:'pause'};
test('sender changes call only existing registry function with verified subject and expected version',async()=>{
 let sql;const service=senderManagement({identity:{principal:async()=>({subject})},execute:async s=>{sql=s;return{rows:[{result:{org_id:7,connection_id:'fixture',version:3,state:'disabled',execution_authorized:false}}]};}});
 const r=await service.manageSender('fixture',input);assert.equal(r.state,'disabled');assert.ok(sql.startsWith(`SELECT sender_connection_manage(7,'${subject}',`));assert.ok(sql.includes('"expected_version":2'));assert.ok(!sql.includes('credential_ref'));
 await assert.rejects(service.manageSender('fixture',{...input,action:'send'}),/INVALID_FILTER/);
 await assert.rejects(service.manageSender('fixture',{...input,subject:'forged'}),/INVALID_FILTER/);
});
test('permission/version conflicts are rejected and uncertain registry writes never retry',async()=>{
 for(const error of ['MANAGE_FORBIDDEN','VERSION_CONFLICT']){const s=senderManagement({identity:{principal:async()=>({subject})},execute:async()=>({rows:[{result:{error}}]})});await assert.rejects(s.manageSender('fixture',input),/SENDER_CHANGE_REJECTED/);}
 let calls=0;const s=senderManagement({identity:{principal:async()=>({subject})},execute:async()=>{calls++;throw Error('timeout');}});await assert.rejects(s.manageSender('fixture',input),/UNCONFIRMED/);assert.equal(calls,1);
 const denied=senderManagement({identity:{principal:async()=>{throw Error('MEMBERSHIP_REQUIRED');}},execute:async()=>assert.fail()});await assert.rejects(denied.manageSender('fixture',input),/MEMBERSHIP_REQUIRED/);
});
test('sender binding uses server subject and current campaign version without enabling email',async()=>{
 let sql;const service=senderManagement({identity:{principal:async()=>({subject,role:'owner'})},execute:async value=>{sql=value;return{rows:[{result:{org_id:7,campaign_id:3,version:5}}]};}});
 const r=await service.bindSender('fixture',{org_id:7,campaign_id:3,expected_version:4,connection_id:'fixture'});assert.equal(r.email_sending_enabled,false);assert.ok(sql.startsWith(`SELECT sender_connection_bind(7,'${subject}','fixture',3,4)`));
 await assert.rejects(service.bindSender('fixture',{org_id:7,campaign_id:3,expected_version:4,connection_id:'fixture',credential_ref:'forged'}),/INVALID_FILTER/);
 const denied=senderManagement({identity:{principal:async()=>({subject,role:'member'})},execute:async()=>assert.fail()});await assert.rejects(denied.bindSender('fixture',{org_id:7,campaign_id:3,expected_version:4,connection_id:'fixture'}),/ROLE_REQUIRED/);
});

test('sender lifecycle confirms the exact action and version; mismatched receipts stay uncertain without retry',async()=>{
 for(const [action,state] of Object.entries({pause:'disabled',disconnect:'disconnected',recheck:'pending_check'})){
  const receipt={org_id:7,connection_id:'fixture',version:3,state,execution_authorized:false};
  for(const change of [null,{version:2},{version:4},{state:state==='disabled'?'disconnected':'disabled'},{execution_authorized:true},{org_id:8},{connection_id:'other'}]){
   let calls=0;const service=senderManagement({identity:{principal:async()=>({subject})},execute:async()=>{calls++;return{rows:[{result:{...receipt,...change}}]};}});
   if(change)await assert.rejects(service.manageSender('fixture',{...input,action}),/SENDER_CHANGE_UNCONFIRMED/);
   else assert.deepEqual(await service.manageSender('fixture',{...input,action}),{connection_id:'fixture',version:3,state,execution_authorized:false});
   assert.equal(calls,1);
  }
 }
});

test('recheck provisioning occurs after registry confirmation and cannot overwrite its state or authority',async()=>{
 let provisions=0;const service=senderManagement({identity:{principal:async()=>({subject})},execute:async()=>({rows:[{result:{org_id:7,connection_id:'fixture',version:3,state:'pending_check',execution_authorized:false}}]}),onRecheck:async p=>{provisions++;assert.equal(p.subject,subject);return{workflow_setup:'configured',connection_check_scheduled:true,execution_authorized:true,state:'ready'};}});
 const r=await service.manageSender('fixture',{...input,action:'recheck'});assert.equal(provisions,1);assert.equal(r.state,'pending_check');assert.equal(r.execution_authorized,false);assert.equal(r.connection_check_scheduled,true);
});
