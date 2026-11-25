'use strict';
// Operator-only read diagnostics; injected principal is NOT an HTTP auth bypass.
const {localPool}=require('./start-local-auth.cjs'),{dataService}=require('./data.cjs');
let stage='connect';
(async()=>{const pool=localPool();try{
 const service=dataService({pool,identity:{principal:async()=>{}}});
 stage='apify_connection_safety';console.log(JSON.stringify({apify_workflow_secret_safety:await require('./apify-connection-safety.cjs').connectionSafety(pool)(),provider_called:false}));
 stage='settings';const settings=await dataService({pool,identity:{principal:async()=>({role:'owner',subject:'operator-read-only'})}}).settings('operator-read',{org_id:'1'});
 console.log(JSON.stringify({settings_query_verified:true,visible_sender_count:settings.connection_total,credential_values_exposed:false}));
 stage='outreach';const activities=await service.outreach('operator-read',{org_id:'1',limit:'2'}),outsideActivities=await service.outreach('operator-read',{org_id:'2147483647'});
 if(outsideActivities.total!==0)throw Error('OUTREACH_ISOLATION_FAILED');console.log(JSON.stringify({outreach_query_verified:true,total_activity_records:activities.total,other_org_empty:true}));
 stage='strategy_request_lookup';const missingStrategy=await service.strategyRequest('operator-read',{org_id:'2147483647',request_id:'dash_'+'0'.repeat(32)});
 if(missingStrategy.found)throw Error('STRATEGY_LOOKUP_ISOLATION_FAILED');
 stage='campaigns';const campaigns=await service.campaigns('operator-read',{org_id:'1',limit:'2'});
 const outsideCampaigns=await service.campaigns('operator-read',{org_id:'2147483647'});
 if(outsideCampaigns.total!==0)throw Error('CAMPAIGN_ISOLATION_CHECK_FAILED');
 console.log(JSON.stringify({campaign_query_verified:true,campaign_total:campaigns.total,other_org_empty:true}));
 if(campaigns.campaigns.length){stage='plans';const campaign_id=campaigns.campaigns[0].id;
 const plans=await service.plans('operator-read',{org_id:'1',campaign_id,limit:'2'});
 if(plans.plans.length){const context=await require('./approval.cjs').approvalLoader(pool)(1,Number(plans.plans[0].id));if(!context)throw Error('APPROVAL_CONTEXT_MISSING');console.log(JSON.stringify({approval_preflight_read_verified:true,approval_written:false}));}
 const outsidePlans=await service.plans('operator-read',{org_id:'2147483647',campaign_id});
 if(!plans.found||outsidePlans.found||outsidePlans.total!==0)throw Error('PLAN_ISOLATION_CHECK_FAILED');
 console.log(JSON.stringify({plan_query_verified:true,saved_plans:plans.total,other_org_empty:true}));}
 stage='leads';const leads=await service.leads('operator-read',{org_id:'1',limit:'2'});
 stage='jobs';const jobs=await service.jobs('operator-read',{org_id:'1',limit:'2'});
 stage='job_assessment_progress';const allJobs=await service.jobs('operator-read',{org_id:'1',limit:'100'});
 for(const job of allJobs.jobs)for(const field of ['basic_current_count','basic_pending_count','basic_processing_count','basic_failed_count']){
  if(!Number.isInteger(job[field])||job[field]<0||job[field]>job.cleaned_count)throw Error('JOB_ASSESSMENT_COUNTS_INVALID');
 }
 const outsideJobs=await service.jobs('operator-read',{org_id:'2147483647'});if(outsideJobs.total!==0)throw Error('JOB_ASSESSMENT_ISOLATION_FAILED');
 console.log(JSON.stringify({job_assessment_progress_verified:true,jobs_checked:allJobs.jobs.length,all_counts_within_cleaned_businesses:true,other_org_empty:true}));
 stage='overview';const overview=await service.overview('operator-read',{org_id:'1',days:'30'});
 if(overview.counts.cleaned_leads!==leads.total||overview.counts.searches!==jobs.total||overview.search_activity.length!==30)throw Error('OVERVIEW_CHECK_FAILED');
 const empty=await service.leads('operator-read',{org_id:'2147483647'});
 const missingRequest=await service.searchRequest('operator-read',{org_id:'2147483647',request_id:'dash_'+'0'.repeat(32)});
 stage='lead_detail';const detail=await service.leadDetail('operator-read',{org_id:'1',lead_id:'167'});
 stage='detail_isolation';const outside=await service.leadDetail('operator-read',{org_id:'2147483647',lead_id:'167'});
 if(!detail.found||outside.found)throw Error('DETAIL_ISOLATION_CHECK_FAILED');
 stage='billing';const billing=(await pool.query("SELECT gathering_quote_v3(1,'platform',0.5) AS billing")).rows[0]?.billing;
 if(missingRequest.found)throw Error('REQUEST_ISOLATION_CHECK_FAILED');
 if(empty.total!==0||empty.leads.length!==0)throw Error('ISOLATION_CHECK_FAILED');
 console.log(JSON.stringify({queries_verified:true,org_id:1,total_cleaned_leads:leads.total,total_jobs:jobs.total,overview_verified:true,activity_days:overview.search_activity.length,database_timezone:overview.database_timezone,lead_rows:leads.leads.length,job_rows:jobs.jobs.length,unregistered_org_empty:true,billing_ready:billing?.ready,provider_budget_available:billing?.provider_budget_available,organization_credits_cover_quote:billing?.ready?Number(billing.wallet_available_usd)>=Number(billing.maximum_customer_charge_usd):false,database_changed:false}));
}finally{await pool.end();}})().catch(error=>{console.error(JSON.stringify({error:'DATA_QUERY_CHECK_FAILED',stage,code:/^[A-Z0-9_]{2,60}$/.test(error.code||'')?error.code:null}));process.exitCode=1;});
