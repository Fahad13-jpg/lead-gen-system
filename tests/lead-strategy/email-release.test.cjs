'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os');
const release=require('../../scripts/lead-strategy/v2/email-release.cjs');
test('release is ordered, inactive and excludes unrelated stages',()=>{
 const m=release.inspect(process.cwd());assert.equal(m.files.length,13);assert.equal(m.deployment_authorized,false);
 assert(m.migrations[0].includes('021_'));assert(m.migrations[10].includes('031_email_uncertain_contact_guard'));assert.equal(m.workflows.length,2);
});
test('bundle verifies exact bytes and refuses overwriting reviewed output',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'email-release-')),target=path.join(tmp,'bundle');
 release.pack(process.cwd(),target);assert.equal(release.verify(target).files.length,13);
 assert.throws(()=>release.pack(process.cwd(),target),/already exists/);
 fs.appendFileSync(path.join(target,'database/migrations/030_delivery_scan_recovery.sql'),'\n-- changed\n');
 assert.throws(()=>release.verify(target),/changed/);
 // Small test artifacts retained in OS temp; no recursive deletion required.
});
test('release rejects missing or duplicate contact-guard migrations',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'email-release-guard-')),target=path.join(tmp,'bundle');
 release.pack(process.cwd(),target);
 const guard=path.join(target,'database/migrations/031_email_uncertain_contact_guard.sql');
 fs.renameSync(guard,guard+'.omitted');
 assert.throws(()=>release.inspect(target),/021 through 031 exactly once/);
 fs.renameSync(guard+'.omitted',guard);
 fs.copyFileSync(guard,path.join(target,'database/migrations/031_duplicate.sql'));
 assert.throws(()=>release.inspect(target),/021 through 031 exactly once/);
});
