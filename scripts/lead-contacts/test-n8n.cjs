'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
const dir='/tmp/contact-n8n-test';fs.mkdirSync(dir,{recursive:true,mode:0o700});
const env={...process.env,DB_TYPE:'sqlite',N8N_USER_FOLDER:dir,N8N_PORT:'5682',N8N_DIAGNOSTICS_ENABLED:'false',N8N_VERSION_NOTIFICATIONS_ENABLED:'false',N8N_PERSONALIZATION_ENABLED:'false',N8N_RUNNERS_ENABLED:'false'};
function cli(args,e=env){console.log('Isolated n8n: '+args[0]);const r=cp.spawnSync('n8n',args,{env:e,encoding:'utf8',timeout:240000,maxBuffer:8*1024*1024});if(r.status!==0)throw Error(r.error?.message||r.stdout+r.stderr);}
(async()=>{const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_gathering_test_20260926'});await db.connect();
try{
 cli(['export:credentials','--id=gatheringTestPg','--decrypted','--output='+dir+'/pg.json'],process.env);fs.chmodSync(dir+'/pg.json',0o600);
 assert.equal(JSON.parse(fs.readFileSync(dir+'/pg.json'))[0].data.database,'lead_gathering_test_20260926');cli(['import:credentials','--input='+dir+'/pg.json']);fs.unlinkSync(dir+'/pg.json');
 await db.query("INSERT INTO organizations(id,org_name,status) VALUES(940010,'Contact n8n fixture','active') ON CONFLICT(id) DO NOTHING");
 const ids=[];for(let i=0;i<2;i++){
  const s=await db.query("INSERT INTO staging_leads(org_id,company_name,source,cleaning_status) VALUES(940010,$1,'google_maps','cleaned') RETURNING id",['Contact '+Date.now()+' '+i]);const sid=s.rows[0].id;
  const c=await db.query("INSERT INTO cleaned_leads(org_id,staging_id,company_name,website) VALUES(940010,$1,'Fixture',$2) RETURNING id",[sid,'https://clinic'+sid+'.example']);await db.query('INSERT INTO cleaning_links(staging_id,org_id,cleaned_id) VALUES($1,940010,$2)',[sid,c.rows[0].id]);ids.push(sid);
 }
 await db.query('UPDATE contact_controls SET discovery_enabled=true,verification_enabled=true,monthly_requests=100,provider_pause=NULL,staging_ids=$1,last_provider_claim=NULL',[ids]);await db.query('SELECT contact_sync()');
 const rows=await db.query("SELECT * FROM contact_tasks WHERE staging_id=ANY($1::int[]) AND kind='discovery' ORDER BY id",[ids]);
 const fixture={};for(const [i,t] of rows.rows.entries())fixture[t.id]={status:'found',candidates:[{email:'clinic'+i+'@business.example',score:90,source_url:t.source_value+'/contact',method:'published_website'}]};
 fs.writeFileSync(dir+'/fixtures.json',JSON.stringify(fixture),{mode:0o600});
 for(const [i,file] of ['03b_email_scraper.json','05_email_validation(Batch).json'].entries()){
  const w=JSON.parse(fs.readFileSync('/tmp/'+file));w.id='contactIsolated'+i;w.active=false;
  w.nodes=w.nodes.filter(n=>!['Every Minute','Contact Status','Validate Status','Read Contact Status','Status Response'].includes(n.name));const names=new Set(w.nodes.map(n=>n.name));w.connections=Object.fromEntries(Object.entries(w.connections).filter(([n])=>names.has(n)));
  for(const n of w.nodes){if(n.type.endsWith('.postgres'))n.credentials={postgres:{id:'gatheringTestPg',name:'Gathering test database'}};
   if(n.name==='Run Contact Worker')n.parameters.command="={{ 'CONTACT_TEST_FIXTURE=/tmp/contact-n8n-test/fixtures.json node /home/node/.n8n/contact-stage/worker.cjs ' + $json.id + ' ' + $json.lease + ' lead_gathering_test_20260926' }}";
  }
  fs.writeFileSync(dir+'/workflow'+i+'.json',JSON.stringify(w));cli(['import:workflow','--input='+dir+'/workflow'+i+'.json']);
 }
 cli(['execute','--id=contactIsolated0']);
 let c=await db.query('SELECT lead_id,email FROM lead_contacts WHERE org_id=940010 AND lead_id IN(SELECT cleaned_id FROM cleaning_links WHERE staging_id=ANY($1::int[])) ORDER BY lead_id',[ids]);assert.deepEqual(c.rows.map(r=>r.email),['clinic0@business.example','clinic1@business.example']);
 await db.query('SELECT contact_sync()');const vr=await db.query("SELECT id FROM contact_tasks WHERE staging_id=ANY($1::int[]) AND kind='verification' ORDER BY id",[ids]);
 for(const [i,t] of vr.rows.entries())fixture[t.id]=i?{status:'risky',evidence:{catch_all:true}}:{status:'verified',evidence:{smtp:true,catch_all:false}};
 fs.writeFileSync(dir+'/fixtures.json',JSON.stringify(fixture));
 cli(['execute','--id=contactIsolated1']);await db.query('UPDATE contact_controls SET last_provider_claim=NULL');cli(['execute','--id=contactIsolated1']);
 const outcomes=await db.query('SELECT status FROM lead_contacts WHERE org_id=940010 AND lead_id IN(SELECT cleaned_id FROM cleaning_links WHERE staging_id=ANY($1::int[])) ORDER BY lead_id',[ids]);assert.deepEqual(outcomes.rows.map(r=>r.status),['verified','risky']);
 const primary=await db.query('SELECT c.email_valid FROM cleaned_leads c JOIN cleaning_links l ON l.cleaned_id=c.id WHERE l.staging_id=ANY($1::int[]) ORDER BY c.id',[ids]);assert.equal(primary.rows[0].email_valid,true);assert.notEqual(primary.rows[1].email_valid,true);
 cli(['execute','--id=contactIsolated0']);const count=await db.query('SELECT count(*)::int n FROM lead_contacts WHERE org_id=940010 AND lead_id IN(SELECT cleaned_id FROM cleaning_links WHERE staging_id=ANY($1::int[]))',[ids]);assert.equal(count.rows[0].n,2);
 console.log('PASS: real n8n two-lead discovery, stable item identity, helper execution, verified/risky routing, no duplicate candidates and no provider calls');
}finally{await db.query('UPDATE contact_controls SET discovery_enabled=false,verification_enabled=false,staging_ids=NULL');await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
