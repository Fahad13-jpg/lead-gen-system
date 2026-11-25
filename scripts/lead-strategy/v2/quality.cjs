'use strict';
// A campaign rule links an observation to an approved benefit. It does not establish need.
function matches(facts,rules,benefits){
 const result=[];
 for(const rule of Array.isArray(rules)?rules:[]){
  const benefit=benefits[rule.approved_point_index];
  if(!benefit||!Array.isArray(rule.evidence_terms))continue;
  for(const fact of facts){
   if(fact.polarity!=='present')continue;
   if(rule.evidence_terms.some(t=>typeof t==='string'&&t.trim()&&(fact.data.text||'').toLowerCase().includes(t.trim().toLowerCase())))result.push({fact_id:fact.id,benefit_id:benefit.id});
  }
 }
 return result.filter((m,i,a)=>a.findIndex(x=>x.fact_id===m.fact_id&&x.benefit_id===m.benefit_id)===i);
}
function followupReview(brief,output){
 const items=(output?.followups||[]).map((f,index)=>{
  // Conservative English asset detection, not a general semantic proof.
  const assetReference=/\b(?:(?:demo|demonstration|product)\s+(?:link|url)|(?:link|url)\s+(?:to|for)\s+(?:the\s+)?(?:demo|demonstration|product))\b/i.test(f.intent);
  const assetAvailable=!!brief.campaign.cta?.url&&brief.url_allowlist.includes(brief.campaign.cta.url);
  return {index,channel:f.channel,status:'requires_execution_checks',asset_reference:assetReference,
   errors:assetReference&&!assetAvailable?['FOLLOWUP_ASSET_UNAVAILABLE']:[],
   required_checks:['previous_confirmed_send','no_reply','not_suppressed','current_channel_readiness',...(assetReference?['asset_in_previous_confirmed_send']:[]),...(brief.qualifier.fit==='weak'?['weak_fit_human_review']:[])],
   checks_performed:false,execution_authorized:false};
 });
 return {items,errors:[...new Set(items.flatMap(x=>x.errors))],limitations:['Internal intent text is not an executable message.','Asset detection covers common English demo/product link phrases only; other wording requires review.','A configured URL does not prove it was sent, received or viewed.']};
}
function review(brief,output){
 const cited=(output?.step1?.parts||[]).filter(p=>p.type==='observed').map(p=>p.ref);
 const benefits=(output?.step1?.parts||[]).filter(p=>p.type==='offer').map(p=>p.ref);
 const supported=cited.filter(id=>brief.relevance?.matches?.some(m=>m.fact_id===id&&benefits.includes(m.benefit_id)));
 const flags=[];
 if(brief.qualifier.fit==='weak')flags.push('weak_offer_fit');
 if(['unclear','not_assessed'].includes(brief.qualifier.fit))flags.push('fit_not_established');
 if(cited.some(id=>!supported.includes(id)))flags.push('offer_relevance_unproven');
 const available=(brief.relevance?.matches||[]).filter(m=>brief.qualifier.candidate_angles.some(a=>a.benefit_id===m.benefit_id));
 const present=(brief.facts||[]).filter(f=>f.polarity==='present');
 const personalization_status=!output?'no_valid_plan':!brief.permitted_channels.length?'no_permitted_channel':supported.length?'supported_personalization':available.length?'relevant_evidence_unused':present.length?'no_approved_benefit_match':'insufficient_evidence';
 const next_actions={no_valid_plan:'Review the generation failure; no draft is ready.',no_permitted_channel:'Resolve existing readiness restrictions before planning outreach.',supported_personalization:'Review the quoted fact and approved benefit together; need remains unconfirmed.',relevant_evidence_unused:'Review why the available fact-to-benefit match was not used.',no_approved_benefit_match:'Provide a relevant approved benefit and customer-defined evidence matching rule.',insufficient_evidence:'Collect usable current evidence or explicitly review category-level wording.'};
 return {flags,followup_review:followupReview(brief,output),personalization_status,next_action:next_actions[personalization_status],available_match_count:available.length,observed_personalization:cited.length>0,benefit_relevance:supported.length?'customer_rule_match_not_confirmed_need':'not_established',supported_fact_ids:supported,
  recommendation:brief.qualifier.fit==='weak'?'Review whether to pursue this lead before follow-up.':['unclear','not_assessed'].includes(brief.qualifier.fit)?'Clarify relevance before pursuing the offer.':'Review the approved angle and factual accuracy.',confirmed_need:false};
}
module.exports={matches,review,followupReview};
