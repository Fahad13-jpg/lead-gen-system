'use strict';
const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict'),{Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
const dir='/tmp/enrichment-isolated';fs.mkdirSync(dir,{recursive:true,mode:0o700});
const env={...process.env,DB_TYPE:'sqlite',N8N_USER_FOLDER:dir,N8N_PORT:'5685',N8N_DIAGNOSTICS_ENABLED:'false',N8N_VERSION_NOTIFICATIONS_ENABLED:'false',N8N_RUNNERS_ENABLED:'false'};
function cli(args,e=env){console.log('Isolated test: '+args[0]);const r=cp.spawnSync('n8n',args,{env:e,encoding:'utf8',timeout:240000,maxBuffer:8*1024*1024});if(r.status!==0){fs.writeFileSync(dir+'/last-error.log',(r.stdout||'')+(r.stderr||''),{mode:0o600});throw Object.assign(Error('n8n test step failed'),{code:r.error?.code||'CLI_'+r.status});}}
(async()=>{const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_gathering_test_20260926'});await db.connect();try{
 cli(['export:credentials','--id=gatheringTestPg','--decrypted','--output='+dir+'/pg.json'],process.env);fs.chmodSync(dir+'/pg.json',0o600);assert.equal(JSON.parse(fs.readFileSync(dir+'/pg.json'))[0].data.database,'lead_gathering_test_20260926');cli(['import:credentials','--input='+dir+'/pg.json']);fs.unlinkSync(dir+'/pg.json');
 await db.query("INSERT INTO organizations(id,org_name,status) VALUES(940061,'Enrichment n8n fixture','active') ON CONFLICT DO NOTHING");
 const leads=[];for(let i=0;i<2;i++){const sid=(await db.query("INSERT INTO staging_leads(org_id,company_name,source,cleaning_status,raw_data) VALUES(940061,'Clinic One','google_maps','cleaned','{}') RETURNING id")).rows[0].id;const lid=(await db.query("INSERT INTO cleaned_leads(org_id,staging_id,company_name,category,city) VALUES(940061,$1,'Clinic One','Dental clinic','Islamabad') RETURNING id",[sid])).rows[0].id;await db.query('INSERT INTO cleaning_links(staging_id,org_id,cleaned_id) VALUES($1,940061,$2)',[sid,lid]);leads.push(lid);}
 await db.query('UPDATE enrichment_controls SET enabled=true,lead_ids=$1',[leads]);
 for(const [file,id] of [['06A_basic_enrichment.json','enrichmentBasicTest'],['06B_ai_deep_research.json','enrichmentResearchTest']]){
  if(process.env.NATIVE_AI_LIVE==='true'&&id==='enrichmentResearchTest'){
   await db.query("UPDATE enrichment_profiles SET basic=basic||$2::jsonb WHERE lead_id=ANY($1) AND org_id=940061",[leads,JSON.stringify({evidence:[{type:'website_description',value:'Synthetic clinic offers dental implants and checkups.',source_url:'https://clinic.example/services'}]})]);
   await db.query("UPDATE enrichment_ai_controls SET enabled=true,cooldown_until=NULL,monthly_request_limit=(SELECT count(*)+1 FROM enrichment_ai_requests WHERE reserved_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')");
  }
  const w=JSON.parse(fs.readFileSync('/tmp/'+file));w.id=id;w.active=false;const flow=['Manual Test','Claim Enrichment Tasks','Validate Lease','Run Enrichment Worker','Validate Worker Result','Save Enrichment','Load Research Input','Prepare Evidence and AI Request','Reserve AI Allowance','AI Allowed?','Groq Evidence Analysis','Validate AI Evidence','Record AI Usage','Restore Research Result','Keep Evidence Without AI'];w.nodes=w.nodes.filter(n=>flow.includes(n.name));w.connections=Object.fromEntries(Object.entries(w.connections).filter(([key])=>flow.includes(key)));
  for(const n of w.nodes){if(n.type.endsWith('.postgres'))n.credentials={postgres:{id:'gatheringTestPg',name:'Gathering test database'}};if(n.name==='Run Enrichment Worker')n.parameters.command="={{ 'node /home/node/.n8n/enrichment-stage/worker.cjs ' + $json.id + ' ' + $json.lease + ' lead_gathering_test_20260926' }}";}
  fs.writeFileSync(dir+'/'+id+'.json',JSON.stringify(w));cli(['import:workflow','--input='+dir+'/'+id+'.json']);cli(['execute','--id='+id]);console.log('Executed '+id);
 }
 const rows=(await db.query('SELECT * FROM enrichment_profiles WHERE org_id=940061 AND lead_id=ANY($1)',[leads])).rows;assert.equal(rows.length,2);for(const r of rows){assert.equal(r.basic.reason,'no_website');assert.equal(r.research.readiness.campaign,'configuration_needed');assert.equal(r.research.linkedin.collection_status,'not_configured');}
 assert.equal((await db.query('SELECT count(*)::int n FROM cleaned_leads WHERE id=ANY($1) AND email_valid=true',[leads])).rows[0].n,0);
 if(process.env.NATIVE_AI_LIVE==='true'){
  assert.equal(rows.filter(r=>r.research.ai_research.status==='review_required').length,1);
  assert.equal(rows.filter(r=>r.research.ai_research.status==='rate_limited').length,1);
  console.log('PASS native n8n live AI: one validated result, second lead deferred by throttle, both preserved, no outreach');
 }else console.log('PASS real n8n 06A and 06B: two leads preserved, missing evidence honest, no external calls or verified promotion');
 }finally{await db.query('UPDATE enrichment_controls SET enabled=false,lead_ids=NULL');if(process.env.NATIVE_AI_LIVE==='true')await db.query('UPDATE enrichment_ai_controls SET enabled=false,monthly_request_limit=0');await db.end();}})().catch(e=>{console.error('Isolated n8n enrichment test failed: '+(e.code||e.name));process.exitCode=1});
