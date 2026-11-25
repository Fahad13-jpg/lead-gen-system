'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
async function main(){const dir='.local/owned-email-test-20261115',prior=JSON.parse(fs.readFileSync(dir+'/prepared.json'));assert.equal(prior.campaign_id,4);assert.equal(prior.recipient,'fah7861234@gmail.com');assert.ok(!fs.existsSync(dir+'/refreshed-plan.json'),'INSPECT_EXISTING_REFRESH');
 const pool=require('../dashboard/start-local-auth.cjs').localPool({registryWrite:true});let db,open=false;try{db=await pool.connect();await db.query('BEGIN');open=true;
 const q=async(fn,p)=>(await db.query({text:`SELECT ${fn}($1::jsonb) result`,values:[JSON.stringify(p)]})).rows[0]?.result;
 assert.equal((await db.query('SELECT version FROM strategy_campaigns WHERE org_id=1 AND id=4 FOR UPDATE')).rows[0].version,prior.campaign_version);
 assert.equal((await db.query("SELECT count(*)::integer n FROM enrichment_tasks WHERE org_id=1 AND lead_id=475 AND status IN('pending','processing')")).rows[0].n,0,'WAIT_FOR_EVIDENCE');
 assert.equal((await db.query("SELECT count(*)::integer n FROM contact_tasks WHERE org_id=1 AND lead_id=475 AND status IN('pending','processing')")).rows[0].n,0,'WAIT_FOR_CONTACT_CHECK');
 const controls=(await db.query('SELECT enabled FROM strategy_controls WHERE id FOR UPDATE')).rows[0];assert.equal(controls.enabled,false);
 assert.equal((await db.query("SELECT count(*)::integer n FROM strategy_jobs WHERE status IN('pending','processing')")).rows[0].n,0,'OTHER_JOBS_PENDING');
 const queued=await q('strategy_enqueue',{org_id:1,campaign_id:4,lead_id:475,request_id:'owned-email-test-20261115-after-evidence'});assert.ok(queued.job_id&&!queued.error);
 await db.query('UPDATE strategy_controls SET enabled=true WHERE id');const claim=(await db.query("SELECT strategy_claim('owned-email-test-after-evidence',1) result")).rows[0]?.result;await db.query('UPDATE strategy_controls SET enabled=false WHERE id');assert.equal(Number(claim.id),Number(queued.job_id));
 const native=require('../lead-strategy/v2/native.cjs'),p=native.prepare(claim,{customerTemplatesEnabled:true}),assembled=native.assemble(p,{});assert.equal(p.wants_ai,false);assert.deepEqual(assembled.plan.blocking_reasons,[]);
 assert.equal(assembled.plan.artifacts.email_draft.body,prior.messages[0]);assert.deepEqual(assembled.plan.artifacts.followup_drafts.map(x=>x.body),prior.messages.slice(1));
 const saved=await q('strategy_finish',assembled);assert.equal(saved.saved,true);fs.writeFileSync(dir+'/claim-after-evidence-private.json',JSON.stringify(claim,null,2));
 // The only committed control state is the original disabled state. Verify both
 // our final transactional value and what another session can see before COMMIT.
 assert.equal((await db.query('SELECT enabled FROM strategy_controls WHERE id')).rows[0].enabled,false,'CONTROL_MUST_BE_DISABLED_BEFORE_COMMIT');
 assert.equal((await pool.query('SELECT enabled FROM strategy_controls WHERE id')).rows[0].enabled,false,'OTHER_SESSIONS_MUST_SEE_DISABLED');
 await db.query('COMMIT');open=false;
 assert.equal((await pool.query('SELECT enabled FROM strategy_controls WHERE id')).rows[0].enabled,false,'CONTROL_MUST_REMAIN_DISABLED');
 const current=(await pool.query('SELECT p.fingerprint=strategy_context(p.org_id,p.campaign_id,p.lead_id)->>\'fingerprint\' current FROM strategy_plans p WHERE p.org_id=1 AND p.id=$1',[saved.plan_id])).rows[0]?.current;assert.equal(current,true,'INPUT_CHANGED_AGAIN');
 const result={...prior,plan_id:saved.plan_id,content_hash:saved.content_hash,previous_stale_plan_id:prior.plan_id,current_context:true,approved:false,emails_sent:0};fs.writeFileSync(dir+'/refreshed-plan.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,messages:undefined}));
 }catch(e){if(open)await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db?.release();await pool.end();}}
main().catch(e=>{console.error(/^[A-Z][A-Z_]+$/.test(e.message)?e.message:'PLAN_REFRESH_FAILED');process.exitCode=1;});
