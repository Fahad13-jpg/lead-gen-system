'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const w=JSON.parse(fs.readFileSync('workflows/09_reply_detection.json','utf8'));
const run=name=>new Function('$json','$','$input','Buffer',w.nodes.find(n=>n.name===name).parameters.jsCode);
function context(){return {binding:{org_id:1},activity:{activity_id:2},original:{id:'abcd1234',internalDate:'1700000000000'},previous:{},window_start:1700000000000,window_end:1700000010000,scan:{org_id:1,activity_id:2,events:[],reviews:[]}};}
test('new window starts at original send; continuation keeps bounds/token',()=>{
 const row=context();const get=()=>({item:{json:row}});let result=run('Prepare Delivery Window')({},get,{},Buffer).json;
 assert.equal(result.window_start,1700000000000);assert(result.list_url.includes('maxResults=25'));
 row.activity.delivery_scan={complete:false,window_start:1700000000000,window_end:1700000010000,next_page_token:'abc'};
 result=run('Prepare Delivery Window')({},get,{},Buffer).json;assert.equal(result.window_end,1700000010000);assert(result.list_url.endsWith('pageToken=abc'));
 row.activity.delivery_scan.next_page_token='';assert.throws(()=>run('Prepare Delivery Window')({},get,{},Buffer),/DELIVERY_WINDOW_INVALID/);
});
test('list expansion preserves empty-page sentinel and item linkage',()=>{
 const c=context(),get=()=>({itemMatching:()=>({json:c})});
 let result=run('Expand Delivery Candidates')({},get,{all:()=>[{json:{}}]},Buffer);assert.equal(result.length,1);assert.equal(result[0].json.candidate_id,null);assert.deepEqual(result[0].pairedItem,{item:0});
 result=run('Expand Delivery Candidates')({},get,{all:()=>[{json:{messages:[{id:'bbbb1234'},{id:'bbbb1234'}]}}]},Buffer);assert.equal(result.length,1);
 assert.throws(()=>run('Expand Delivery Candidates')({},get,{all:()=>[{json:{messages:[{id:'bad'}]}}]},Buffer),/DELIVERY_MESSAGE_ID_INVALID/);
});
test('incomplete pages retain old checkpoint; last page advances only fixed window end',()=>{
 const c=context();c.next_page_token='page2';
 const call=()=>run('Assemble Delivery Scan')({},null,{all:()=>[{json:{context:c,candidate_id:null}}]},Buffer)[0].json;
 let result=call();assert.equal(result.delivery_scan_next.complete,false);assert.equal(result.delivery_scan_next.checked_through,null);
 c.next_page_token=null;result=call();assert.equal(result.delivery_scan_next.complete,true);assert.equal(result.delivery_scan_next.checked_through,c.window_end);
 c.previous.review_required=true;assert.equal(call().delivery_scan_next.review_required,true);
});
test('graph routes empty page and fetched messages to aggregation before persistence',()=>{
 assert.equal(w.connections['Has Delivery Candidate?'].main[1][0].node,'Assemble Delivery Scan');
 assert.equal(w.connections['Assemble Delivery Scan'].main[0][0].node,'Persist Reply Scan');
 assert.equal(w.nodes.find(n=>n.name==='Expand Delivery Candidates').parameters.mode,'runOnceForAllItems');
});
test('explicit recovery replays the same window without advancing the checkpoint',()=>{
 const row=context();row.activity.delivery_scan={complete:false,restart_pending:true,window_start:1700000000000,window_end:1700000010000,review_required:true};
 const result=run('Prepare Delivery Window')({},()=>({item:{json:row}}),{},Buffer).json;
 assert.equal(result.window_start,1700000000000);assert.equal(result.window_end,1700000010000);
 assert(!result.list_url.includes('pageToken='));assert.equal(result.previous.review_required,true);
 row.activity.delivery_scan.restart_pending=false;
 assert.throws(()=>run('Prepare Delivery Window')({},()=>({item:{json:row}}),{},Buffer),/DELIVERY_WINDOW_INVALID/);
});
test('reply matching prefers the recipient recorded at send time',()=>{
 const query=w.nodes.find(n=>n.name==='Get Recent Outreach Emails').parameters.query;
 assert(query.includes("coalesce(nullif(a.dispatch_metadata->>'recipient_email',''),c.email) AS lead_email"));
});
