'use strict';
// Website reads only: no database, provider verification, form submission or outreach.
const fs=require('node:fs');
const {discover}=require('./worker.cjs');
const sites=['https://ziadentalconsultants.me/','https://www.allproplumbingchicago.com/'];
(async()=>{
 const report=[];
 for(const source_value of sites){const started=Date.now();const result=await discover({source_value});report.push({site:source_value,elapsed_ms:Date.now()-started,...result});}
 fs.mkdirSync('.local/contact-deploy',{recursive:true});
 fs.writeFileSync('.local/contact-deploy/discovery-diagnostics.json',JSON.stringify({checked_at:new Date().toISOString(),report},null,2));
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
