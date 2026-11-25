'use strict';
// Read-only Gmail search; may reconcile only the existing SCRATCH attempt.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {Client}=require('./gmail-test-client.cjs'),test=require('./test-live-email-thread.cjs'),helpers=require('../lead-strategy/v2/gmail-replies.cjs');
const row=JSON.parse(fs.readFileSync(path.join(test.dir,'plan.json'))),attempt=JSON.parse(fs.readFileSync(path.join(test.dir,'attempt-1.json')));
const client=new Client(test.dir,'gmail-thread-reconcile-20261019',test.ref);
try{
 client.open();const q='in:sent to:'+test.to+' subject:"Lead management system - threading test" after:'+Math.floor((Date.parse(attempt.at)-1000)/1000);
 const list=client.request('GET','messages?maxResults=10&q='+encodeURIComponent(q));assert(!list.nextPageToken,'More than ten results; require review');
 const matches=[];for(const item of list.messages||[]){const m=client.request('GET','messages/'+item.id+'?format=full');
 if(helpers.address(helpers.header(m,'From'))===test.from&&helpers.address(helpers.header(m,'To'))===test.to&&helpers.header(m,'Subject')===row.body.artifacts.email_draft.subject&&helpers.body(m).trim()===row.body.artifacts.email_draft.body.trim()&&Number(m.internalDate)>=Date.parse(attempt.at)-1000)matches.push(m);}
 const report={matches:matches.length,resent:false,reconciled:false};
 if(matches.length===1){
 const m=matches[0],a=test.parse(test.sql("SELECT json_build_object('activity_id',id,'lease',dispatch_metadata->>'lease') FROM outreach_activities WHERE org_id=1 AND dispatch_metadata->>'plan_id'='"+row.plan_id+"' AND dispatch_metadata->>'step'='1'"));
 const p={org_id:1,...a,content_hash:row.content_hash,external_id:m.id,accepted_at:new Date(Number(m.internalDate)).toISOString(),reviewer:'EXACT_TEST_MESSAGE_RECONCILIATION',source_ref:'gmail-message:'+m.id};
 const result=test.parse(test.sql("SELECT outreach_reconcile_receipt('"+JSON.stringify(p).replace(/'/g,"''")+"'::jsonb)"));assert.equal(result.saved,true);
 report.reconciled=true;report.message_id=m.id;report.thread_id=m.threadId;
 fs.writeFileSync(path.join(test.dir,'receipt-1.json'),JSON.stringify({id:m.id,threadId:m.threadId}));fs.writeFileSync(path.join(test.dir,'original-1.private.json'),JSON.stringify(m));
 }
 fs.writeFileSync(path.join(test.dir,'reconciliation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{client.close();}
