'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const r=require('../../scripts/organization-policy/customer-release.cjs');
test('customer package includes planner, executor, reply workflow and 032 with closed gates',()=>{const m=r.inspect(process.cwd());assert.equal(m.files.length,5);assert.equal(m.deployment_authorized,false);assert.equal(m.sending_authorized,false);});
test('review bundle is immutable and detects modified bytes',()=>{const dir=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'customer-release-')),'bundle');r.pack(process.cwd(),dir);assert.equal(r.verify(dir).files.length,5);assert.throws(()=>r.pack(process.cwd(),dir),/already exists/);fs.appendFileSync(path.join(dir,'database/migrations/032_customer_content_approval.sql'),'\n-- altered');assert.throws(()=>r.verify(dir),/Release content changed/);});
