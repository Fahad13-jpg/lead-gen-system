'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),random=require('node:crypto');
const{Readable}=require('node:stream');const{encrypt,verify,readSmall}=require('../../scripts/operations/backup-crypto.cjs');
test('encrypted backups authenticate data, reject another key and detect tampering',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lead-backup-test-')),key=random.randomBytes(32),file=path.join(dir,'fixture.lgb'),data=JSON.stringify({fixture:'PRIVATE_RECOVERY_DATA'});
 try{await encrypt(Readable.from([data]),file,key);assert(!fs.readFileSync(file).includes(Buffer.from('PRIVATE_RECOVERY_DATA')));assert.equal((await verify(file,key)).bytes,Buffer.byteLength(data));assert.deepEqual(await readSmall(file,key),JSON.parse(data));await assert.rejects(verify(file,random.randomBytes(32)));await assert.rejects(encrypt(Readable.from(['overwrite']),file,key));
 const bytes=fs.readFileSync(file);bytes[bytes.length-1]^=1;fs.writeFileSync(file,bytes);await assert.rejects(verify(file,key));
 }finally{assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'lead-backup-test-'));fs.rmSync(dir,{recursive:true,force:true});}
});
