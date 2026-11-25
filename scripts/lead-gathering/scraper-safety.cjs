'use strict';
const rt=require('./runtime.cjs');
function validateBefore(nodes){
 if(!nodes.some(n=>n.name==='Start Apify Actor'))return;
 const normalize=s=>s.replace(/\r\n/g,'\n').trim();
 for(const [name,fn] of [['Parse Run',rt.parseStart],['Parse Status',rt.parseStatus],['Transform Results',rt.transformResults]]){
  const current=nodes.find(n=>n.name===name)?.parameters.jsCode;
  const next=`return (${fn.toString()})();`,previous=next.replace(/^.*APIFY_(?:START|STATUS|DATASET)_RESPONSE_UNCONFIRMED.*\n/gm,'');
  if(typeof current!=='string'||![normalize(next),normalize(previous)].includes(normalize(current)))throw Error('LIVE_SCRAPER_CODE_BASELINE_CHANGED:'+name);
 }
 const state=nodes.find(n=>n.name==='Current Worker State')?.parameters.jsCode;
 if(!["return {...$('Parse Status').first(0).json,...$input.first().json};",`return (${rt.currentWorkerState.toString()})();`].map(normalize).includes(normalize(state||'')))throw Error('LIVE_WORKER_STATE_BASELINE_CHANGED');
}
function install(nodes,connections){
 const apify=nodes.filter(n=>n.type.endsWith('.httpRequest')&&/api\.apify\.com/.test(n.parameters.url||''));if(!apify.length)return 0;
 for(const n of apify){n.parameters.options||={};n.parameters.options.response||={};n.parameters.options.response.response||={};n.parameters.options.response.response.neverError=true;
  if((n.parameters.method||'GET')==='GET'){n.retryOnFail=true;n.maxTries=3;n.waitBetweenTries=3000;}
  else if(n.name==='Start Apify Actor'&&n.retryOnFail)throw Error('PAID_START_RETRY_FORBIDDEN');
 }
 if(!nodes.some(n=>n.name==='Start Apify Actor'))return 1;
 for(const [name,fn] of [['Parse Run',rt.parseStart],['Parse Status',rt.parseStatus],['Transform Results',rt.transformResults],['Current Worker State',rt.currentWorkerState]]){
  const n=nodes.find(n=>n.name===name);if(!n?.type.endsWith('.code')||n.parameters.mode!==undefined&&n.parameters.mode!=='runOnceForAllItems')throw Error('SCRAPER_CODE_SHAPE_CHANGED');
  n.parameters.mode='runOnceForAllItems';n.parameters.jsCode=`return (${fn.toString()})();`;
 }
 for(const name of ['Save Run','Heartbeat']){const n=nodes.find(n=>n.name===name);if(!n?.type.endsWith('.postgres'))throw Error('SCRAPER_OWNERSHIP_SHAPE_CHANGED');n.alwaysOutputData=true;}
 const wait=nodes.find(n=>n.name==='Wait Before Poll');if(!wait?.type.endsWith('.wait'))throw Error('SCRAPER_WAIT_SHAPE_CHANGED');wait.parameters.amount=15;
 const name='Validate Saved Run Ownership';let check=nodes.find(n=>n.name===name);
 if(!check){check={id:require('node:crypto').createHash('sha256').update('gathering:'+name).digest('hex').slice(0,32),name,type:'n8n-nodes-base.code',typeVersion:2,position:[wait.position[0]-120,wait.position[1]+160],parameters:{mode:'runOnceForAllItems',jsCode:`return (${rt.validateSavedRun.toString()})();`},onError:'continueErrorOutput',notesInFlow:true,notes:'Require the saved-run UPDATE receipt before any poll. A stale worker must stop here; errors in Wait parameter expressions are not an ownership guard.'};nodes.push(check);}
 // Windows-generated workflow JSON can retain CRLF inside code strings. Compare
 // identical guard code across line endings without accepting other changes.
 if(typeof check.parameters.jsCode!=='string'||check.parameters.jsCode.replace(/\r\n/g,'\n')!==`return (${rt.validateSavedRun.toString()})();`.replace(/\r\n/g,'\n'))throw Error('SAVED_RUN_GUARD_CHANGED');
 const savedEdges=connections['Save Run']?.main?.[0];if(!savedEdges)throw Error('SAVE_RUN_CONNECTION_MISSING');
 for(const edge of savedEdges)if(edge.node==='Wait Before Poll')edge.node=name;
 connections[name]={main:[[{node:'Wait Before Poll',type:'main',index:0}],[{node:'Format Failure',type:'main',index:0}]]};
 // Retain every existing normal/error edge; add failure routes for the new guards.
 for(const name of ['Wait Before Poll','Current Worker State']){nodes.find(n=>n.name===name).onError='continueErrorOutput';
  connections[name]||={main:[]};connections[name].main||=[];while(connections[name].main.length<2)connections[name].main.push([]);
  if(!connections[name].main[1].some(e=>e.node==='Format Failure'))connections[name].main[1].push({node:'Format Failure',type:'main',index:0});
 }
 return 1;
}
module.exports={install,validateBefore};
