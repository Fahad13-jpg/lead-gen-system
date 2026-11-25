// Run inside Docker. Uses only the isolated PostgreSQL database and a new SQLite n8n profile.
'use strict';
const fs=require('node:fs'),cp=require('node:child_process');
const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
const dir='/tmp/cleaning-n8n-test';fs.mkdirSync(dir,{recursive:true,mode:0o700});
const env={...process.env,DB_TYPE:'sqlite',N8N_USER_FOLDER:dir,N8N_PORT:'5681',N8N_DIAGNOSTICS_ENABLED:'false',N8N_VERSION_NOTIFICATIONS_ENABLED:'false',N8N_PERSONALIZATION_ENABLED:'false',N8N_RUNNERS_ENABLED:'false'};
function cli(args,e=env){console.log('Preparing isolated test: '+args[0]);const r=cp.spawnSync('n8n',args,{env:e,encoding:'utf8',timeout:240000,maxBuffer:8*1024*1024});if(r.status!==0)throw new Error('n8n '+args[0]+' failed: '+(r.error?.message||r.stdout+' '+r.stderr));return r.stdout;}
(async()=>{
 const db=new Client({host:process.env.DB_POSTGRESDB_HOST,port:Number(process.env.DB_POSTGRESDB_PORT||5432),user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_gathering_test_20260926'});await db.connect();
 try{
  cli(['export:credentials','--id=gatheringTestPg','--decrypted','--output='+dir+'/credential.json'],process.env);fs.chmodSync(dir+'/credential.json',0o600);
  const creds=JSON.parse(fs.readFileSync(dir+'/credential.json'));if(creds[0].data.database!=='lead_gathering_test_20260926')throw Error('Unexpected credential database');
  cli(['import:credentials','--input='+dir+'/credential.json']);fs.unlinkSync(dir+'/credential.json');
  const org=930010;
  await db.query("INSERT INTO organizations(id,org_name,status) VALUES($1,'Cleaning n8n fixture','active') ON CONFLICT(id) DO NOTHING",[org]);
  const stamp=Date.now();
  const fixtures=[{company_name:'ڈینٹل کلینک '+stamp,phone:'03001234567',website:'https://clinic.example',address:'1 Main Road'},
   {company_name:'Website clinic '+stamp,website:'https://website.example'},
   {company_name:'Review clinic '+stamp},
   {company_name:'Branch clinic '+stamp,phone:'03001234567',address:'2 Main Road'}];
  const ids=[];for(const f of fixtures){const r=await db.query("INSERT INTO staging_leads(org_id,company_name,phone,website,address,country,source,raw_data,processing_status) VALUES($1,$2,$3,$4,$5,'PK','google_maps',$6,'no_email_available') RETURNING id",[org,f.company_name,f.phone||null,f.website||null,f.address||null,JSON.stringify({location:{lat:0,lng:140},reviewsCount:'1,234'})]);ids.push(r.rows[0].id);}
  await db.query('UPDATE cleaning_controls SET enabled=true');
  const w=JSON.parse(fs.readFileSync('/tmp/cleaning-workflow.json'));w.id='cleaningIsolatedTest';w.active=false;
  const names=['Manual Test','Claim Cleaning Batch','Normalize Leads','Save Cleaning Outcome'];w.nodes=w.nodes.filter(n=>names.includes(n.name));
  w.connections=Object.fromEntries(Object.entries(w.connections).filter(([n])=>names.includes(n)));
  for(const n of w.nodes)if(n.type.endsWith('.postgres'))n.credentials={postgres:{id:'gatheringTestPg',name:'Gathering test database'}};
  w.nodes.find(n=>n.name==='Claim Cleaning Batch').parameters.query='SELECT value AS lead FROM cleaning_claim($1,50,930010) value';
  fs.writeFileSync(dir+'/workflow.json',JSON.stringify(w));cli(['import:workflow','--input='+dir+'/workflow.json']);
  cli(['execute','--id='+w.id]);
  const r=await db.query('SELECT s.id,s.cleaning_status,s.processing_status,c.phone,c.website,c.normalized_name,c.latitude,c.longitude,c.review_count FROM staging_leads s LEFT JOIN cleaned_leads c ON c.staging_id=s.id WHERE s.id=ANY($1::int[]) ORDER BY s.id',[ids]);
  const assert=require('node:assert/strict');assert.deepEqual(r.rows.map(x=>x.cleaning_status),['cleaned','needs_discovery','review','cleaned']);
  assert.equal(r.rows[0].phone,'+923001234567');assert.equal(r.rows[0].website,'https://clinic.example');assert.equal(Number(r.rows[0].latitude),0);assert.equal(Number(r.rows[0].longitude),140);assert.equal(r.rows[0].review_count,1234);assert(r.rows[0].normalized_name.includes('ڈینٹل'));
  assert(r.rows.every(x=>x.processing_status==='no_email_available'));
  cli(['execute','--id='+w.id]);
  const h=await db.query('SELECT count(*)::integer n FROM cleaning_history WHERE staging_id=ANY($1::int[])',[ids]);assert.equal(h.rows[0].n,4);
  console.log('PASS: actual n8n mixed batch, Urdu, PK phone, URL, coordinates, review count, shared-contact branches, discovery state and no-op replay');
 }finally{await db.query('UPDATE cleaning_controls SET enabled=false');await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
