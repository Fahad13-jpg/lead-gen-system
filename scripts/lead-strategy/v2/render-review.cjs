'use strict';
// Offline only. Optional --responses <JSON> loads locally saved provider-shaped responses.
const fs=require('node:fs'),path=require('node:path');
const c=require('./contract.cjs'),{generate}=require('./provider.cjs'),{benchmarks,mockReply,syntheticReadiness}=require('./fixtures.cjs');
const esc=s=>String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const out=path.resolve(__dirname,'../../../documentation/strategy-contract-v2');
function authoredMock(prepared,id){
 const o=c.template(prepared);
 o.fit_notes=[id===167?'The deterministic assessment flags an unfinished template; confirm relevance with the business.':id===449?'Existing site evidence supports a weak website offer fit; avoid asserting a need to replace it.':'The stored listing does not establish website absence. Ask about relevance without asserting a missing website.'];
 if(o.followups.length)o.followups[0].intent='Offer one approved demonstration only if the prospect expresses interest; stop after opt-out.';
 return o;
}
async function render(){
 fs.mkdirSync(out,{recursive:true});
 const index=process.argv.indexOf('--responses');
 const supplied=index>=0?JSON.parse(fs.readFileSync(process.argv[index+1],'utf8')):null;
 const records=[],key=[],sections=[];
 for(const x of await benchmarks()){
  if(supplied&&!supplied[x.id])throw Error('MISSING_LOCAL_RESPONSE:'+x.id);
  const original=c.build(x.input,{now:'2026-10-12T00:00:00Z'});
  const p=c.build(x.input,{now:'2026-10-12T00:00:00Z',readinessSnapshot:syntheticReadiness});
  const mock=authoredMock(p,x.id);
  const operation={lease:'OFFLINE_SYNTHETIC',reservation:'OFFLINE_SYNTHETIC',fingerprint:p.input_hash,lease_expires_at:Date.now()+60000};
  const ai=await generate(p,{mocked:!supplied,operation,gate:()=>true,transport:async()=>supplied?.[x.id]||mockReply(mock)});
  const template=await generate(p,{mode:'template'});
  const blocked=await generate(original,{mocked:true,operation:{...operation,fingerprint:original.input_hash},gate:()=>true,transport:async()=>mockReply(authoredMock(original,x.id))});
  const record={lead_id:x.id,name:x.input.lead.company_name,evidence:'Historical stored fixtures; no fresh verification.',permissions:'Draft examples use synthetic ready WhatsApp/call gates. Actual current gates remain blocked.',fixture_expected_fit_original:x.expected_fit,current_fixture_fit:p.brief.qualifier.fit,token_estimates:p.token_estimate,mock_usage_warning:'Reported response usage is fabricated fixture data, not measured tokens.',brief:p.brief,real_gate_brief:original.brief,real_gate_mock_plan:blocked,template_plan:template,ai_plan:ai};
  records.push(record);fs.writeFileSync(path.join(out,'lead-'+x.id+'.json'),JSON.stringify(record,null,2)+'\n');
  const swap=parseInt(c.hash({id:x.id,seed:'blind-v2'}).slice(0,2),16)%2;
  const columns=swap?[ai,template]:[template,ai];key.push({lead_id:x.id,A:swap?'mock_ai':'template',B:swap?'template':'mock_ai'});
  const card=(plan,label)=>`<article><h3>${label}</h3><p>Fit: ${esc(plan.qualification.fit)}</p><pre>${esc(JSON.stringify(plan.strategy,null,2))}</pre><label>Human rating / notes (unscored)<textarea rows="5"></textarea></label></article>`;
  sections.push(`<section><h2>${x.id} — ${esc(x.input.lead.company_name)}</h2><div class="pair">${columns.map((v,i)=>card(v,i?'B':'A')).join('')}</div></section>`);
 }
 fs.writeFileSync(path.join(out,'output.schema.json'),JSON.stringify(c.schema,null,2)+'\n');
 fs.writeFileSync(path.join(out,'prompt.txt'),c.prompt+'\n');
 fs.writeFileSync(path.join(out,'blind-key.json'),JSON.stringify(key,null,2)+'\n');
 fs.writeFileSync(path.join(out,'token-estimates.json'),JSON.stringify(records.map(r=>({lead_id:r.lead_id,...r.token_estimates})),null,2)+'\n');
 fs.writeFileSync(path.join(out,'blind-review.html'),`<!doctype html><meta charset="utf-8"><title>Strategy v2 offline blind review</title><style>body{font:16px system-ui;margin:32px;max-width:1500px} .pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}article{border:1px solid #ccc;padding:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}textarea{width:95%}@media(max-width:750px){.pair{grid-template-columns:1fr}}</style><h1>Strategy v2: blind contract review</h1><p>MOCKED responses and synthetic channel permissions. No real AI quality claim, no sends, no ratings assigned. Use RATING-RUBRIC.md. Ratings entered here are not saved; print or copy your notes. Answer key is a separate file.</p>${sections.join('\n')}`);
 console.log(JSON.stringify({output:out,samples:records.map(r=>({lead_id:r.lead_id,fit:r.current_fixture_fit,state:r.ai_plan.state,...r.token_estimates}))},null,2));
}
if(require.main===module)render().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={render,authoredMock};
