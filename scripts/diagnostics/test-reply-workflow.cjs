'use strict';
// Actual n8n routing, with every external boundary replaced by fixtures.
const fs=require('fs'),cp=require('child_process'),path=require('path'),assert=require('assert/strict');
const name='reply-scan-runtime-20261018',dir=path.resolve('.local/'+name);
function docker(args){const r=cp.spawnSync('docker',args,{encoding:'utf8',timeout:240000,maxBuffer:2e6});if(r.status!==0)throw Error(String(r.stderr||r.error).slice(0,800));return r.stdout.trim();}
fs.mkdirSync(dir,{recursive:true});
const w=JSON.parse(fs.readFileSync('workflows/09_reply_detection.json','utf8'));
const n=name=>w.nodes.find(n=>n.name===name);
const credential=n('Read Connected Mailbox').credentials.gmailOAuth2.id;
function mock(name,jsCode,mode='runOnceForEachItem'){Object.assign(n(name),{type:'n8n-nodes-base.code',typeVersion:2,parameters:{mode,jsCode}});delete n(name).credentials;delete n(name).disabled;}
Object.assign(n('Schedule Trigger'),{type:'n8n-nodes-base.manualTrigger',typeVersion:1,parameters:{}});
mock('Bound Mailbox Gate','return {json:'+JSON.stringify({org_id:1,email:'sender@example.org',credential_ref:credential})+'};');
mock('Read Connected Mailbox',"return {json:{emailAddress:'sender@example.org'}};");
const rows=['empty','bounce','paged','restart'].map((kind,i)=>({activity_id:i+1,org_id:1,lead_id:i+1,external_id:'abcdef1234',lead_email:'clinic@example.org',sender_email:'sender@example.org',credential_ref:credential,_case:kind,...(kind==='restart'?{delivery_scan:{complete:false,restart_pending:true,window_start:1700000000000,window_end:1700000010000,review_required:true}}:{})}));
mock('Get Recent Outreach Emails','return '+JSON.stringify(rows)+'.map(json=>({json}));','runOnceForAllItems');
mock('Load Original Gmail Message',`return {json:{id:'abcdef1234',threadId:'11112222',internalDate:'1700000000000',payload:{headers:[{name:'From',value:'sender@example.org'},{name:'To',value:'clinic@example.org'},{name:'Message-ID',value:'<original@example.org>'}]}}};`);
mock('Load Gmail Conversation',"return {json:{id:'11112222',messages:[$('Verify Original Context').item.json.original]}};");
mock('List Delivery Candidates',`const kind=$json.activity._case;return {json:['empty','restart'].includes(kind)?{}:{messages:[{id:'abcd9999'},{id:'abcd9998'}],...(kind==='paged'?{nextPageToken:'page2'}:{})}};`);
mock('Load Delivery Candidate',String.raw`const id=$json.candidate_id;const encoded=s=>({data:Buffer.from(s).toString('base64url')});return {json:id==='abcd9998'?{id,threadId:'ffffffff',payload:{headers:[]}}:{id,threadId:'ffffffff',internalDate:'1700000010000',payload:{mimeType:'multipart/report',headers:[{name:'From',value:'mailer-daemon@example.org'}],parts:[{mimeType:'message/delivery-status',body:encoded('Reporting-MTA: dns; mx.example.org\r\n\r\nFinal-Recipient: rfc822; clinic@example.org\r\nAction: failed\r\nStatus: 5.1.1')},{mimeType:'text/rfc822-headers',body:encoded('Message-ID: <original@example.org>\r\nTo: clinic@example.org')}]}}};`);
mock('Persist Reply Scan',`const p=$json,id=p.activity_id,scan=p.delivery_scan_next; if(![1,2,3,4].includes(id)||p.org_id!==1)throw Error('SCOPE');if(scan.complete!==(id!==3))throw Error('WRONG_COMPLETION');if((scan.checked_through===null)!==(id===3))throw Error('WRONG_CHECKPOINT');if(p.events.length!==([1,4].includes(id)?0:1))throw Error('LOST_OR_DUPLICATE_EVENTS');if(![1,4].includes(id)&&p.events[0].stop_event.kind!=='bounce')throw Error('WRONG_EVENT');if(id===4&&(scan.review_required!==true||scan.window_end!==1700000010000||scan.restart_pending))throw Error('RECOVERY_CHANGED_WINDOW_OR_REVIEW');return {json:{result:{saved:true,activity_id:id,complete:scan.complete,events:p.events.length}}};`);
// Prune disconnected legacy nodes only in this test artifact.
const reachable=new Set();function visit(name){if(reachable.has(name))return;reachable.add(name);for(const branch of w.connections[name]?.main||[])for(const edge of branch)visit(edge.node);}visit('Schedule Trigger');
w.nodes=w.nodes.filter(x=>reachable.has(x.name));
for(const x of w.nodes){delete x.credentials;assert(!['n8n-nodes-base.gmail','n8n-nodes-base.postgres','n8n-nodes-base.httpRequest'].includes(x.type));}
for(const key of Object.keys(w.connections))if(!reachable.has(key))delete w.connections[key];
w.id='scratchReplyScan';w.name='Scratch reply pagination';w.active=false;delete w.meta;w.settings={executionOrder:'v1'};
fs.writeFileSync(path.join(dir,'workflow.json'),JSON.stringify(w));
fs.writeFileSync(path.join(dir,'run.cjs'),`const fs=require('fs'),cp=require('child_process'),crypto=require('crypto');
fs.mkdirSync('/tmp/reply-out',{recursive:true});const env={...process.env,N8N_USER_FOLDER:'/tmp/reply-'+crypto.randomBytes(8).toString('hex'),N8N_ENCRYPTION_KEY:crypto.randomBytes(24).toString('hex')};
for(const args of [['import:workflow','--input=/tmp/reply/workflow.json'],['execute','--id=scratchReplyScan','--rawOutput']]){
const r=cp.spawnSync('n8n',args,{env,encoding:'utf8',timeout:180000,maxBuffer:12e6});fs.writeFileSync('/tmp/reply-out/'+args[0].replace(':','-')+'.log',(r.stdout||'')+(r.stderr||''));if(r.status)process.exit(1);
if(args[0]==='execute'){let result;for(let i=0;i<r.stdout.length;i++){if(r.stdout[i]!=='{')continue;try{result=JSON.parse(r.stdout.slice(i,r.stdout.lastIndexOf('}')+1));break;}catch{}}
const d=result?.data?.resultData||result?.resultData;const rows=d?.runData?.['Check Reply Persistence']?.flatMap(x=>x.data?.main?.[0]||[]).map(x=>x.json)||[];
if(rows.length!==4||new Set(rows.map(x=>x.activity_id)).size!==4||rows.some(x=>x.saved!==true)||d?.error)process.exit(2);
fs.writeFileSync('/tmp/reply-out/results.json',JSON.stringify({cases:rows,network:'none',real_providers:false,sql:'mocked; separately scratch tested'},null,2));}}
`);
const image=docker(['inspect','n8n','--format','{{.Image}}']);assert(/^sha256:[a-f0-9]{64}$/.test(image));
if(!process.argv.includes('--resume'))docker(['create','--name',name,'--network','none','--memory','768m','--label','codex.scratch=reply-scan','--env','DB_TYPE=sqlite','--env','N8N_RUNNERS_ENABLED=false','--env','N8N_DIAGNOSTICS_ENABLED=false','--env','N8N_VERSION_NOTIFICATIONS_ENABLED=false','--env','N8N_TEMPLATES_ENABLED=false','--entrypoint','node',image,'/tmp/reply/run.cjs']);
const info=JSON.parse(docker(['inspect',name]))[0];assert.equal(info.HostConfig.NetworkMode,'none');assert.equal(info.Image,image);assert.equal(info.Config.Labels['codex.scratch'],'reply-scan');assert.equal(info.Mounts.length,0);assert(!info.State.Running);
docker(['cp',dir+'/.',name+':/tmp/reply']);let failure;try{docker(['start','-a',name]);}catch(e){failure=e;}
docker(['cp',name+':/tmp/reply-out/.',dir]);if(failure)throw failure;
const result=JSON.parse(fs.readFileSync(path.join(dir,'results.json'),'utf8'));fs.writeFileSync('documentation/strategy-contract-v2/reply-workflow-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
