'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
const dir='/tmp/contact-source-first-test';fs.mkdirSync(dir,{recursive:true,mode:0o700});
const env={...process.env,DB_TYPE:'sqlite',N8N_USER_FOLDER:dir,N8N_PORT:'5683',N8N_DIAGNOSTICS_ENABLED:'false',N8N_VERSION_NOTIFICATIONS_ENABLED:'false',N8N_PERSONALIZATION_ENABLED:'false',N8N_RUNNERS_ENABLED:'false'};
function cli(args,e=env){console.log('Isolated n8n: '+args[0]);const r=cp.spawnSync('n8n',args,{env:e,encoding:'utf8',timeout:240000,maxBuffer:8*1024*1024});if(r.status!==0)throw Error(r.error?.message||r.stdout+r.stderr);}
(async()=>{
 const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_gathering_test_20260926'});await db.connect();
 try{
  cli(['export:credentials','--id=gatheringTestPg','--decrypted','--output='+dir+'/pg.json'],process.env);fs.chmodSync(dir+'/pg.json',0o600);
  assert.equal(JSON.parse(fs.readFileSync(dir+'/pg.json'))[0].data.database,'lead_gathering_test_20260926');cli(['import:credentials','--input='+dir+'/pg.json']);fs.unlinkSync(dir+'/pg.json');
  await db.query("INSERT INTO organizations(id,org_name,status) VALUES(940030,'Source-first real n8n fixture','active') ON CONFLICT(id) DO NOTHING");
  const ids=[],leadIds=[];
  for(let i=0;i<3;i++){
   const s=await db.query("INSERT INTO staging_leads(org_id,company_name,source,cleaning_status,raw_data) VALUES(940030,'Source-first fixture','google_maps','cleaned',$1) RETURNING id",[i===0?{emails:['first@business.example','second@business.example']}:{phone:'+12345678901',...(i===1?{socialLinks:{facebook:'https://www.facebook.com/fixture'}}:{})}]);const sid=s.rows[0].id;
   const c=await db.query("INSERT INTO cleaned_leads(org_id,staging_id,company_name,phone,website) VALUES(940030,$1,'Fixture','+12345678901',$2) RETURNING id",[sid,i===2?'https://business.example/':null]);
   await db.query('INSERT INTO cleaning_links(staging_id,org_id,cleaned_id) VALUES($1,940030,$2)',[sid,c.rows[0].id]);ids.push(sid);leadIds.push(c.rows[0].id);
  }
  await db.query(`INSERT INTO contact_discovery_cache(org_id,website,result,expires_at) VALUES(940030,'https://business.example/',$1,now()+interval '1 day') ON CONFLICT(org_id,website) DO UPDATE SET result=excluded.result,expires_at=excluded.expires_at`,[{status:'found',candidates:[{email:'cached@business.example',score:80,method:'published_website',source_url:'https://business.example/contact'}],pages_attempted:2}]);
  await db.query('UPDATE contact_controls SET discovery_enabled=true,verification_enabled=false,staging_ids=$1',[ids]);
  const w=JSON.parse(fs.readFileSync('/tmp/03b_email_scraper.json'));w.id='sourceFirstIsolated';w.active=false;
  w.nodes=w.nodes.filter(n=>!['Every Minute','Contact Status','Validate Status','Read Contact Status','Status Response'].includes(n.name));const names=new Set(w.nodes.map(n=>n.name));w.connections=Object.fromEntries(Object.entries(w.connections).filter(([n])=>names.has(n)));
  for(const n of w.nodes){if(n.type.endsWith('.postgres'))n.credentials={postgres:{id:'gatheringTestPg',name:'Gathering test database'}};
   if(n.name==='Run Contact Worker')n.parameters.command="={{ 'node /tmp/contact-source-first-test/worker.cjs ' + $json.id + ' ' + $json.lease + ' lead_gathering_test_20260926' }}";
  }
  fs.writeFileSync(dir+'/workflow.json',JSON.stringify(w));cli(['import:workflow','--input='+dir+'/workflow.json']);cli(['execute','--id=sourceFirstIsolated']);
  const results=await db.query('SELECT t.staging_id,t.status,a.result FROM contact_tasks t JOIN contact_attempts a ON a.lease=t.lease WHERE t.org_id=940030 AND t.staging_id=ANY($1::int[]) ORDER BY t.staging_id',[ids]);
  assert.equal(results.rows.length,3);assert.equal(results.rows[0].result.stop_reason,'saved_business_contacts_found');assert.equal(results.rows[0].result.candidates.length,2);
  assert.equal(results.rows[1].result.stop_reason,'no_website_or_saved_email');assert(results.rows[1].result.contact_routes.length>0);
  assert.equal(results.rows[2].result.cache_hit,true);assert.equal(results.rows[2].result.network_pages_this_attempt,0);
  assert(results.rows.every(r=>r.result.strategy==='contact_evidence_v2'));
  const contacts=await db.query('SELECT method FROM lead_contacts WHERE org_id=940030 AND lead_id=ANY($1::int[])',[leadIds]);assert.equal(contacts.rows.length,3);assert.equal(contacts.rows.filter(r=>r.method==='source_record').length,2);
  const promoted=await db.query('SELECT count(*)::int n FROM cleaned_leads WHERE id=ANY($1::int[]) AND (email IS NOT NULL OR email_valid=true)',[leadIds]);assert.equal(promoted.rows[0].n,0);
  await db.query(`INSERT INTO contact_social_cache(org_id,profile,result,expires_at) VALUES(940030,'https://www.facebook.com/fixture',$1,now()+interval '1 day') ON CONFLICT(org_id,profile) DO UPDATE SET result=excluded.result,expires_at=excluded.expires_at`,[{title:'Fixture',facebookUrl:'https://www.facebook.com/fixture',phone:'+12345678901',email:'hello@business.example'}]);
  const sw=JSON.parse(fs.readFileSync('/tmp/03c_facebook_contact_discovery.json'));sw.id='contactSocialIsolated';sw.active=false;sw.nodes=sw.nodes.filter(n=>n.name!=='Every Minute');delete sw.connections['Every Minute'];sw.nodes.find(n=>n.name==='Advance Facebook Queue').parameters.command='node /tmp/contact-source-first-test/social-worker.cjs lead_gathering_test_20260926';
  fs.writeFileSync(dir+'/social-workflow.json',JSON.stringify(sw));cli(['import:workflow','--input='+dir+'/social-workflow.json']);cli(['execute','--id=contactSocialIsolated']);
  const social=(await db.query('SELECT status,result FROM contact_social_jobs WHERE lead_id=$1',[leadIds[1]])).rows[0];assert.equal(social.status,'completed');assert.equal(social.result.cache_hit,true);assert.equal(social.result.identity.matched,true);
  const candidate=(await db.query("SELECT relevance_status,status FROM lead_contacts WHERE lead_id=$1 AND email='hello@business.example'",[leadIds[1]])).rows[0];assert.equal(candidate.relevance_status,'eligible');assert.equal(candidate.status,'pending');
  console.log('PASS: real n8n 03b + 03c: qualified source contacts, no-website routing, website/social caches, Facebook identity, provenance and no unverified promotion. No provider calls.');
 }finally{await db.query('UPDATE contact_controls SET discovery_enabled=false,verification_enabled=false,staging_ids=NULL');await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
