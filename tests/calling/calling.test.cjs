'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {assess,select}=require('../../scripts/calling/policy.cjs');
const {tick}=require('../../scripts/calling/executor.cjs');
const {book}=require('../../scripts/calling/calendar.cjs');
const now='2026-10-25T10:00:00Z';
function policy(){return {org_id:1,funding:'platform',destination:'US',language:'en',now,
 connection:{org_id:1,provider:'retell',status:'ready',funding:'platform',routes:{US:{verified:true,enabled:true,transport:'retell_managed'},PK:{verified:true,enabled:true,transport:'custom_sip'}}},
 checks:Object.fromEntries(['authorized_org_access','approved_hash_current','recipient_eligible','unsuppressed','campaign_running',
 'within_campaign_window','within_plan_window','spacing_ready','compliance_eligible','voice_language_tested','caller_id_authorized'].map(k=>[k,true])),
 limits:{org_daily_calls:2},usage:{active_or_uncertain_calls:0,org_daily_calls:0,org_reserved_calls:0},
 budget:{scope:'platform_all_orgs',max_call_micro_usd:300000,quote_verified:true,quote_expires_at:'2026-10-26T00:00:00Z',
 period_start:'2026-10-01T00:00:00Z',period_end:'2026-11-01T00:00:00Z',used_micro_usd:0,reserved_micro_usd:0,buffer_micro_usd:500000}};}
function job(id='a'){return {id,policy:policy(),due_at:now,created_at:now,plan_hash:'fixture-approved-hash',
 call_brief:{opening:{text:'Fixture greeting'},permission_question:{text:'Is this a convenient time?'}}};}
function deps(){return {mode:'mock',now:()=>now,reserveAndBegin:async()=>({authorized:true,lease:'fixture-lease'}),
 createCall:async()=>({id:'fixture-call'}),recordAccepted:async()=>({saved:true}),markUncertain:async()=>{}};}
test('eligible preview never authorizes execution',()=>{const p=assess(policy());assert.equal(p.policy_eligible,true);assert.equal(p.execution_authorized,false);});
test('shared pool cannot be increased through a supplied ceiling',()=>{const p=policy();Object.assign(p.budget,{used_micro_usd:9300000,ceiling_micro_usd:100000000});assert.ok(assess(p).reasons.includes('waiting_for_calling_credits'));});
test('customer funds are separate and organization bound',()=>{const p=policy();p.funding=p.connection.funding='byok';Object.assign(p.budget,{scope:'organization',org_id:1,ceiling_micro_usd:2000000});assert.equal(assess(p).policy_eligible,true);p.budget.org_id=2;assert.equal(assess(p).policy_eligible,false);});
test('Pakistan remains deferred even with a verified custom route',()=>{const p=policy();p.destination='PK';assert.ok(assess(p).reasons.includes('market_not_in_initial_rollout'));p.connection.routes.PK.transport='retell_managed';assert.ok(assess(p).reasons.includes('pakistan_custom_route_required'));});
test('stale quote, budget month, missing limits and malformed usage fail closed',()=>{
 for(const alter of [p=>p.budget.quote_expires_at=now,p=>p.budget.period_end=now,p=>p.limits.org_daily_calls=null,p=>p.usage.org_reserved_calls=-1,p=>p.now='invalid',p=>p.budget.used_micro_usd=NaN]){const p=policy();alter(p);assert.equal(assess(p).policy_eligible,false);}
});
test('every existing gate remains mandatory',()=>{for(const key of Object.keys(policy().checks)){const p=policy();p.checks[key]=false;assert.ok(assess(p).reasons.includes(key));}});
test('unknown and active calls block subsequent calls',()=>{for(const v of [1,undefined]){const p=policy();p.usage.active_or_uncertain_calls=v;assert.equal(assess(p).policy_eligible,false);}});
test('oldest eligible request wins; blocked organization does not stall queue',()=>{const a=job('a'),b=job('b');b.created_at='2026-10-25T10:00:01Z';assert.equal(select([b,a],now).job.id,'a');a.policy.usage.org_daily_calls=2;assert.equal(select([a,b],now).job.id,'b');});
test('future due work is not selected',()=>{const a=job();a.due_at='2026-10-26T00:00:00Z';assert.equal(select([a],now).job,null);});
test('mock accepted call is not marked completed',async()=>{const r=await tick([job()],deps());assert.equal(r.state,'provider_accepted');assert.equal(r.completed,false);});
test('live calling is impossible through this slice',async()=>{await assert.rejects(tick([job()],{...deps(),mode:'live'}),/LIVE_CALLING/);});
test('reservation denied causes zero provider calls',async()=>{let n=0;const d=deps();d.reserveAndBegin=async()=>({authorized:false});d.createCall=async()=>{n++;};assert.equal((await tick([job()],d)).state,'blocked');assert.equal(n,0);});
test('ambiguous creation is quarantined without retry',async()=>{let n=0,q=0;const d=deps();d.createCall=async()=>{n++;throw Error('timeout');};d.markUncertain=async()=>{q++;};const r=await tick([job()],d);assert.equal(r.retry_allowed,false);assert.equal(n,1);assert.equal(q,1);});
test('uncertain database begin never reaches provider',async()=>{const d=deps();d.reserveAndBegin=async()=>{throw Error('timeout');};d.createCall=async()=>assert.fail('must not dial');assert.equal((await tick([job()],d)).reason,'begin_commit_unknown');});
test('receipt write failure requires reconciliation',async()=>{const d=deps();d.recordAccepted=async()=>({saved:false});assert.equal((await tick([job()],d)).state,'reconciliation_required');});
function booking(){return {org_id:1,calendar_id:'fixture-calendar',call_id:'fixture-call',slot_id:'slot-1',confirmed_by_recipient:true,start:'2026-10-26T10:00:00Z',end:'2026-10-26T10:15:00Z'};}
function calendar(){return {mode:'mock',now:()=>now,authorizedCalendar:async()=>true,claimBooking:async()=>({acquired:true}),isFree:async()=>true,insertEvent:async r=>({id:r.event_id}),finishBooking:async()=>({saved:true})};}
test('confirmed available slot books with deterministic identity',async()=>{const a=await book(booking(),calendar()),b=await book(booking(),calendar());assert.equal(a.state,'booked');assert.equal(a.event_id,b.event_id);});
test('unconfirmed, cross-org and occupied bookings never insert',async()=>{for(const kind of ['unconfirmed','cross_org','busy']){const r=booking(),d=calendar();d.insertEvent=async()=>assert.fail('no insertion');if(kind==='unconfirmed')r.confirmed_by_recipient=false;if(kind==='cross_org')d.authorizedCalendar=async()=>false;if(kind==='busy')d.isFree=async()=>false;assert.notEqual((await book(r,d)).state,'booked');}});
test('uncertain booking retains identity and forbids blind retry',async()=>{const d=calendar();d.insertEvent=async()=>{throw Error('timeout');};const r=await book(booking(),d);assert.equal(r.state,'reconciliation_required');assert.equal(r.retry_allowed,false);assert.match(r.event_id,/^[a-f0-9]{64}$/);});
test('already booked request reuses saved result without insertion',async()=>{const d=calendar();d.claimBooking=async()=>({existing:{state:'booked',event_id:'existing'}});d.insertEvent=async()=>assert.fail('duplicate');assert.equal((await book(booking(),d)).event_id,'existing');});
test('failed uncertain-state write still returns no-retry result',async()=>{const d=deps();d.createCall=async()=>{throw Error('timeout');};d.markUncertain=async()=>{throw Error('DB unavailable');};const r=await tick([job()],d);assert.equal(r.reason,'uncertain_state_commit_unknown');assert.equal(r.retry_allowed,false);});
test('unknown booking claim never reaches calendar insertion',async()=>{const d=calendar();d.claimBooking=async()=>{throw Error('DB timeout');};d.insertEvent=async()=>assert.fail('must not insert');const r=await book(booking(),d);assert.equal(r.reason,'booking_claim_commit_unknown');assert.equal(r.retry_allowed,false);});
