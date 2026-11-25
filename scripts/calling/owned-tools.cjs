'use strict';
// Trusted workflow deployment scope. Model input cannot choose an org or credential.
function configPath(id='legacy'){
 if(id==='legacy')return'/home/node/.n8n/calling-tools-private.json';
 if(typeof id!=='string'||!/^[a-f0-9]{32}$/.test(id))throw Error('TOOL_BACKEND_SCOPE_INVALID');
 return'/home/node/.n8n/calling-tool-backends/'+id+'.json';
}
function resolve(config,row,open){
 if(!Number.isSafeInteger(config?.org_id)||config.org_id<=0)throw Error('TOOL_BACKEND_SCOPE_INVALID');
 if(!row)return{...config,account_bound:false};
 if(row.org_id!==config.org_id||row.state!=='pending_setup'||!Number.isInteger(row.version)||row.version<1||row.agent_id!==config.agent_id||row.agent_version!==config.agent_version)throw Error('TOOL_ACCOUNT_BINDING_CHANGED');
 const secret=open(row.org_id,row.secrets);if(typeof secret?.api_key!=='string'||!secret.api_key||/[\s\p{Cc}\p{Cf}]/u.test(secret.api_key))throw Error('TOOL_ACCOUNT_BINDING_CHANGED');
 return{...config,retell_key:secret.api_key,connection_ref:`byok-retell-${row.org_id}-v${row.version}`,account_bound:true,account_version:row.version};
}
function publicScope(c){return{org_id:c.org_id,connection_ref:c.connection_ref,agent_id:c.agent_id,agent_version:c.agent_version,account_bound:c.account_bound===true,account_version:c.account_version||null};}
module.exports={configPath,resolve,publicScope};
