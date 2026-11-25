'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {basic}=require('./worker.cjs');
(async()=>{
 const source=JSON.parse(fs.readFileSync('.local/clinic-benchmark/baseline.json'));
 const results=[];
 for(const row of source.results){
  const pages=new Map(row.snapshots.map(p=>[p.request_url,p]));
  const result=await basic({lead:row.lead},async url=>{
   const page=pages.get(url);assert(page,'Missing saved page: '+url);
   if(page.error)throw Object.assign(Error(page.error),{code:page.error});return page.response;
  });
  if(row.lead.id===167){assert.equal(result.services.length,0);assert.equal(result.observations.booking_link,'not_observed');}
  if(row.lead.id===449)assert.equal(result.observations.contact_form,'observed');
  results.push({id:row.lead.id,before:row.basic,after:result});
 }
 fs.writeFileSync('.local/clinic-benchmark/replayed.json',JSON.stringify({checked_at:new Date().toISOString(),network_requests:0,results},null,2));
 console.log('PASS saved-page replay: irrelevant clinic services removed, placeholder bookings rejected and real appointment form recognized. No network requests.');
 for(const row of results.filter(r=>[167,449].includes(r.id)))console.log(JSON.stringify({id:row.id,services:row.after.services.length,observations:row.after.observations}));
})().catch(e=>{console.error(e);process.exitCode=1;});
