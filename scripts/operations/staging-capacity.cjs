'use strict';
const os=require('node:os'),fs=require('node:fs');
function diskFree(){try{const s=fs.statfsSync(process.cwd());return s.bavail*s.bsize;}catch{return NaN;}}
function check({freeBytes=os.freemem(),requiredBytes=1536*1024*1024,freeDiskBytes=diskFree(),requiredDiskBytes=2048*1024*1024}={}){
 if([freeBytes,freeDiskBytes].some(v=>!Number.isFinite(v)||v<0)||[requiredBytes,requiredDiskBytes].some(v=>!Number.isFinite(v)||v<=0))throw Error('STAGING_CAPACITY_UNKNOWN');
 const result={available_memory_mb:Math.floor(freeBytes/1048576),required_memory_mb:Math.ceil(requiredBytes/1048576),available_disk_mb:Math.floor(freeDiskBytes/1048576),required_disk_mb:Math.ceil(requiredDiskBytes/1048576),ready:freeBytes>=requiredBytes&&freeDiskBytes>=requiredDiskBytes};
 if(!result.ready){const error=Error(freeBytes<requiredBytes?'STAGING_REQUIRES_MORE_FREE_MEMORY':'STAGING_REQUIRES_MORE_DISK_SPACE');error.capacity=result;throw error;}return result;
}
if(require.main===module){try{console.log(JSON.stringify(check()));}catch(e){console.error(JSON.stringify({error:e.message,...e.capacity}));process.exitCode=1;}}
module.exports={check};
