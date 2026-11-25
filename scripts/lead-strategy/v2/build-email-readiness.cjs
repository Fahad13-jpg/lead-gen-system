'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),{snapshot}=require('./email-readiness-sql.cjs');
function build(){
 const file='workflows/06C_outreach_strategy_generator.json',w=JSON.parse(fs.readFileSync(file)),before=structuredClone(w),marker='/* EMAIL_DRAFT_READINESS_V1 */';
 const claim=w.nodes.find(n=>n.name==='Claim Strategy Jobs'),preview=w.nodes.find(n=>n.name==='preview Database');
 if(!claim.parameters.query.includes(marker)){
  assert(claim.parameters.query.includes('jsonb_agg(value)'));
  claim.parameters.query=marker+'\n'+claim.parameters.query.replace('jsonb_agg(value)',`jsonb_agg(value||jsonb_build_object('email_sender_snapshot',${snapshot("(value->'input')")}))`);
 }
 if(!preview.parameters.query.includes(marker))preview.parameters.query=marker+`\nWITH email_context AS (${preview.parameters.query}) SELECT email_context.result,${snapshot('email_context.result')} AS email_sender_snapshot FROM email_context`;
 const strip=x=>{x=structuredClone(x);for(const n of x.nodes)if(['Claim Strategy Jobs','preview Database'].includes(n.name))delete n.parameters.query;return x;};
 assert.deepEqual(strip(w),strip(before));fs.writeFileSync(file,JSON.stringify(w,null,2)+'\n');
}
if(require.main===module)build();module.exports={build};
