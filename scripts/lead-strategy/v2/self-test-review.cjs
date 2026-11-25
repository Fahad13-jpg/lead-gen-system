'use strict';
// Produces a concrete self-addressed review artifact, never a sending permission.
const crypto=require('crypto'),policy=require('./sender-policy.cjs');
function prepare(sender,verification){
 if(verification?.profile_verified!==true||verification?.reason!=='matched')throw Error('VERIFIED_ACCOUNT_REQUIRED');
 const v=policy.validate(sender?.email_dispatch);if(!v.valid)throw Error('VALID_SENDER_POLICY_REQUIRED');
 if(sender.execution_authorized!==false||sender.email_dispatch.enabled!==false)throw Error('DISABLED_SENDER_DRAFT_REQUIRED');
 if(sender.binding?.org_id!==sender.org_id||sender.binding?.email!==sender.email_dispatch.sender_email||sender.binding?.credential_ref!==sender.email_dispatch.credential_ref)throw Error('SENDER_BINDING_MISMATCH');
 const message={org_id:sender.org_id,credential_ref:sender.binding.credential_ref,from:sender.binding.email,to:sender.binding.email,
 subject:'Lead management system — one-time email test',
 body:'Hi Fahad,\n\nThis is a one-time test of your lead management system’s Gmail email executor. No prospect has been contacted, and automatic outreach remains disabled.\n\nFahad',
 max_messages:1,followups:[],automatic_retries:false};
 return {version:'self_test_review_v1',message,review_hash:crypto.createHash('sha256').update(JSON.stringify(message)).digest('hex'),
 approval_required:true,execution_authorized:false,
 limitations:['Profile identity verified; sending permission and delivery are not yet verified.','Use existing approval, lease, quota and receipt checks; this artifact does not replace a strategy approval.','No prospect or scheduled sending is authorized.']};
}
module.exports={prepare};
if(require.main===module){const fs=require('fs');const sender=JSON.parse(fs.readFileSync('.local/email-sender-review-20261019.json','utf8'));
 const verification=JSON.parse(fs.readFileSync('documentation/strategy-contract-v2/gmail-profile-verification-20261019.json','utf8'));
 const review=prepare(sender,verification);fs.writeFileSync('.local/email-self-test-review-20261019.json',JSON.stringify(review,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({prepared:true,recipient:review.message.to,subject:review.message.subject,execution_authorized:false}));}
