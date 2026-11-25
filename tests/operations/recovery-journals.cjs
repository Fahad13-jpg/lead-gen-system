'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const{collect}=require('../../scripts/operations/recovery-journals.cjs');
test('backup preserves campaign uncertainty journals and locks without collecting unrelated files',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lead-journal-test-'));
 try{
  const directory=path.join(root,'.local/campaign-slices/slice');fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'operator.lock'),'');fs.writeFileSync(path.join(directory,'send_start.json'),'{"outcome":"uncertain"}');fs.writeFileSync(path.join(root,'.local','unrelated-secret'),'omit');
  const files=collect(root);assert.deepEqual(files.map(f=>f.name).sort(),['.local/campaign-slices/slice/operator.lock','.local/campaign-slices/slice/send_start.json']);
  assert.throws(()=>collect(root,{maxFiles:1}),/JOURNAL_LIMIT/);assert.throws(()=>collect(root,{maxBytes:1}),/JOURNAL_LIMIT/);
 }finally{assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep+'lead-journal-test-'));fs.rmSync(root,{recursive:true,force:true});}
});
