'use strict';
// Operator lifecycle for one browser acceptance fixture; never creates a call.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),active='/home/node/.n8n/calling-browser-test.json';
function docker(args,input){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:20000,maxBuffer:200000});if(r.status!==0)throw Error('BROWSER_TEST_DOCKER_FAILED');return r.stdout.trim();}
function remote(){const raw=docker(['exec','n8n','node','-e',"const fs=require('fs');console.log(fs.existsSync('"+active+"')?fs.readFileSync('"+active+"','utf8'):'null')"]);return JSON.parse(raw);}
function summary(s){return s?{id:s.id,enabled:s.enabled===true,expires_at:s.expires_at,bound_to_call:!!s.call_id,requests:s.requests||0,outcomes:(s.events||[]).map(e=>e.outcome),stop_reason:s.stop_reason||null,booking:s.booking?{state:s.booking.state,event_id:s.booking.event_id,start:s.booking.start,end:s.booking.end}:null,test_only:true,real_lead_updated:false}: {armed:false};}
async function snapshot(org,campaign){
 const pool=require('../dashboard/start-local-auth.cjs').localPool();try{
  assert.equal((await pool.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only,'on');
  const a=(await pool.query({text:"SELECT 1 FROM org_sender_memberships m JOIN organizations o ON o.id=m.org_id AND o.status='active' WHERE m.org_id=$1 AND m.active AND m.role IN('owner','admin') LIMIT 1",values:[org]})).rows[0];assert.ok(a,'LOCAL_OWNER_REQUIRED');
  const r=(await pool.query({text:'SELECT c.version,v.config FROM strategy_campaigns c JOIN strategy_campaign_versions v ON v.org_id=c.org_id AND v.campaign_id=c.id AND v.version=c.version WHERE c.org_id=$1 AND c.id=$2',values:[org,campaign]})).rows[0];assert.ok(r,'CAMPAIGN_REQUIRED');
  const d=r.config.call_dispatch;assert.ok(d?.calendar?.ready===true&&d.calendar.slots?.length,'OWNER_CALENDAR_AND_SLOTS_REQUIRED');
  assert.ok(d.enabled!==true&&d.release?.enabled!==true,'CALLING_MUST_STAY_PAUSED');
  return {version:r.version,calendar:d.calendar};
 }finally{await pool.end();}
}
async function main(){
 const mode=process.argv[2];assert.ok(['prepare','arm','status','disarm'].includes(mode));
 const base=path.join(root,'.local/calling-browser-test');fs.mkdirSync(base,{recursive:true});
 if(mode==='status'){console.log(JSON.stringify(summary(remote())));return;}
 if(mode==='disarm'){
  const old=remote();if(!old){console.log('{"armed":false}');return;}
  fs.writeFileSync(path.join(base,old.id+'-receipt-private.json'),JSON.stringify(old,null,2));
  old.enabled=false;const f=path.join(base,'disarmed-private.json');fs.writeFileSync(f,JSON.stringify(old));
  docker(['cp',f,'n8n:'+active]);docker(['exec','-u','root','n8n','chown','node:node',active]);docker(['exec','n8n','chmod','600',active]);console.log(JSON.stringify(summary(remote())));return;
 }
 const c=JSON.parse(fs.readFileSync(path.join(root,'.local/calling-tools-20261028/private.json'),'utf8'));
 const prepared=path.join(base,'prepared-private.json');
 if(mode==='prepare'){
  const org=Number(process.argv[3]),campaign=Number(process.argv[4]);assert.ok(Number.isSafeInteger(org)&&org===c.org_id&&Number.isSafeInteger(campaign)&&campaign>0,'EXPLICIT_BOUND_ORG_CAMPAIGN_REQUIRED');
  const snap=await snapshot(org,campaign);
  const a=await require('./configure-retell-agent.cjs').request('GET','/get-agent/'+c.agent_id,c.retell_key);assert.equal(a.is_published,false);
  const calendars=await require('../dashboard/calling-calendar.cjs').localCatalog()(org);
  assert.ok(calendars.connected&&calendars.calendars.some(x=>x.id===snap.calendar.id&&['owner','writer'].includes(x.accessRole)),'WRITABLE_CALENDAR_REQUIRED');
  const slots=snap.calendar.slots.filter(x=>Date.parse(x.start)>Date.now()).slice(0,3);assert.ok(slots.length,'FUTURE_OWNER_SLOTS_REQUIRED');
  const token=crypto.randomBytes(32).toString('hex'),s={version:'browser_acceptance_v1',enabled:false,id:crypto.randomBytes(16).toString('hex'),org_id:org,campaign_id:campaign,campaign_version:snap.version,agent_id:c.agent_id,agent_version:a.version,token_hash:crypto.createHash('sha256').update(token).digest('hex'),timezone:'Asia/Karachi',calendar:{ready:true,id:snap.calendar.id,slots}};
  fs.writeFileSync(prepared,JSON.stringify(s,null,2));
  const brief='Browser test session: '+token+'\nBrowser acceptance test with fictional Example Clinic. Sender company: MY Company. Opening: Hi, this is an AI assistant calling on behalf of MY Company. Permission question: Is now a convenient time for a brief explanation? Offer: a clinic website demonstration. Approved facts: the demonstration shows a services page, contact page and opening hours. Objective: ask whether a short demo would be useful. No approved price, guarantee or delivery date. This is a test; Calendar bookings are test appointments only.';
  fs.writeFileSync(path.join(base,'test-variables.json'),JSON.stringify({browser_test_token:token,approved_call_brief:brief},null,2));
  fs.writeFileSync(path.join(base,'approved-call-brief.txt'),brief+'\n');
  console.log(JSON.stringify({prepared:true,armed:false,agent_version:a.version,slot_count:slots.length,timezone:s.timezone,variables_file:path.join(base,'test-variables.json'),calls_created:0,events_created:0}));return;
 }
 const s=JSON.parse(fs.readFileSync(prepared,'utf8')),snap=await snapshot(s.org_id,s.campaign_id);
 assert.equal(snap.version,s.campaign_version,'CAMPAIGN_CHANGED_PREPARE_AGAIN');assert.deepEqual(snap.calendar.slots.filter(x=>Date.parse(x.start)>Date.now()).slice(0,3),s.calendar.slots,'SLOTS_CHANGED_PREPARE_AGAIN');
 const old=remote();
 if(old){assert.ok(!old.enabled||Date.parse(old.expires_at)<=Date.now(),'SESSION_ALREADY_ARMED');assert.ok(old.booking?.state!=='claimed','UNKNOWN_BOOKING_RECONCILE_FIRST');fs.writeFileSync(path.join(base,old.id+'-receipt-private.json'),JSON.stringify(old,null,2));}
 s.enabled=true;s.created_at=new Date().toISOString();s.expires_at=new Date(Date.now()+10*60000).toISOString();
 assert.equal(require('./browser-test.cjs').valid(s,Date.now()),true,'TEST_SESSION_INVALID');
 const f=path.join(base,'armed-private.json');fs.writeFileSync(f,JSON.stringify(s));
 docker(['cp',f,'n8n:'+active]);docker(['exec','-u','root','n8n','chown','node:node',active]);docker(['exec','n8n','chmod','600',active]);
 assert.deepEqual(remote(),s,'SESSION_INSTALL_UNCONFIRMED');console.log(JSON.stringify({...summary(s),calls_created:0,events_created:0}));
}
if(require.main===module)main().catch(e=>{console.error(e.code==='ENOENT'?'BROWSER_TEST_PREPARE_REQUIRED':/^[A-Z][A-Z_]+$/.test(e.message)?e.message:'BROWSER_TEST_SETUP_UNCONFIRMED');process.exitCode=1;});
module.exports={summary,snapshot};
