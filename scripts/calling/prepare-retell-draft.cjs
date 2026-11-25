'use strict';
// Local configuration artifact only. No API client, credentials or network calls.
const fs=require('node:fs'),path=require('node:path');
function build(){
 const prompt=fs.readFileSync(path.join(__dirname,'AGENT_PROMPT.md'),'utf8')
  .replace(/^#[^\n]*\r?\n\r?\n/,'').split('\nSetup note:')[0].trim();
 if(!prompt.includes('{{approved_call_brief}}'))throw Error('DYNAMIC_BRIEF_VARIABLE_REQUIRED');
 return {
  status:'local_draft_not_created_in_retell',
  workspace:{name:'lead-calling-agent',account_email:'anjumfah675@gmail.com',retell_workspace_id:'org_Xbake1BZqTeDM7t8',url:'https://dashboard.retellai.com/org_Xbake1BZqTeDM7t8/home'},
  internal_org_id:null,
  requests:[
   {method:'POST',url:'https://api.retellai.com/create-retell-llm',body:{start_speaker:'agent',general_prompt:prompt,
    general_tools:[{type:'end_call',name:'end_call',description:'End politely after the brief conversation, opt-out, wrong person or unavailable tools.'}]}},
   {method:'POST',url:'https://api.retellai.com/create-agent',body:{agent_name:'lead-calling-agent-US-English',
    response_engine:{type:'retell-llm',llm_id:'REPLACE_WITH_CREATED_LLM_ID'},voice_id:'REPLACE_WITH_VERIFIED_VOICE_ID',language:'en-US',max_call_duration_ms:60000}}
  ],
  references:['https://docs.retellai.com/api-references/create-retell-llm','https://docs.retellai.com/api-references/create-agent'],
  limitations:['API request drafts, NOT a verified dashboard-import format. Do not submit with placeholder IDs.',
   'Model and voice selection, workspace access, agent creation and billing remain UNVERIFIED.',
   'Calendar and opt-out tools need authenticated existing ingress or separately approved integration; no endpoints are invented.',
   'No number binding, publishing, calling, deployment or activation is performed.']
 };
}
if(require.main===module){const output=path.resolve(__dirname,'../../documentation/calling-retell-draft.json');fs.writeFileSync(output,JSON.stringify(build(),null,2)+'\n');console.log('Prepared local Retell request drafts; no provider requests made.');}
module.exports={build};
