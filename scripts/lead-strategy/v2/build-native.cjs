'use strict';
// Refreshes embedded runtime and v2 generation/preview bodies. No import/deploy/activation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {strategyRuntime}=require('../runtime.cjs');
const file='workflows/06C_outreach_strategy_generator.json';
function bundle(){
 const modules=['schema','quality','contract','native','response-format','email-readiness','sender-policy','legacy-evidence','draft-release','messenger'].map(name=>JSON.stringify('./'+name+'.cjs')+':function(module,exports,require){\n'+fs.readFileSync(path.join(__dirname,name+'.cjs'),'utf8').replace(/\b__dirname\b/g,"''")+'\n}');
 for(const name of ['customer-plan','customer-email-template'])modules.push(JSON.stringify('../../organization-policy/'+name+'.cjs')+':function(module,exports,require){\n'+fs.readFileSync(path.join(__dirname,'../../organization-policy',name+'.cjs'),'utf8')+'\n}');
 modules.push(JSON.stringify('../../calling/strategy-handoff.cjs')+':function(module,exports,require){\n'+fs.readFileSync(path.join(__dirname,'../../calling/strategy-handoff.cjs'),'utf8')+'\n}');
 modules.push(JSON.stringify('../../linkedin-manual/core.cjs')+':function(module,exports,require){\n'+fs.readFileSync(path.join(__dirname,'../../linkedin-manual/core.cjs'),'utf8')+'\n}');
 modules.push(JSON.stringify('../../whatsapp/core.cjs')+':function(module,exports,require){\n'+fs.readFileSync(path.join(__dirname,'../../whatsapp/core.cjs'),'utf8')+'\n}');
 modules.push(JSON.stringify('./sequence.cjs')+':function(module,exports,require){\n'+fs.readFileSync(path.join(__dirname,'../../whatsapp/sequence.cjs'),'utf8').replace("require('./core.cjs')","require('../../whatsapp/core.cjs')")+'\n}');
 modules.push(JSON.stringify('./sms.cjs')+':function(module,exports,require){\n'+fs.readFileSync(path.join(__dirname,'../../sms/core.cjs'),'utf8')+'\n}');
 const prompt=JSON.stringify(fs.readFileSync(path.join(__dirname,'prompt.txt'),'utf8'));
 return `const getNativeV2=()=>{const modules={${modules.join(',')}};const cache={};function load(id){if(id==='./customer-email-template.cjs')id='../../organization-policy/customer-email-template.cjs';if(id==='../lead-strategy/v2/contract.cjs')id='./contract.cjs';if(id==='../runtime.cjs'||id==='../lead-strategy/runtime.cjs')return rt;if(id==='node:crypto')return require('crypto');if(id==='node:fs')return {readFileSync:()=>${prompt}};if(id==='node:path')return {join:()=>''};if(cache[id])return cache[id].exports;if(!modules[id])throw Error('UNKNOWN_V2_MODULE');const module={exports:{}};cache[id]=module;modules[id](module,module.exports,load);return module.exports;}return load('./native.cjs');};`;
}
function build(){
 const w=JSON.parse(fs.readFileSync(file,'utf8')),before=structuredClone(w);
 // Refresh the embedded shared runtime only; retain each node's routing tail.
 for(const n of w.nodes){const code=n.parameters?.jsCode;if(typeof code==='string'&&code.startsWith('const rt=(')){
  const end=code.indexOf('})();')+5;assert(end>5);n.parameters.jsCode='const rt=('+strategyRuntime.toString()+')();'+code.slice(end);
 }}
 const marker='/* STRATEGY_V2_OPT_IN */';
 for(const name of ['Prepare Strategy','Validate and Assemble Draft','Build Preview']){
  const n=w.nodes.find(n=>n.name===name);assert(n?.parameters?.mode==='runOnceForEachItem');
  const existing=n.parameters.jsCode;const start=existing.indexOf(marker);
  const legacy=start<0?existing:existing.slice(0,start)+Buffer.from(existing.match(/\/\* LEGACY_TAIL_BASE64:([A-Za-z0-9+/=]+) \*\//)[1],'base64').toString('utf8');
  const boundary=legacy.indexOf('})();')+5;assert(boundary>5);
  const prefix=legacy.slice(0,boundary),tail=legacy.slice(boundary);
  const branch=name==='Build Preview'?"if($env.STRATEGY_CONTRACT_VERSION==='strategy_v2')return getNativeV2().preview($json.result,{emailSenderSnapshot:$json.email_sender_snapshot,linkedinManualEnabled:$env.LINKEDIN_MANUAL_ENABLED==='true'});":name==='Prepare Strategy'?"if($env.STRATEGY_CONTRACT_VERSION==='strategy_v2')return getNativeV2().prepare($json,{hasKey:!!$env.GROQ_API_KEY,customerTemplatesEnabled:$env.CUSTOMER_EMAIL_TEMPLATES_ENABLED==='true'||$json.operator_controls?.customer_templates===true,callingIntegrationEnabled:$env.CALLING_INTEGRATION_ENABLED==='true',linkedinManualEnabled:$env.LINKEDIN_MANUAL_ENABLED==='true',whatsappIntegrationEnabled:$env.WHATSAPP_INTEGRATION_ENABLED==='true',draftReviewEnabled:$env.STRATEGY_DRAFT_REVIEW_ENABLED==='true'||$json.operator_controls?.native_email_review===true});":"if($('Prepare Strategy').item.json.contract_version==='strategy_v2')return getNativeV2().assemble($('Prepare Strategy').item.json,$json);";
  n.parameters.jsCode=prefix+marker+bundle()+branch+tail+'\n/* LEGACY_TAIL_BASE64:'+Buffer.from(tail).toString('base64')+' */';
 }
 assert.deepEqual(w.connections,before.connections);
 for(const n of w.nodes){const old=before.nodes.find(v=>v.id===n.id);if(!['Prepare Strategy','Validate and Assemble Draft','Build Preview'].includes(n.name)&&old.parameters?.jsCode?.startsWith('const rt=(')){
  assert.equal(n.parameters.jsCode.slice(n.parameters.jsCode.indexOf('})();')+5),old.parameters.jsCode.slice(old.parameters.jsCode.indexOf('})();')+5),'Node routing tail changed: '+n.name);
 }}
 const strip=o=>{o=structuredClone(o);for(const n of o.nodes)if(n.parameters?.jsCode?.startsWith('const rt=('))delete n.parameters.jsCode;return o;};assert.deepEqual(strip(w),strip(before));
 const temporary=file+'.build.tmp';
 try{fs.writeFileSync(temporary,JSON.stringify(w,null,2)+'\n');JSON.parse(fs.readFileSync(temporary,'utf8'));fs.renameSync(temporary,file);}catch(error){try{fs.unlinkSync(temporary);}catch{}throw error;}
 console.log('Updated shared runtime and v2 generation/preview bodies; routing tails, graph, modes, notes and non-Code settings preserved. V1 default; v2 requires explicit opt-in.');
}
if(require.main===module)build();module.exports={bundle,build};
