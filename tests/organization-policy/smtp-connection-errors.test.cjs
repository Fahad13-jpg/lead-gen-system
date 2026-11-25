'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {safeConnectionError,bounded}=require('../../scripts/sender-connections/clients.cjs');
test('connection diagnostics preserve safe classes and never provider messages',()=>{
 for(const [input,code] of [[{code:'ECONNRESET'},'ECONNRESET'],[{source:'authentication'},'EAUTH'],[{source:'timeout-auth'},'IMAP_AUTH_TIMEOUT'],[{code:'secret'},'IMAP_CONNECTION_FAILED']]){
  const e=safeConnectionError({...input,message:'secret password'});assert.equal(e.code,code);assert.equal(e.message,'SENDER_CONNECTION_FAILED');assert(!e.stack.includes('secret password'));
 }
});
test('operation deadline has a timeout code and aborts once',async()=>{let aborts=0;await assert.rejects(bounded(new Promise(()=>{}),5,()=>aborts++),e=>e.code==='ETIMEDOUT');assert.equal(aborts,1);});
