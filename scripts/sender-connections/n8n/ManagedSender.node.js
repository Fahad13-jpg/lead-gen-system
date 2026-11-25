'use strict';
class ManagedSender {
 constructor(){this.description={displayName:'Managed SMTP Sender',name:'managedSender',group:['transform'],version:1,description:'Organization-bound SMTP dispatch and read-only reply polling',defaults:{name:'Managed SMTP Sender'},inputs:['main'],outputs:['main'],credentials:[{name:'postgres',required:true},{name:'smtp',required:true},{name:'imap',required:true}],properties:[{displayName:'Operation',name:'operation',type:'options',options:[{name:'Check Connection (No Sending)',value:'check'},{name:'Dispatch Approved Emails',value:'send'},{name:'Poll Replies and Bounces',value:'poll'}],default:'check'},{displayName:'Organization Binding',name:'binding',type:'json',default:'{"org_id":1,"connection_id":"configure-me"}'},{displayName:'Bounded Release',name:'release',type:'json',default:'null',description:'Operator-approved plan/hash/recipient release; null blocks sending'}]};}
 async execute(){
  try{const result=await require('./lead-system/scripts/sender-connections/worker.cjs').run(this);return [[{json:result}]];}
  catch(error){
   const codes=['ETIMEDOUT','ECONNRESET','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','EAUTH','ESOCKET','IMAP_CONNECTION_FAILED','IMAP_AUTH_TIMEOUT','IMAP_CONNECT_TIMEOUT'];
   const reasons=['SENDER_CONNECTION_FAILED','CANONICAL_MAILBOX_REQUIRED','STRICT_TLS_REQUIRED','PUBLIC_IPV4_REQUIRED','CREDENTIAL_BINDING_MISMATCH','CONNECTION_DISABLED','CHECK_STALE'];
   const reason=codes.includes(error?.code)?error.code:reasons.includes(error?.message)?error.message:'UNCLASSIFIED';
   throw Error('MANAGED_SENDER_OPERATION_FAILED:'+reason+'; no automatic resend');
  }
 }
}
module.exports={ManagedSender};
