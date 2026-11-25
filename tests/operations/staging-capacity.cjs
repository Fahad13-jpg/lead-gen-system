'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{check}=require('../../scripts/operations/staging-capacity.cjs');
test('parallel staging refuses insufficient or unknown free memory before resource creation',()=>{
 assert.throws(()=>check({freeBytes:700*1048576}),/MORE_FREE_MEMORY/);
 assert.throws(()=>check({freeBytes:NaN}),/CAPACITY_UNKNOWN/);
 assert.throws(()=>check({freeBytes:2*1024*1048576,freeDiskBytes:0}),/DISK_SPACE/);
 assert.equal(check({freeBytes:2*1024*1048576,freeDiskBytes:3*1024*1048576}).ready,true);
});
