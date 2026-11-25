'use strict';
// Host-side rollout checks. Prints only counts, IDs and outcomes, never credentials.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const dir='.local/cleaning-deploy';fs.mkdirSync(dir,{recursive:true});
const key=fs.readFileSync('.local/gathering-api-key','utf8').trim();
function sql(query){return cp.execFileSync('docker',['exec','postgres_db','psql','-X','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db','-Atc',query],{encoding:'utf8',timeout:60000}).trim();}
function json(query){return JSON.parse(sql(query));}
async function get(path,auth=true){const r=await fetch('http://127.0.0.1:5678/webhook/'+path,{headers:auth?{'X-Lead-Gathering-Key':key}:{},signal:AbortSignal.timeout(20000)});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data={};}return {status:r.status,data};}
(async()=>{
 const mode=process.argv[2];
 if(mode==='preview'){
  let ready=false;const deadline=Date.now()+180000;
  while(Date.now()<deadline){try{const r=await get('cleaning-status?org_id=1');if(r.status===200&&r.data.counts){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,2000));}
  assert(ready,'Production cleaning endpoints did not become ready');
  assert.equal(sql('SELECT enabled FROM cleaning_controls WHERE id=true'),'f');
  const rows=json("SELECT coalesce(json_agg(q),'[]') FROM (SELECT s.id,s.org_id,s.processing_status FROM staging_leads s LEFT JOIN cleaned_leads c ON c.staging_id=s.id WHERE s.org_id=1 AND c.id IS NULL ORDER BY s.id DESC LIMIT 5) q");assert.equal(rows.length,5,'Need five eligible canary records');
  for(const row of rows){const r=await get('cleaning-preview?org_id='+row.org_id+'&staging_id='+row.id);assert.equal(r.status,200);assert(r.data.preview);assert.equal(r.data.proposal.rule_version,'cleaning-v1');assert(!r.data.proposal.lease_token);row.expected=r.data.proposal.outcome;}
  let r=await get('cleaning-status?org_id=1');assert.equal(r.status,200);
  r=await get('cleaning-preview?org_id=2147483647&staging_id='+rows[0].id);assert.equal(r.status,404);
  r=await get('cleaning-status?org_id=bad');assert.equal(r.status,400);
  r=await get('cleaning-status?org_id=1',false);assert([401,403].includes(r.status));
  const baseline=json('SELECT json_build_object(\'outreach\',(SELECT count(*) FROM outreach_activities),\'history\',(SELECT count(*) FROM cleaning_history))');
  fs.writeFileSync(dir+'/canary.json',JSON.stringify({rows,baseline},null,2));
  console.log('PASS: production preview, authentication and tenant boundaries; five leads previewed with no writes');
 }else if(mode==='canary'){
  const {rows}=JSON.parse(fs.readFileSync(dir+'/canary.json'));const ids=rows.map(r=>r.id);assert(ids.every(Number.isSafeInteger));
  sql('UPDATE cleaning_controls SET staging_ids=ARRAY['+ids.join(',')+'],enabled=true WHERE id=true');
  console.log('Enabled five-lead canary: '+ids.join(', '));
 }else if(mode==='verify-canary'||mode==='automatic'){
  const {rows,baseline}=JSON.parse(fs.readFileSync(dir+'/canary.json'));const ids=rows.map(r=>r.id);assert(ids.every(Number.isSafeInteger));
  const actual=json('SELECT json_agg(q) FROM (SELECT id,cleaning_status,processing_status FROM staging_leads WHERE id IN ('+ids.join(',')+')) q');
  for(const row of rows){const a=actual.find(x=>x.id===row.id);assert.equal(a.cleaning_status,row.expected,'Canary not complete: '+row.id);assert.equal(a.processing_status,row.processing_status,'Discovery status changed');}
  assert.equal(Number(sql('SELECT count(*) FROM cleaning_history')),baseline.history+5,'Unexpected work outside canary');
  assert.equal(Number(sql('SELECT count(*) FROM outreach_activities')),baseline.outreach,'Outreach changed');
  assert.equal(Number(sql('SELECT count(*) FROM cleaned_leads WHERE staging_id IN ('+ids.join(',')+') AND email_valid=true')),0,'Unverified canary email marked valid');
  console.log('PASS: five canary outcomes, exact-once audit, independent discovery state and no outreach');
  if(mode==='automatic'){sql('UPDATE cleaning_controls SET staging_ids=NULL,enabled=true WHERE id=true');console.log('Automatic cleaning enabled for the backlog and future leads');}
 }else if(mode==='status'){
  const r=await get('cleaning-status?org_id=1');assert.equal(r.status,200);console.log(JSON.stringify({counts:r.data.counts}));
 }else throw Error('Expected preview, canary, verify-canary, automatic or status');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
