'use strict';
class ManagedGmailCheck{
 constructor(){this.description={displayName:'Managed Gmail Check',name:'managedGmailCheck',group:['transform'],version:1,description:'Check a pending organization Gmail connection without sending',defaults:{name:'Managed Gmail Check'},inputs:['main'],outputs:['main'],credentials:[{name:'postgres',required:true},{name:'gmailOAuth2',required:true}],properties:[{displayName:'Organization Binding',name:'binding',type:'json',default:'{"org_id":1,"connection_id":"configure-me"}'}]};}
 async execute(){try{return [[{json:await require('./lead-system/scripts/sender-connections/gmail-check.cjs').run(this)}]];}catch{throw Error('MANAGED_GMAIL_CHECK_UNCONFIRMED');}}
}
module.exports={ManagedGmailCheck};
