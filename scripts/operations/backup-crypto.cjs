'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const{pipeline}=require('node:stream/promises'),{Writable}=require('node:stream');
const magic=Buffer.from('LGBK0001');
function keyFile(file){const key=fs.readFileSync(file);if(key.length!==32)throw Error('BACKUP_KEY_INVALID');return key;}
async function encrypt(input,file,key){
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(magic);
 const out=fs.createWriteStream(file,{flags:'wx',mode:0o600});out.write(Buffer.concat([magic,iv,Buffer.alloc(16)]));
 await pipeline(input,cipher,out);
 const handle=await fs.promises.open(file,'r+');try{await handle.write(cipher.getAuthTag(),0,16,20);}finally{await handle.close();}
}
async function decrypt(file,key,output){
 const handle=await fs.promises.open(file,'r');const header=Buffer.alloc(36);let size;
 try{if((await handle.read(header,0,36,0)).bytesRead!==36||!header.subarray(0,8).equals(magic))throw Error('BACKUP_FORMAT_INVALID');size=(await handle.stat()).size;}finally{await handle.close();}
 if(size<36)throw Error('BACKUP_FORMAT_INVALID');
 const cipher=crypto.createDecipheriv('aes-256-gcm',key,header.subarray(8,20));cipher.setAAD(magic);cipher.setAuthTag(header.subarray(20,36));
 await pipeline(fs.createReadStream(file,{start:36}),cipher,output);
}
async function verify(file,key){let bytes=0;const digest=crypto.createHash('sha256');await decrypt(file,key,new Writable({write(data,enc,next){bytes+=data.length;digest.update(data);next();}}));return{bytes,sha256:digest.digest('hex')};}
async function readSmall(file,key){const chunks=[];let bytes=0;await decrypt(file,key,new Writable({write(data,enc,next){bytes+=data.length;if(bytes>1048576)return next(Error('BACKUP_MANIFEST_TOO_LARGE'));chunks.push(data);next();}}));return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
module.exports={keyFile,encrypt,decrypt,verify,readSmall};
