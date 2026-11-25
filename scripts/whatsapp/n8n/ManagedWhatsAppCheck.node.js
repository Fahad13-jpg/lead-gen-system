'use strict';
class ManagedWhatsAppCheck {
 constructor(){this.description={displayName:'Managed WhatsApp Connection Check',name:'managedWhatsAppCheck',group:['transform'],version:1,description:'Read-only operator-scoped Meta account and sender check',defaults:{name:'Managed WhatsApp Connection Check'},inputs:['main'],outputs:['main'],credentials:[{name:'whatsAppApi',required:true}],properties:[{displayName:'Organization Binding',name:'binding',type:'json',default:'{"org_id":0,"connection_id":"configure-me","credential_ref":"configure-me","phone_number_id":"configure-me","waba_id":"configure-me","api_version":null}'},{displayName:'Operator Confirms Credential Ownership',name:'operatorConfirmed',type:'boolean',default:false,description:'Local operator setup only; does not authenticate dashboard customers or authorize sending'}]};}
 async execute(){try{return [[{json:await require('./lead-system/scripts/whatsapp/n8n-check.cjs').run(this)}]];}catch{throw Error('WHATSAPP_CONNECTION_CHECK_FAILED; private provider and credential details suppressed');}}
}
module.exports={ManagedWhatsAppCheck};
