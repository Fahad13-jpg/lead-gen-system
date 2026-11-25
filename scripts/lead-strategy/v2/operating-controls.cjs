'use strict';
// Operator-owned claim-query controls. Browser campaign/job input cannot supply
// these values: the PostgreSQL claim node overwrites them after claiming a job.
const assert=require('node:assert/strict');
const review="draftReviewEnabled:$env.STRATEGY_DRAFT_REVIEW_ENABLED==='true'";
const customer="customerTemplatesEnabled:$env.CUSTOMER_EMAIL_TEMPLATES_ENABLED==='true'";
function configure(workflow,controls){
 assert(controls&&Object.keys(controls).sort().join(',')==='customer_templates,native_email_review'&&Object.values(controls).every(v=>typeof v==='boolean'),'EXPLICIT_STRATEGY_CONTROLS_REQUIRED');
 const w=structuredClone(workflow),claim=w.nodes.find(n=>n.name==='Claim Strategy Jobs'),prepare=w.nodes.find(n=>n.name==='Prepare Strategy');
 assert(claim?.type==='n8n-nodes-base.postgres'&&prepare?.type==='n8n-nodes-base.code'&&prepare.parameters.mode==='runOnceForEachItem','EXPECTED_STRATEGY_NODES_REQUIRED');
 const query=claim.parameters.query,needle="value||jsonb_build_object('email_sender_snapshot',";
 const old=/value\|\|jsonb_build_object\('operator_controls','\{"native_email_review":(?:true|false),"customer_templates":(?:true|false)\}'::jsonb,'email_sender_snapshot',/;
 const replacement="value||jsonb_build_object('operator_controls','"+JSON.stringify({native_email_review:controls.native_email_review,customer_templates:controls.customer_templates})+"'::jsonb,'email_sender_snapshot',";
 assert(query.includes('EMAIL_DRAFT_READINESS_V1')&&query.includes('strategy_claim('),'TRUSTED_CLAIM_QUERY_REQUIRED');
 if(old.test(query))claim.parameters.query=query.replace(old,replacement);
 else{assert.equal(query.split(needle).length,2,'CLAIM_QUERY_CHANGED');claim.parameters.query=query.replace(needle,replacement);}
 for(const [original,field]of [[review,'native_email_review'],[customer,'customer_templates']]){
  const configured=original+"||$json.operator_controls?."+field+"===true";
  if(!prepare.parameters.jsCode.includes(configured)){
   assert.equal(prepare.parameters.jsCode.split(original).length,2,'PREPARE_BRANCH_CHANGED');prepare.parameters.jsCode=prepare.parameters.jsCode.replace(original,configured);
  }
 }
 return w;
}
module.exports={configure};
