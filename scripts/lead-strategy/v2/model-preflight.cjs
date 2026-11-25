'use strict';
// Run INSIDE n8n. One token-free native HTTP GET; key never leaves environment.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const dir='/tmp/strategy-model-preflight-'+Date.now();fs.mkdirSync(dir,{recursive:true,mode:0o700});
const w={id:'strategyModelPreflight',name:'Token-free model availability',active:false,settings:{executionOrder:'v1',saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false},nodes:[
 {id:'manual',name:'Manual',type:'n8n-nodes-base.manualTrigger',typeVersion:1,position:[0,0],parameters:{}},
 {id:'models',name:'List Models',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[200,0],retryOnFail:false,onError:'continueRegularOutput',parameters:{method:'GET',url:'https://api.groq.com/openai/v1/models',sendHeaders:true,headerParameters:{parameters:[{name:'Authorization',value:"={{ 'Bearer '+$env.GROQ_API_KEY }}"}]},options:{timeout:15000,response:{response:{fullResponse:true,neverError:true,responseFormat:'json'}}}}},
 {id:'check',name:'Safe Result',type:'n8n-nodes-base.code',typeVersion:2,position:[400,0],parameters:{mode:'runOnceForAllItems',jsCode:"const x=$input.first().json;const ids=Array.isArray(x.body?.data)?x.body.data.map(m=>m.id):[];const raw=[x.error?.code,x.error?.cause?.code,x.code].filter(v=>typeof v==='string');return [{json:{http_status:Number.isInteger(x.statusCode)?x.statusCode:null,model_available:ids.includes('openai/gpt-oss-120b'),error_classes:raw.filter(v=>['ETIMEDOUT','ENETUNREACH','ECONNRESET','EAI_AGAIN','ENOTFOUND','ECONNREFUSED','CERT_HAS_EXPIRED'].includes(v)),provider_requests:1,model_calls:0}}];"}}
],connections:{Manual:{main:[[{node:'List Models',type:'main',index:0}]]},'List Models':{main:[[{node:'Safe Result',type:'main',index:0}]]}}};
assert(process.env.GROQ_API_KEY,'MODEL_KEY_REQUIRED');fs.writeFileSync(dir+'/workflow.json',JSON.stringify(w),{mode:0o600});
const env={...process.env,DB_TYPE:'sqlite',N8N_USER_FOLDER:dir,N8N_ENCRYPTION_KEY:'isolated-preflight-no-credentials',N8N_DIAGNOSTICS_ENABLED:'false',N8N_VERSION_NOTIFICATIONS_ENABLED:'false',N8N_PERSONALIZATION_ENABLED:'false',N8N_RUNNERS_ENABLED:'false'};
function cli(args){const r=cp.spawnSync('n8n',args,{env,encoding:'utf8',timeout:90000,maxBuffer:20000000});if(r.status!==0)throw Error('TOKEN_FREE_NATIVE_CHECK_UNCONFIRMED');return r.stdout;}
cli(['import:workflow','--input='+dir+'/workflow.json']);const raw=cli(['execute','--id='+w.id,'--rawOutput']);let result;
for(let i=0;i<raw.length;i++)if(raw[i]==='{')try{const r=JSON.parse(raw.slice(i,raw.lastIndexOf('}')+1)),data=r.data?.resultData||r.resultData;result=data?.runData?.['Safe Result']?.[0]?.data?.main?.[0]?.[0]?.json;if(result)break;}catch{}
assert(result,'TOKEN_FREE_RESULT_MISSING');console.log(JSON.stringify(result));
