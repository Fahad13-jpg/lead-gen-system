'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const dir='.local/contact-deploy';fs.mkdirSync(dir,{recursive:true});const key=fs.readFileSync('.local/gathering-api-key','utf8').trim();
const sql=q=>cp.execFileSync('docker',['exec','postgres_db','psql','-X','-v','ON_ERROR_STOP=1','-U','n8n_user','-d','lead_db','-Atc',q],{encoding:'utf8',timeout:60000}).trim();const json=q=>JSON.parse(sql(q));
async function get(q,auth=true){const r=await fetch('http://127.0.0.1:5678/webhook/contact-status?'+q,{headers:auth?{'X-Lead-Gathering-Key':key}:{},signal:AbortSignal.timeout(10000)});let data={};try{data=await r.json();}catch{}return {status:r.status,data};}
(async()=>{
 const mode=process.argv[2];
 if(mode==='prepare'){
  let ready=false;const deadline=Date.now()+180000;while(Date.now()<deadline){try{const r=await get('org_id=1');if(r.status===200&&r.data.org_id===1){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,2000));}assert(ready,'contact webhook unavailable');
  let r=await get('org_id=bad');assert.equal(r.status,400);r=await get('org_id=1',false);assert([401,403].includes(r.status));
  assert.equal(sql("SELECT discovery_enabled OR verification_enabled FROM contact_controls WHERE id"),'f');
  const ids=json("SELECT coalesce(json_agg(staging_id),'[]') FROM ((SELECT l.staging_id FROM cleaned_leads c JOIN cleaning_links l ON l.cleaned_id=c.id AND l.org_id=c.org_id WHERE c.org_id=1 AND contact_eligible(l.org_id,l.cleaned_id,l.staging_id) AND NULLIF(c.website,'') IS NOT NULL AND NULLIF(c.email,'') IS NULL ORDER BY l.staging_id DESC LIMIT 2) UNION (SELECT l.staging_id FROM cleaned_leads c JOIN cleaning_links l ON l.cleaned_id=c.id AND l.org_id=c.org_id WHERE c.org_id=1 AND contact_eligible(l.org_id,l.cleaned_id,l.staging_id) AND NULLIF(c.email,'') IS NOT NULL ORDER BY l.staging_id DESC LIMIT 1)) q");assert(ids.length>0);
  const baseline={ids,outreach:Number(sql('SELECT count(*) FROM outreach_activities'))};fs.writeFileSync(dir+'/canary.json',JSON.stringify(baseline));console.log('PASS: authenticated status API; canary staged for '+ids.length+' leads');
 }else if(mode==='canary'||mode==='discovery-only'){
  const {ids}=JSON.parse(fs.readFileSync(dir+'/canary.json'));assert(ids.every(Number.isSafeInteger));
  if(mode==='discovery-only'){sql('UPDATE contact_controls SET staging_ids=ARRAY['+ids.join(',')+'],monthly_requests=100,discovery_enabled=true,verification_enabled=false WHERE id');console.log('Website-only canary enabled; Abstract verification remains disabled');}
  else{sql('UPDATE contact_controls SET staging_ids=ARRAY['+ids.join(',')+'],monthly_requests=3,discovery_enabled=true,verification_enabled=true WHERE id');console.log('Canary enabled: at most three verification reservations; no paid discovery');}
 }else if(mode==='status'){
  const r=await get('org_id=1');assert.equal(r.status,200);console.log(JSON.stringify(r.data));
 }else if(mode==='automatic'||mode==='automatic-discovery'){
  const {ids,outreach}=JSON.parse(fs.readFileSync(dir+'/canary.json'));assert.equal(Number(sql('SELECT count(*) FROM outreach_activities')),outreach);
  assert.equal(Number(sql("SELECT count(*) FROM contact_tasks WHERE status='processing'")),0,'canary still processing');
  assert.equal(Number(sql('SELECT count(*) FROM contact_attempts WHERE NOT (task_id IN(SELECT id FROM contact_tasks WHERE staging_id IN('+ids.join(',')+')))')),0,'work escaped canary');
  assert(Number(sql('SELECT count(*) FROM contact_attempts WHERE finished_at IS NOT NULL'))>0,'no canary results');
  assert(Number(sql("SELECT count(*) FROM contact_attempts WHERE kind='verification'"))<=3,'canary verification cap exceeded');
  if(mode==='automatic-discovery'){assert.equal(Number(sql("SELECT count(*) FROM contact_attempts WHERE kind='verification'")),0,'External verification was requested');sql('UPDATE contact_controls SET staging_ids=NULL,monthly_requests=100,discovery_enabled=true,verification_enabled=false WHERE id');console.log('Automatic website discovery enabled; external verification remains disabled');}
  else{sql('UPDATE contact_controls SET staging_ids=NULL,monthly_requests=100,discovery_enabled=true,verification_enabled=true WHERE id');console.log('Automatic free discovery enabled; verification capped at 100/month and any provider pause preserved');}
 }else throw Error('Use prepare, canary, status or automatic');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
