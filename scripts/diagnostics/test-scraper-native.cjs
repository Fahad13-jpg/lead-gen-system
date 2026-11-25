'use strict';
// Same-image native expression/error-output probe. Isolated SQLite; no credentials,
// database/provider/HTTP nodes and no network. Never executes the production scraper.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const stamp=Date.now(),dir=path.resolve('.local/scraper-native-'+stamp),container='lead_scraper_probe_'+stamp;
function docker(args){const r=cp.spawnSync('docker',args,{encoding:'utf8',timeout:120000,maxBuffer:20000000});if(r.status!==0){if(fs.existsSync(dir))fs.writeFileSync(dir+'/private-failure.txt',(r.stdout||'')+'\n'+(r.stderr||''));throw Error('NATIVE_PROBE_UNCONFIRMED: '+args[0]);}return r.stdout;}
const source=JSON.parse(fs.readFileSync('workflows/03_google_maps_scraper.json'));
function fixture(kind){const nodes=[],connections={};
 const add=(name,type,parameters)=>{nodes.push({id:name.replace(/ /g,''),name,type:'n8n-nodes-base.'+type,typeVersion:type==='code'?2:1,position:[nodes.length*200,0],parameters});};
 const code=(name,jsCode)=>add(name,'code',{mode:'runOnceForAllItems',jsCode});
 const edge=(a,b,index=0)=>{connections[a]||={main:[]};while(connections[a].main.length<=index)connections[a].main.push([]);connections[a].main[index].push({node:b,type:'main',index:0});};
 add('Manual','manualTrigger',{});code('Prepare Actor','return [{json:{id:7,org_id:2}}];');edge('Manual','Prepare Actor');
 if(kind==='heartbeat_lost'){code('Parse Status','return [{json:{job_id:7,org_id:2,status:"RUNNING"}}];');code('Heartbeat','return [{json:{}}];');nodes.push(structuredClone(source.nodes.find(n=>n.name==='Current Worker State')));edge('Prepare Actor','Parse Status');edge('Parse Status','Heartbeat');edge('Heartbeat','Current Worker State');edge('Current Worker State','Success');edge('Current Worker State','Format Failure',1);}
 else{code('Save Run',kind==='save_lost'?'return [{json:{}}];':'return [{json:{id:7}}];');nodes.push(structuredClone(source.nodes.find(n=>n.name==='Validate Saved Run Ownership')));nodes.push(structuredClone(source.nodes.find(n=>n.name==='Wait Before Poll')));edge('Prepare Actor','Save Run');edge('Save Run','Validate Saved Run Ownership');edge('Validate Saved Run Ownership','Wait Before Poll');edge('Validate Saved Run Ownership','Format Failure',1);edge('Wait Before Poll','Success');edge('Wait Before Poll','Format Failure',1);}
 nodes.push(structuredClone(source.nodes.find(n=>n.name==='Format Failure')));
 code('Success',kind==='valid_save'?'return [{json:{pass:true,kind:"valid_save"}}];':'throw Error("LOST_OWNERSHIP_CONTINUED");');
 code('Assert Failure',kind==='valid_save'?'throw Error("VALID_OWNERSHIP_REJECTED");':'const x=$input.first().json;if(x.job_id!==7||x.org_id!==2||x.code!=="GATHERING_STEP_FAILED")throw Error("BAD_FAILURE_CONTEXT");return [{json:{pass:true,kind:"'+kind+'"}}];');edge('Format Failure','Assert Failure');
 return{id:'probe'+kind.replace(/_/g,''),name:'Offline scraper '+kind,active:false,nodes,connections,settings:{executionOrder:'v1'}};
}
function parse(raw){for(let i=0;i<raw.length;i++)if(raw[i]==='{')try{const r=JSON.parse(raw.slice(i,raw.lastIndexOf('}')+1));const data=r.data?.resultData||r.resultData;if(data)return data;}catch{}throw Error('NATIVE_RESULT_MISSING');}
try{fs.mkdirSync(dir,{recursive:true});const image=docker(['inspect','n8n','--format','{{.Image}}']).trim();assert(/^sha256:[a-f0-9]{64}$/.test(image));
 docker(['create','--name',container,'--network','none','--label','codex.scratch=scraper-native','--entrypoint','sh','-e','DB_TYPE=sqlite','-e','N8N_USER_FOLDER=/tmp/scraper-probe','-e','N8N_DIAGNOSTICS_ENABLED=false','-e','N8N_VERSION_NOTIFICATIONS_ENABLED=false','-e','N8N_RUNNERS_ENABLED=false',image,'-c','sleep 300']);docker(['start',container]);
 const results=[];for(const kind of ['save_lost','heartbeat_lost','valid_save']){const w=fixture(kind),file=dir+'/'+kind+'.json';fs.writeFileSync(file,JSON.stringify(w));docker(['cp',file,container+':/tmp/'+kind+'.json']);docker(['exec',container,'n8n','import:workflow','--input=/tmp/'+kind+'.json']);
  const raw=docker(['exec',container,'n8n','execute','--id='+w.id,'--rawOutput']);fs.writeFileSync(dir+'/'+kind+'-raw.txt',raw);const data=parse(raw),name=kind==='valid_save'?'Success':'Assert Failure',value=data.runData?.[name]?.[0]?.data?.main?.[0]?.[0]?.json;
  assert(!data.error&&value?.pass===true&&value.kind===kind,'NATIVE_GUARD_FAILED:'+kind);if(kind==='valid_save')assert(data.runData?.['Wait Before Poll']?.[0]?.executionTime>=14000,'NATIVE_WAIT_DID_NOT_WAIT');results.push(value);
 }
 const report={passed:true,cases:results,network:'none',credentials_copied:0,provider_calls:0,live_workflows_executed:0,report_directory:dir};fs.writeFileSync(dir+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{cp.spawnSync('docker',['stop','--time','5',container],{stdio:'ignore',timeout:20000});}
