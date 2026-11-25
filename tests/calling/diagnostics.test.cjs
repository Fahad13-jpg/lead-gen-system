'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{calendarDiagnostic}=require('../../scripts/calling/tool-worker.cjs');
test('Calendar error classification exposes fixed codes without raw provider text',()=>{
 for(const[e,code]of [[{message:'invalid_grant SECRET'},'calendar_reauthorization_required'],[{description:'The provided authorization grant is invalid SECRET'},'calendar_reauthorization_required'],[{message:'Credentials not found SECRET'},'calendar_credential_unavailable'],[{message:'context.helpers.requestOAuth2 is not a function SECRET'},'calendar_runtime_unavailable'],[{code:'ETIMEDOUT',message:'SECRET'},'calendar_network_unavailable'],[{httpCode:'403',message:'SECRET'},'calendar_access_denied'],[{message:'SECRET'},'calendar_backend_unavailable']]){assert.equal(calendarDiagnostic(e),code);assert(!calendarDiagnostic(e).includes('SECRET'));}
});
