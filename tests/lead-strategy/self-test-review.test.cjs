'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const policy=require('../../scripts/lead-strategy/v2/sender-policy.cjs'),{prepare}=require('../../scripts/lead-strategy/v2/self-test-review.cjs');
const sender=()=>policy.draft({org_id:1,credential_ref:'mock',sender_email:'sender@example.org',daily_limit:10,mailbox_rolling_limit:10,min_interval_seconds:300});
const verified={profile_verified:true,reason:'matched'};
test('review binds one email to the verified sender, never authorizes transport',()=>{
 const r=prepare(sender(),verified);assert.equal(r.message.to,r.message.from);assert.equal(r.message.max_messages,1);
 assert.deepEqual(r.message.followups,[]);assert.equal(r.message.automatic_retries,false);assert.equal(r.execution_authorized,false);
 assert.equal(r.review_hash,prepare(sender(),verified).review_hash);
});
test('unverified or mismatched sender cannot produce a send review',()=>{
 assert.throws(()=>prepare(sender(),{}),/VERIFIED_ACCOUNT_REQUIRED/);
 const s=sender();s.binding.email='other@example.org';assert.throws(()=>prepare(s,verified),/SENDER_BINDING_MISMATCH/);
});
test('an enabled policy is not silently accepted for this controlled test',()=>{
 const s=sender();s.email_dispatch.enabled=true;assert.throws(()=>prepare(s,verified),/DISABLED_SENDER_DRAFT_REQUIRED/);
});
