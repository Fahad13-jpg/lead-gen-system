'use strict';
const fs=require('fs'),assert=require('assert/strict');
const file='workflows/09_reply_detection.json',w=JSON.parse(fs.readFileSync(file,'utf8'));
const notes=structuredClone(w.nodes.filter(n=>n.type==='n8n-nodes-base.stickyNote'));
const get=name=>w.nodes.find(n=>n.name===name);
const dbCredential=get('Get Recent Outreach Emails').credentials;
const gmailCredential=get('Check Gmail Inbox').credentials.gmailOAuth2;
function add(name,type,parameters,credentials){let n=get(name);if(!n){n={id:'reply-v2-'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-'),name,type,typeVersion:type.endsWith('httpRequest')?4.2:type.endsWith('postgres')?2.6:2,position:[w.nodes.length*80,500]};w.nodes.push(n);}Object.assign(n,{type,parameters});if(credentials)n.credentials=credentials;return n;}
const code=(name,jsCode)=>add(name,'n8n-nodes-base.code',{mode:'runOnceForEachItem',jsCode});
get('Schedule Trigger').parameters={rule:{interval:[{field:'minutes',minutesInterval:2}]}};
// Fixed credentials cannot safely be chosen from each input item. One explicitly
// bound mailbox per workflow instance until secure OAuth routing is implemented.
const binding=code('Bound Mailbox Gate',`// Configure only after verifying the Gmail credential owner and org mapping.
// No implicit org=1 or default sender. Closed during local development.
return null;`);
binding.parameters.mode='runOnceForEachItem';
get('Get Recent Outreach Emails').parameters.query=`SELECT a.id AS activity_id,a.org_id,a.lead_id,a.external_id,coalesce(nullif(a.dispatch_metadata->>'recipient_email',''),c.email) AS lead_email,
a.dispatch_metadata->>'sender_email' AS sender_email,a.dispatch_metadata->>'credential_ref' AS credential_ref,a.dispatch_metadata->'delivery_scan' AS delivery_scan
FROM outreach_activities a JOIN cleaned_leads c ON c.id=a.lead_id AND c.org_id=a.org_id
WHERE a.org_id=NULLIF('{{ String($json.org_id || '').replace(/'/g, "''") }}','')::integer
AND a.channel='email' AND a.dispatch_metadata->>'state'='provider_accepted'
AND a.dispatch_metadata->>'credential_ref'='{{ String($json.credential_ref || '').replace(/'/g, "''") }}'
AND a.dispatch_metadata->>'sender_email'='{{ String($json.email || '').replace(/'/g, "''") }}'
AND a.replied_at IS NULL AND a.bounced_at IS NULL
ORDER BY a.dispatch_metadata->'reply_scan'->>'checked_at' NULLS FIRST,a.id LIMIT 10`;
code('Bind Reply Activity',`const binding=$('Bound Mailbox Gate').item.json;
if(binding.credential_ref!==${JSON.stringify(gmailCredential.id)})throw Error('WORKFLOW_CREDENTIAL_MISMATCH');
if(!$json.activity_id||String($json.org_id)!==String(binding.org_id)||$json.credential_ref!==binding.credential_ref||$json.sender_email!==binding.email)return null;
return {json:{binding,activity:$json}};`);
function http(name,url){const n=add(name,'n8n-nodes-base.httpRequest',{method:'GET',url,authentication:'predefinedCredentialType',nodeCredentialType:'gmailOAuth2',options:{timeout:20000}},{gmailOAuth2:structuredClone(gmailCredential)});n.retryOnFail=false;return n;}
http('Load Original Gmail Message',"={{ 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + encodeURIComponent($json.activity.external_id) + '?format=full' }}");
code('Verify Original Context',`const row=$('Bind Reply Activity').item.json;
if($json.id!==row.activity.external_id||!/^[a-f0-9]{8,64}$/i.test($json.threadId||''))throw Error('ORIGINAL_MESSAGE_UNVERIFIED');
return {json:{...row,original:$json}};`);
http('Load Gmail Conversation',"={{ 'https://gmail.googleapis.com/gmail/v1/users/me/threads/' + encodeURIComponent($json.original.threadId) + '?format=full' }}");
const source=fs.readFileSync('scripts/lead-strategy/v2/gmail-replies.cjs','utf8');
http('Read Connected Mailbox','https://gmail.googleapis.com/gmail/v1/users/me/profile');
code('Verify Connected Mailbox',`const helpers=(()=>{const module={exports:{}};\n${source}\nreturn module.exports;})();
return {json:helpers.verifyMailbox($('Bound Mailbox Gate').item.json,$json,${JSON.stringify(gmailCredential.id)})};`);
code('Match Conversation Replies',`const helpers=(()=>{const module={exports:{}};\n${source}\nreturn module.exports;})();
const row=$('Verify Original Context').item.json;
if($json.id!==row.original.threadId||!Array.isArray($json.messages)||$json.messages.length>200)throw Error('CONVERSATION_UNVERIFIED');
const events=[],reviews=[],seen=new Set();
for(const message of $json.messages){if(message.id===row.original.id||seen.has(message.id))continue;seen.add(message.id);
 const result=helpers.match(row.binding,row.activity,row.original,message);
 if(result.matched)events.push(result);else if(result.reason!=='outgoing_message')reviews.push({message_id:message.id,reason:result.reason});}
return {json:{...row.binding,activity_id:row.activity.activity_id,external_id:row.activity.external_id,sender_email:row.binding.email,events,reviews}};`);
const saved=add('Persist Reply Scan','n8n-nodes-base.postgres',{operation:'executeQuery',query:`SELECT outreach_reply_scan_finish('{{ JSON.stringify($json).replace(/'/g, "''") }}'::jsonb) AS result`,options:{}},dbCredential);saved.retryOnFail=false;
code('Prepare Delivery Window',`const context=$('Verify Original Context').item.json;
const previous=context.activity.delivery_scan||{};
const sent=Number(context.original.internalDate);
const continuing=previous.complete===false;
const from=continuing?previous.window_start:(previous.checked_through||sent);
const until=continuing?previous.window_end:Date.now();
const token=continuing?previous.next_page_token:null;
const restarting=continuing&&previous.restart_pending===true&&token==null;
if(!Number.isSafeInteger(sent)||sent<=0||!Number.isSafeInteger(from)||!Number.isSafeInteger(until)||from<sent||until<from||until>Date.now()+1000||continuing&&!restarting&&(typeof token!=='string'||!token||token.length>2000))throw Error('DELIVERY_WINDOW_INVALID');
const q='after:'+Math.max(0,Math.floor(from/1000)-1)+' before:'+(Math.floor(until/1000)+1)+' -in:sent -in:drafts';
return {json:{...context,scan:$json,previous,window_start:from,window_end:until,list_url:'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q='+encodeURIComponent(q)+(token?'&pageToken='+encodeURIComponent(token):'')}};`);
http('List Delivery Candidates','={{ $json.list_url }}');
const expand=code('Expand Delivery Candidates',`const out=[];
for(const [i,item] of $input.all().entries()){
 const context=$('Prepare Delivery Window').itemMatching(i).json;const list=item.json;
 if(!list||list.error||list.messages!==undefined&&!Array.isArray(list.messages)||(list.messages||[]).length>25)throw Error('DELIVERY_PAGE_INVALID');
 const next=list.nextPageToken||null;
 if(next!==null&&(typeof next!=='string'||next.length>2000||next===context.previous.next_page_token))throw Error('DELIVERY_PAGE_TOKEN_INVALID');
 const ids=[...new Set((list.messages||[]).map(m=>m.id))];
 if(ids.some(id=>typeof id!=='string'||!/^[a-f0-9]{8,64}$/i.test(id)))throw Error('DELIVERY_MESSAGE_ID_INVALID');
 context.next_page_token=next;
 const candidates=ids.filter(id=>id!==context.original.id);
 for(const candidate_id of candidates.length?candidates:[null])out.push({json:{context,candidate_id},pairedItem:{item:i}});
}return out;`);expand.parameters.mode='runOnceForAllItems';
add('Has Delivery Candidate?','n8n-nodes-base.if',{conditions:{options:{caseSensitive:true,typeValidation:'strict',version:2},conditions:[{id:'delivery-candidate',leftValue:'={{ $json.candidate_id ? 1 : 0 }}',rightValue:1,operator:{type:'number',operation:'equals'}}],combinator:'and'},options:{}}).typeVersion=2.2;
http('Load Delivery Candidate',"={{ 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + encodeURIComponent($json.candidate_id) + '?format=full' }}");
code('Match Delivery Candidate',`const helpers=(()=>{const module={exports:{}};\n${source}\nreturn module.exports;})();
const row=$('Expand Delivery Candidates').item.json;
if($json.id!==row.candidate_id||$json.error)throw Error('DELIVERY_MESSAGE_UNAVAILABLE');
const c=row.context;const result=helpers.match(c.binding,c.activity,c.original,$json);
const event=result.matched&&result.category==='hard_bounce'?result:null;
const review=result.reason?.startsWith('delivery_report_')&&!['delivery_report_recipient_mismatch','delivery_report_original_mismatch'].includes(result.reason)?{message_id:row.candidate_id,reason:result.reason}:null;
return {json:{...row,event,review}};`);
const aggregate=code('Assemble Delivery Scan',`const groups=new Map();
for(const [i,item] of $input.all().entries()){
 const r=item.json,c=r.context,key=c.binding.org_id+':'+c.activity.activity_id;
 if(!groups.has(key))groups.set(key,{context:c,events:[...c.scan.events],reviews:[...c.scan.reviews],pairedItem:{item:i}});
 const g=groups.get(key);if(r.event)g.events.push(r.event);if(r.review)g.reviews.push(r.review);
}
return [...groups.values()].map(g=>{const c=g.context;const events=[...new Map(g.events.map(e=>[e.stop_event.event_id,e])).values()];
 const review_required=c.previous.review_required===true||g.reviews.length>0;
 return {json:{...c.scan,events,reviews:g.reviews,delivery_scan_previous:c.previous,delivery_scan_next:{window_start:c.window_start,window_end:c.window_end,
 complete:!c.next_page_token,next_page_token:c.next_page_token,checked_through:c.next_page_token?(c.previous.checked_through||null):c.window_end,review_required}},pairedItem:g.pairedItem};});`);
aggregate.parameters.mode='runOnceForAllItems';
code('Check Reply Persistence',`if($json.result?.saved!==true)throw Error('REPLY_SCAN_NOT_PERSISTED');return {json:$json.result};`);
// Preserve legacy nodes/notes for reference, but disconnect and disable their
// guessed lead identity, model call, and automatic qualification writes.
const path=['Schedule Trigger','Bound Mailbox Gate','Read Connected Mailbox','Verify Connected Mailbox','Get Recent Outreach Emails','Bind Reply Activity','Load Original Gmail Message','Verify Original Context','Load Gmail Conversation','Match Conversation Replies','Prepare Delivery Window','List Delivery Candidates','Expand Delivery Candidates','Has Delivery Candidate?','Load Delivery Candidate','Match Delivery Candidate','Assemble Delivery Scan','Persist Reply Scan','Check Reply Persistence'];
w.connections={};for(let i=0;i<path.length-1;i++)w.connections[path[i]]={main:[[{node:path[i+1],type:'main',index:0}]]};
w.connections['Has Delivery Candidate?'].main[1]=[{node:'Assemble Delivery Scan',type:'main',index:0}];
w.connections['Error Handler']={main:[[{node:'Log Error',type:'main',index:0}]]};
get('Log Error').parameters={mode:'runOnceForEachItem',jsCode:`const exec=$json;return {json:{workflow:'Reply Detection',error_message:String(exec.execution?.error?.message||'reply_check_failed').replace(/'/g,"''")}};`};
for(const n of w.nodes){
 if(!path.includes(n.name)&&!['Error Handler','Log Error'].includes(n.name)&&n.type!=='n8n-nodes-base.stickyNote')n.disabled=true;
 if(path.includes(n.name))delete n.disabled;
 if(n.type==='n8n-nodes-base.code')n.parameters.mode=n.parameters.mode||'runOnceForAllItems';
 if(n.type==='n8n-nodes-base.postgres')n.alwaysOutputData=true;
}
w.active=false;
assert.deepEqual(w.nodes.filter(n=>n.type==='n8n-nodes-base.stickyNote'),notes);
if(!get('Reply V2 Status'))w.nodes.push({id:'reply-v2-status',name:'Reply V2 Status',type:'n8n-nodes-base.stickyNote',typeVersion:1,position:[-100,500],parameters:{width:420,height:340,content:'## Current local reply path\nSchedule Trigger: every 2 minutes. Explicit mailbox binding required; gate CLOSED. Original Gmail message + conversation matching; stop before qualification; migration 025 persists scan progress. Legacy AI/qualification branches retained but disabled and disconnected. Historical notes describe the old path.\n\nUNVERIFIED: authenticated Gmail HTTP nodes in installed n8n; live inbox integration. Delivery reports and unmatched replies need review. No automatic reply sending.'}});
fs.writeFileSync(file,JSON.stringify(w,null,2)+'\n');
console.log('09: bounded scheduled conversation checks, explicit mailbox gate, deterministic stop; local only.');
