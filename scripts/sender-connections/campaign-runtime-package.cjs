'use strict';
// Offline package only. Never copies into Docker or changes installed workflows.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
function build(out){
 const root=path.resolve('.local')+path.sep,target=path.resolve(out);assert(target.startsWith(root)&&!fs.existsSync(target),'NEW_LOCAL_DIRECTORY_REQUIRED');fs.mkdirSync(target,{recursive:true});const seen=new Set();
 function copy(file){file=path.normalize(file);assert(!file.startsWith('..')&&!path.isAbsolute(file),'REPOSITORY_SOURCE_REQUIRED');if(seen.has(file))return;seen.add(file);const source=fs.readFileSync(file,'utf8'),dest=path.join(target,'custom/campaign-system',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,source);for(const m of source.matchAll(/require\(['"](\.[^'"]+)['"]\)/g))copy(path.normalize(path.join(path.dirname(file),m[1])));}
 copy('scripts/sender-connections/campaign-worker.cjs');const node='scripts/sender-connections/n8n/ManagedCampaignSender.node.js';fs.copyFileSync(node,path.join(target,'custom/ManagedCampaignSender.node.js'));
 const manifest={format:'campaign_smtp_runtime_v1',installed:false,active:false,namespace:'campaign-system',legacy_namespace_unchanged:true,requires_migrations:['056_email_campaign_authority.sql','057_email_campaign_renewal.sql'],files:[...seen,node].map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}))};fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2));return{directory:target,files:manifest.files.length,installed:false,active:false};
}
module.exports={build};if(require.main===module){try{console.log(JSON.stringify(build(process.argv[2])));}catch{console.error('CAMPAIGN_RUNTIME_PACKAGE_STOPPED');process.exitCode=1;}}
