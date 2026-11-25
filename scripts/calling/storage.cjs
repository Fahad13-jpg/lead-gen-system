'use strict';
// Trusted backend only; no HTTP endpoint and no provider connection.
const operations=new Set(['outreach_call_reserve','outreach_call_cancel_reserved','outreach_call_observe','outreach_call_settle','outreach_call_uncertain','outreach_call_stop','outreach_call_booking','outreach_call_tool_context','outreach_call_result','outreach_call_ingest']);
function query(operation,payload){
 if(!operations.has(operation))throw Error('CALL_STORAGE_OPERATION_INVALID');
 if(!Number.isSafeInteger(payload?.org_id)||payload.org_id<=0)throw Error('ORG_REQUIRED');
 return `SELECT ${operation}('${JSON.stringify(payload).replace(/'/g,"''")}'::jsonb) AS result`;
}
async function reserve(payload,deps){
 // This adapter intentionally cannot supply reserveAndBegin to the executor.
 const result=await deps.executeQuery(query('outreach_call_reserve',payload));
 if(result?.execution_authorized!==false)throw Error('UNEXPECTED_TRANSPORT_AUTHORITY');
 return result;
}
module.exports={query,reserve};
