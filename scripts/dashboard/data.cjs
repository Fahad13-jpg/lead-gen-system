'use strict';
// Fixed read queries only; every request rechecks the active organization membership.
const q=v=>"'"+String(v).replace(/'/g,"''")+"'";
const {detail}=require('./lead-detail.cjs');
const {review}=require('./plan-review.cjs');
const {readinessLoader}=require('./strategy-readiness.cjs');
const statusSummary=require('./status-summary.cjs');
function number(value,fallback,max){if(value===undefined)return fallback;if(!/^[1-9][0-9]*$/.test(String(value)))throw Error('INVALID_FILTER');const n=Number(value);if(!Number.isSafeInteger(n)||n>max)throw Error('INVALID_FILTER');return n;}
function filters(params){
  if(Object.keys(params).some(k=>!['org_id','page','limit','q','contact'].includes(k)))throw Error('INVALID_FILTER');
  const org=number(params.org_id,undefined,2147483647);if(!org)throw Error('INVALID_ORG');
  const page=number(params.page,1,10000),limit=number(params.limit,25,100),search=params.q||'',contact=params.contact||'all';
  if(typeof search!=='string'||search.length>120||/[\p{Cc}\p{Cf}]/u.test(search)||!['all','email_found','email_missing'].includes(contact))throw Error('INVALID_FILTER');
  return{org,page,limit,search:search.trim(),contact};
}
function dataService({pool,identity,automationAvailable=()=>false,now=Date.now}){
  return {
    emailPreflight:require('./email-preflight.cjs').service({pool,identity}),
    emailFollowups:require('./email-followups.cjs').service({pool,identity}),
    async settings(token,params){
      if(Object.keys(params).some(k=>k!=='org_id'))throw Error('INVALID_FILTER');const org=number(params.org_id,undefined,2147483647);if(!org)throw Error('INVALID_FILTER');
      const principal=await identity.principal(token,org),admin=['owner','admin'].includes(principal.role);
      const visible=`org_id=${org}`+(admin?'':` AND (sharing='team' OR owner_subject=${q(principal.subject)})`);
      const row=(await pool.query(`SELECT
        (SELECT jsonb_build_object('name',org_name,'status',status) FROM organizations WHERE id=${org}) AS organization,
        (SELECT count(*)::integer FROM sender_connections WHERE ${visible}) AS connection_total,
        coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY connection_id) FROM (SELECT connection_id,provider,email,sharing,state,version,${admin?'true':`owner_subject=${q(principal.subject)}`} AS can_manage,
          (provider='smtp' AND connection_id ~ '^smtp_[a-f0-9]{32}$' AND (owner_subject=${q(principal.subject)} OR (sharing='team' AND ${admin?'true':'false'}))) AS can_replace,
          (provider='gmail' AND connection_id ~ '^gmail_[a-f0-9]{32}$' AND (owner_subject=${q(principal.subject)} OR (sharing='team' AND ${admin?'true':'false'}))) AS can_reconnect,
          daily_limit,mailbox_rolling_limit,min_interval_seconds,send_capable,reply_capable,checked_at FROM sender_connections
          WHERE ${visible} ORDER BY connection_id LIMIT 100)s),'[]'::jsonb) AS connections,
        (SELECT jsonb_build_object('enabled',g.enabled,'key_configured',nullif(g.api_key,'') IS NOT NULL,
          'active_searches',(SELECT count(*)::integer FROM scraping_jobs j WHERE j.org_id=${org} AND j.provider_account_id=g.id AND j.status IN ('queued','pending','running')),
          'unsettled_searches',(SELECT count(*)::integer FROM scraping_jobs j WHERE j.org_id=${org} AND j.provider_account_id=g.id AND (j.status='needs_review' OR (j.actual_cost IS NULL AND j.apify_actor_run_id IS NOT NULL AND j.status NOT IN ('queued','pending','running'))))) FROM gathering_accounts g WHERE g.mode='byok' AND g.org_id=${org}) AS apify`)).rows[0];
      if(!row?.organization||!Array.isArray(row.connections))throw Error('DATA_UNAVAILABLE');
      return{...row,connections:row.connections.map(s=>({...s,health:statusSummary.sender(s,now())})),apify:row.apify?{...row.apify,health:statusSummary.apify(row.apify)}:null,role:principal.role,observed_at:new Date(now()).toISOString()};
    },
    async outreach(token,params){
      if(Object.keys(params).some(k=>!['org_id','page','limit','channel'].includes(k)))throw Error('INVALID_FILTER');
      const{channel='all',...rest}=params,f=filters(rest);
      if(!['all','email','sms','call','linkedin','whatsapp'].includes(channel))throw Error('INVALID_FILTER');await identity.principal(token,f.org);
      const where=`a.org_id=${f.org}`+(channel==='all'?'':` AND a.channel=${q(channel)}`);
      const row=(await pool.query(`WITH filtered AS (SELECT a.id,a.lead_id,a.channel,a.status,c.company_name,
        a.created_at,a.sent_at,a.replied_at,a.bounced_at,
        left(a.dispatch_metadata->>'state',80) AS dispatch_state,
        left(coalesce(a.dispatch_metadata->>'delivery_status',CASE WHEN a.channel='whatsapp' THEN a.whatsapp_delivery_status WHEN a.channel='sms' THEN a.sms_delivery_status END),80) AS delivery_status,
        left(a.dispatch_metadata->>'due_at',80) AS due_at,left(a.dispatch_metadata->>'next_check_at',80) AS next_check_at,
        CASE WHEN a.dispatch_metadata->>'step' ~ '^[0-9]{1,2}$' THEN a.dispatch_metadata->>'step' ELSE NULL END AS step,
        CASE WHEN a.channel='call' THEN left(a.dispatch_metadata->>'outcome',80) END AS call_outcome,
        CASE WHEN a.channel='call' THEN left(coalesce(a.dispatch_metadata->>'stop_reason',a.dispatch_metadata->>'followup_pause_reason'),80) END AS call_stop_reason,
        CASE WHEN a.channel='call' THEN left(a.dispatch_metadata->'booking'->>'state',80) END AS call_booking_state,
        CASE WHEN a.channel='call' THEN left(a.dispatch_metadata->'booking'->>'start',64) END AS call_booking_start,
        CASE WHEN a.channel='call' THEN left(a.dispatch_metadata->'booking'->>'end',64) END AS call_booking_end,
        CASE WHEN a.channel='call' THEN left(a.dispatch_metadata->'callback'->>'state',80) END AS call_callback_state
        FROM outreach_activities a LEFT JOIN cleaned_leads c ON c.org_id=a.org_id AND c.id=a.lead_id WHERE ${where}),
        page AS (SELECT * FROM filtered ORDER BY id DESC LIMIT ${f.limit} OFFSET ${(f.page-1)*f.limit})
        SELECT count(*)::integer AS total,count(*) FILTER(WHERE replied_at IS NOT NULL)::integer AS reply_records,
        count(*) FILTER(WHERE bounced_at IS NOT NULL)::integer AS bounce_records,
        count(*) FILTER(WHERE dispatch_state IN ('uncertain','reconciliation_required','needs_review'))::integer AS uncertain_records,
        coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY id DESC) FROM page),'[]'::jsonb) AS activities FROM filtered`)).rows[0];
      if(!Number.isInteger(row?.total)||!Array.isArray(row.activities))throw Error('DATA_UNAVAILABLE');
      return{...row,activities:row.activities.map(require('./call-activity.cjs').project),page:f.page,limit:f.limit,channel,observed_at:new Date().toISOString()};
    },
    async strategyRequest(token,params){
      if(Object.keys(params).some(k=>!['org_id','request_id'].includes(k)))throw Error('INVALID_FILTER');
      const org=number(params.org_id,undefined,2147483647);if(!org||!/^dash_[a-f0-9]{32}$/.test(params.request_id||''))throw Error('INVALID_FILTER');
      await identity.principal(token,org);
      const row=(await pool.query(`SELECT j.id::text AS job_id,j.status,j.attempts,p.id::text AS plan_id,
        CASE WHEN split_part(COALESCE(j.error,''),' ',1)=ANY(ARRAY['CUSTOMER_TEMPLATE_INVALID','CUSTOMER_PLAN_OR_CONTEXT_CHANGED','INVALID_CAMPAIGN_TEXT','CAMPAIGN_TEXT_TOO_LONG','INPUT_CHANGED','PLUS_REQUIRED']::text[]) THEN split_part(j.error,' ',1) ELSE NULL END AS error_code FROM strategy_jobs j
        LEFT JOIN strategy_plans p ON p.org_id=j.org_id AND p.job_id=j.id WHERE j.org_id=${org} AND j.request_id=${q(params.request_id)} LIMIT 1`)).rows[0];
      return{found:!!row,...(row||{})};
    },
    async plans(token,params){
      if(Object.keys(params).some(k=>!['org_id','campaign_id','page','limit'].includes(k)))throw Error('INVALID_FILTER');
      const {campaign_id,...rest}=params,f=filters(rest);
      if(!/^[1-9][0-9]{0,18}$/.test(campaign_id||'')||BigInt(campaign_id)>9223372036854775807n)throw Error('INVALID_FILTER');
      await identity.principal(token,f.org);
      const row=(await pool.query(`WITH campaign AS (SELECT id,version FROM strategy_campaigns WHERE org_id=${f.org} AND id=${campaign_id}),
        selected AS (SELECT p.id::text AS id,p.lead_id,p.campaign_version,p.created_at,p.expires_at,p.expires_at<=now() AS expired,p.body,p.content_hash,
          md5(p.body::text)=p.content_hash AS integrity_matches,c.company_name,a.action AS approval_action,a.content_hash=p.content_hash AS approval_hash_matches
          FROM strategy_plans p JOIN campaign v ON v.id=p.campaign_id LEFT JOIN cleaned_leads c ON c.org_id=p.org_id AND c.id=p.lead_id
          LEFT JOIN LATERAL (SELECT action,content_hash FROM strategy_approvals WHERE org_id=p.org_id AND plan_id=p.id ORDER BY id DESC LIMIT 1)a ON true
          WHERE p.org_id=${f.org} ORDER BY p.id DESC LIMIT ${f.limit} OFFSET ${(f.page-1)*f.limit})
        SELECT EXISTS(SELECT 1 FROM campaign) AS found,(SELECT version FROM campaign) AS current_version,
          (SELECT left(v.config->>'name',255) FROM strategy_campaign_versions v JOIN campaign c ON c.id=v.campaign_id AND c.version=v.version WHERE v.org_id=${f.org}) AS campaign_name,
          (SELECT CASE WHEN jsonb_typeof(v.config->'channels')='array' THEN v.config->'channels' ELSE '[]'::jsonb END FROM strategy_campaign_versions v JOIN campaign c ON c.id=v.campaign_id AND c.version=v.version WHERE v.org_id=${f.org}) AS configured_channels,
          (SELECT v.config->'sender_connection'->>'connection_id' FROM strategy_campaign_versions v JOIN campaign c ON c.id=v.campaign_id AND c.version=v.version WHERE v.org_id=${f.org}) AS sender_connection_id,
          (SELECT CASE WHEN v.config#>'{email_dispatch,enabled}'='true'::jsonb THEN true WHEN v.config#>'{email_dispatch,enabled}'='false'::jsonb THEN false ELSE NULL END FROM strategy_campaign_versions v JOIN campaign c ON c.id=v.campaign_id AND c.version=v.version WHERE v.org_id=${f.org}) AS email_policy_enabled,
          (SELECT count(*)::integer FROM strategy_plans WHERE org_id=${f.org} AND campaign_id IN (SELECT id FROM campaign)) AS total,
          coalesce((SELECT jsonb_agg(to_jsonb(selected) ORDER BY id::bigint DESC) FROM selected),'[]'::jsonb) AS plans`)).rows[0];
      if(typeof row?.found!=='boolean'||!Array.isArray(row.plans))throw Error('DATA_UNAVAILABLE');
      const generation_readiness=row.found?await readinessLoader(pool)(f.org,campaign_id):null;
      return{...row,plans:row.plans.map(review),generation_readiness,page:f.page,limit:f.limit,observed_at:new Date().toISOString()};
    },
    async campaigns(token,params){
      if(Object.hasOwn(params,'campaign_id')){
       if(Object.keys(params).some(k=>!['org_id','campaign_id'].includes(k)))throw Error('INVALID_FILTER');
       const org=number(params.org_id,undefined,2147483647),campaign=number(params.campaign_id,undefined,Number.MAX_SAFE_INTEGER);if(!org||!campaign)throw Error('INVALID_FILTER');
       await identity.principal(token,org);const preferences=require('./campaign-preferences.cjs'),row=await preferences.loader(pool)(org,campaign),result=preferences.project(row),limit=preferences.dailyLimit(row);return{...result,...(result.found?{email_daily_limit:limit,preferences:{...result.preferences,...(limit.available?{email_daily_limit:limit.value}:{})}}:{})};
      }
      if(Object.keys(params).some(k=>!['org_id','page','limit'].includes(k)))throw Error('INVALID_FILTER');
      const f=filters(params);await identity.principal(token,f.org);
      const sql=`WITH selected AS (SELECT c.id::text AS id,c.version,c.created_at,
        left(v.config->>'name',255) AS name,left(v.config->'offer'->>'description',1200) AS offer,
        left(v.config->'cta'->>'text',300) AS cta,left(v.config->>'mode',30) AS mode,
        CASE WHEN jsonb_typeof(v.config->'channels')='array' THEN v.config->'channels' ELSE '[]'::jsonb END AS channels,
        jsonb_build_object('authority_present',jsonb_typeof(v.config->'_email_execution')='object',
          'authority_status',v.config#>>'{_email_execution,status}','automatic_enabled',v.config#>'{_email_execution,automatic_enabled}'='true'::jsonb,
          'authority_end',v.config#>>'{_email_execution,scope,end_at}',
          'scope_matches',md5((v.config#>'{_email_execution,scope}')::text)=v.config#>>'{_email_execution,scope_hash}',
          'email_policy_enabled',v.config#>'{email_dispatch,enabled}'='true'::jsonb) AS lifecycle_inputs
        FROM strategy_campaigns c LEFT JOIN strategy_campaign_versions v ON v.org_id=c.org_id AND v.campaign_id=c.id AND v.version=c.version
        WHERE c.org_id=${f.org} ORDER BY c.id DESC LIMIT ${f.limit} OFFSET ${(f.page-1)*f.limit}),
        items AS (SELECT c.*,s.*,e.* FROM selected c CROSS JOIN LATERAL (
          SELECT count(*)::integer AS plans,count(*) FILTER(WHERE p.expires_at<=now())::integer AS expired,
          count(*) FILTER(WHERE a.action='approve' AND a.content_hash=p.content_hash)::integer AS approval_records,
          count(*) FILTER(WHERE p.expires_at>now() AND md5(p.body::text)=p.content_hash AND p.body->>'state' IN ('ai_completed','template_completed'))::integer AS reviewable_plans,
          count(*) FILTER(WHERE p.expires_at>now() AND md5(p.body::text)=p.content_hash AND p.body->>'state' IN ('ai_completed','template_completed') AND a.action='approve' AND a.content_hash=p.content_hash)::integer AS current_approvals
          FROM strategy_plans p LEFT JOIN LATERAL (SELECT action,content_hash FROM strategy_approvals WHERE org_id=p.org_id AND plan_id=p.id ORDER BY id DESC LIMIT 1) a ON true
          WHERE p.org_id=${f.org} AND p.campaign_id=c.id::bigint AND p.campaign_version=c.version) s
        CROSS JOIN LATERAL(SELECT
          count(*) FILTER(WHERE coalesce(a.dispatch_metadata->>'state',a.status) IN ('uncertain','reconciliation_required','needs_review'))::integer AS uncertain_activities,
          count(*) FILTER(WHERE coalesce(a.dispatch_metadata->>'state',a.status)='awaiting_final_cost')::integer AS unsettled_calls,
          count(*) FILTER(WHERE a.replied_at IS NULL AND a.bounced_at IS NULL
            AND a.status NOT IN ('replied','opt_out','stopped','cancelled','failed','delivered','sent','settled')
            AND (coalesce(a.dispatch_metadata->>'state',a.status) IN ('dispatching','submitting')
              OR (a.channel='call' AND coalesce(a.dispatch_metadata->>'state',a.status)='provider_accepted')
              OR (a.channel='sms' AND coalesce(a.dispatch_metadata->>'state',a.status)='accepted')))::integer AS active_activities,
          count(*) FILTER(WHERE a.replied_at IS NULL AND a.bounced_at IS NULL
            AND a.status NOT IN ('replied','opt_out','stopped','cancelled','failed','delivered','sent','settled')
            AND coalesce(a.dispatch_metadata->>'state',a.status) IN ('queued','scheduled'))::integer AS queued_activities
          FROM outreach_activities a JOIN strategy_plans p ON p.org_id=a.org_id AND p.id::text=a.dispatch_metadata->>'plan_id'
          WHERE a.org_id=${f.org} AND p.org_id=${f.org} AND p.campaign_id=c.id::bigint AND p.campaign_version=c.version)e)
        SELECT (SELECT count(*)::integer FROM strategy_campaigns WHERE org_id=${f.org}) AS total,
          coalesce((SELECT jsonb_agg(to_jsonb(items) ORDER BY id::bigint DESC) FROM items),'[]'::jsonb) AS campaigns`;
      const row=(await pool.query(sql)).rows[0];if(!Number.isInteger(row?.total)||!Array.isArray(row.campaigns))throw Error('DATA_UNAVAILABLE');
      const channels=new Set(['email','sms','linkedin','call','whatsapp']);
      return{...row,campaigns:row.campaigns.map(c=>statusSummary.projectCampaign({...c,channels:Array.isArray(c.channels)?c.channels.filter(v=>channels.has(v)):[]},{now:now(),automationAvailable:automationAvailable()===true})),page:f.page,limit:f.limit,observed_at:new Date().toISOString()};
    },
    async leadDetail(token,params){
      if(Object.keys(params).some(k=>!['org_id','lead_id'].includes(k)))throw Error('INVALID_FILTER');
      const org=number(params.org_id,undefined,2147483647),lead=number(params.lead_id,undefined,2147483647);
      if(!org||!lead)throw Error('INVALID_FILTER');await identity.principal(token,org);
      const row=(await pool.query(`SELECT c.id,c.company_name,c.category,c.city,c.country,c.email,c.phone,c.website,p.basic_at,p.research_at,
        enrichment_report(c.org_id,c.id) AS report,
        (SELECT coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) FROM (SELECT b.id::text AS batch_id,b.filename,b.provided_stage,b.created_at,ss.raw_data->>'provided_enrichment_notes' AS notes FROM lead_import_rows ir JOIN lead_import_batches b ON b.org_id=ir.org_id AND b.id=ir.batch_id JOIN staging_leads ss ON ss.org_id=ir.org_id AND ss.id=ir.staging_id WHERE ir.org_id=c.org_id AND (ir.staging_id=c.staging_id OR EXISTS(SELECT 1 FROM cleaning_links cl WHERE cl.org_id=ir.org_id AND cl.staging_id=ir.staging_id AND cl.cleaned_id=c.id)) ORDER BY b.id DESC,ir.row_number LIMIT 10)v) AS import_observations,
        (SELECT coalesce(jsonb_agg(jsonb_build_object('page_url',s.raw_data->>'facebook_page_url','messenger_url',s.raw_data->>'messenger_url','observed_at',s.raw_data->>'observed_at')),'[]'::jsonb) FROM cleaning_links l JOIN staging_leads s ON s.id=l.staging_id AND s.org_id=l.org_id WHERE l.org_id=c.org_id AND l.cleaned_id=c.id AND s.source='facebook_pages') AS facebook_observations
        FROM cleaned_leads c LEFT JOIN enrichment_profiles p ON p.org_id=c.org_id AND p.lead_id=c.id
        WHERE c.org_id=${org} AND c.id=${lead}`)).rows[0];
      return row?{...detail(row),observed_at:new Date().toISOString()}:{found:false};
    },
    async searchRequest(token,params){
      if(Object.keys(params).some(k=>!['org_id','request_id'].includes(k)))throw Error('INVALID_FILTER');
      const org=number(params.org_id,undefined,2147483647);
      if(!org||!/^dash_[a-f0-9]{32}$/.test(params.request_id||''))throw Error('INVALID_FILTER');
      await identity.principal(token,org);
      const row=(await pool.query(`SELECT id AS job_id,status FROM scraping_jobs WHERE org_id=${org} AND request_id=${q(params.request_id)} LIMIT 1`)).rows[0];
      return{found:!!row,...(row||{}),request_id:params.request_id};
    },
    async overview(token,params){
      if(Object.keys(params).some(k=>!['org_id','days'].includes(k)))throw Error('INVALID_FILTER');
      const org=number(params.org_id,undefined,2147483647),days=number(params.days,30,90);
      if(!org)throw Error('INVALID_ORG');if(![7,30,90].includes(days))throw Error('INVALID_FILTER');
      await identity.principal(token,org);
      const sql=`SELECT jsonb_build_object(
        'cleaned_leads',(SELECT count(*)::integer FROM cleaned_leads WHERE org_id=${org}),
        'email_found',(SELECT count(*)::integer FROM cleaned_leads WHERE org_id=${org} AND nullif(btrim(email),'') IS NOT NULL),
        'assessed_leads',(SELECT count(*)::integer FROM cleaned_leads c JOIN enrichment_profiles p ON p.org_id=c.org_id AND p.lead_id=c.id WHERE c.org_id=${org} AND p.basic_at IS NOT NULL),
        'searches',(SELECT count(*)::integer FROM scraping_jobs WHERE org_id=${org}),
        'active_searches',(SELECT count(*)::integer FROM scraping_jobs WHERE org_id=${org} AND status IN ('queued','pending','running')),
        'review_searches',(SELECT count(*)::integer FROM scraping_jobs WHERE org_id=${org} AND status IN ('failed','needs_review'))
      ) AS counts,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('date',d.day::date::text,'searches',coalesce(x.n,0)) ORDER BY d.day),'[]'::jsonb)
        FROM generate_series(CURRENT_DATE-${days-1},CURRENT_DATE,interval '1 day') d(day)
        LEFT JOIN (SELECT created_at::date AS day,count(*)::integer n FROM scraping_jobs
          WHERE org_id=${org} AND created_at>=CURRENT_DATE-${days-1} AND created_at<CURRENT_DATE+1 GROUP BY created_at::date) x ON x.day=d.day::date) AS search_activity,
      (SELECT coalesce(jsonb_agg(to_jsonb(j) ORDER BY j.id DESC),'[]'::jsonb) FROM
        (SELECT id,job_name,search_query,location,source,status,max_results FROM scraping_jobs WHERE org_id=${org} ORDER BY id DESC LIMIT 5)j) AS recent_jobs,
      current_setting('TimeZone') AS database_timezone`;
      const row=(await pool.query(sql)).rows[0];
      if(!row?.counts||!Object.values(row.counts).every(v=>Number.isInteger(v)&&v>=0)||!Array.isArray(row.search_activity)||!Array.isArray(row.recent_jobs))throw Error('DATA_UNAVAILABLE');
      return{...row,days,observed_at:new Date().toISOString()};
    },
    async leads(token,params){
      const leadScope=require('./lead-scope.cjs').scope(params);
      const f=filters(leadScope.base);await identity.principal(token,f.org);
      const where=`c.org_id=${f.org}`+leadScope.where(f.org)+(f.search?` AND position(lower(${q(f.search)}) in lower(concat_ws(' ',c.company_name,c.city,c.category)))>0`:'')+
        (f.contact==='email_found'?" AND nullif(btrim(c.email),'') IS NOT NULL":f.contact==='email_missing'?" AND nullif(btrim(c.email),'') IS NULL":'');
      const sql=`WITH filtered AS (SELECT c.id,c.company_name,c.category,c.city,c.country,c.email,c.phone,c.website,
        p.basic_at AS last_assessed_at FROM cleaned_leads c LEFT JOIN enrichment_profiles p ON p.org_id=c.org_id AND p.lead_id=c.id WHERE ${where}),
        page AS (SELECT * FROM filtered ORDER BY id DESC LIMIT ${f.limit} OFFSET ${(f.page-1)*f.limit})
        SELECT (SELECT count(*) FROM filtered)::integer AS total,coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY id DESC) FROM page),'[]'::jsonb) AS leads`;
      const row=(await pool.query(sql)).rows[0];
      if(!Number.isInteger(row?.total)||!Array.isArray(row.leads))throw Error('DATA_UNAVAILABLE');
      return{...row,page:f.page,limit:f.limit,observed_at:new Date().toISOString()};
    },
    async jobs(token,params){
      if(Object.keys(params).some(k=>!['org_id','page','limit'].includes(k)))throw Error('INVALID_FILTER');
      const f=filters(params);await identity.principal(token,f.org);
      const sql=`WITH selected AS (SELECT id,job_name,search_query,location,source,max_results,status,total_leads,duplicate_count,
        fetched_count,created_at,started_at,heartbeat_at,cancel_requested,result_mode,completion_reason,
        apify_actor_run_id IS NOT NULL AS provider_run_recorded,dataset_id IS NOT NULL AS provider_dataset_recorded,
        (apify_actor_run_id ~ '^[A-Za-z0-9_-]{1,200}$' AND dataset_id ~ '^[A-Za-z0-9_-]{1,200}$') AS provider_references_valid,
        started_at IS NOT NULL AS started_recorded,actual_cost IS NOT NULL AS provider_cost_recorded,
        billing_mode,max_cost_usd AS provider_ceiling,actual_cost AS provider_actual,
        customer_reserved_usd AS platform_ceiling,customer_charge_usd AS platform_actual
        FROM scraping_jobs WHERE org_id=${f.org} ORDER BY id DESC LIMIT ${f.limit} OFFSET ${(f.page-1)*f.limit}),
        items AS (SELECT j.*,counts.*,
          CASE WHEN j.result_mode IN ('new','matching') THEN (SELECT count(DISTINCT r.lead_id)::integer FROM gathering_results r
            WHERE r.org_id=${f.org} AND r.job_id=j.id AND (r.reason='organization_already_has_business' OR r.disposition='reused')) ELSE NULL END AS existing_match_count,
          CASE WHEN j.result_mode IN ('new','matching') AND j.status IN ('completed','failed','cancelled') THEN greatest(0,j.max_results-CASE WHEN j.result_mode='new' THEN coalesce(j.total_leads,0)
            ELSE (SELECT count(DISTINCT r.lead_id)::integer FROM gathering_results r WHERE r.org_id=${f.org} AND r.job_id=j.id) END) ELSE NULL END AS target_shortfall
          FROM selected j CROSS JOIN LATERAL (
          SELECT count(DISTINCT s.id)::integer AS staged_count,count(DISTINCT c.id)::integer AS cleaned_count,
          count(DISTINCT s.id) FILTER(WHERE s.cleaning_status IN ('pending','processing'))::integer AS cleaning_active_count,
          count(DISTINCT s.id) FILTER(WHERE s.cleaning_status IN ('failed','review') AND NOT EXISTS (
            SELECT 1 FROM cleaning_review_decisions d
            WHERE d.org_id=s.org_id AND d.staging_id=s.id
          ))::integer AS cleaning_review_count,
          count(DISTINCT p.lead_id) FILTER(WHERE p.basic_at IS NOT NULL)::integer AS assessed_count,
          count(DISTINCT p.lead_id) FILTER(WHERE p.basic_at<=now() AND p.basic_at>now()-interval '30 days'
            AND p.basic->>'input_fingerprint'=enrichment_fingerprint(p.org_id,p.lead_id,'basic'))::integer AS basic_current_count,
          count(DISTINCT t.lead_id) FILTER(WHERE t.status='pending')::integer AS basic_pending_count,
          count(DISTINCT t.lead_id) FILTER(WHERE t.status='processing')::integer AS basic_processing_count,
          count(DISTINCT t.lead_id) FILTER(WHERE t.status='failed')::integer AS basic_failed_count
          FROM staging_leads s LEFT JOIN cleaning_links l ON l.org_id=s.org_id AND l.staging_id=s.id
          LEFT JOIN cleaned_leads c ON c.org_id=l.org_id AND c.id=l.cleaned_id
          LEFT JOIN enrichment_profiles p ON p.org_id=c.org_id AND p.lead_id=c.id
          LEFT JOIN enrichment_tasks t ON t.org_id=c.org_id AND t.lead_id=c.id AND t.kind='basic'
          WHERE s.org_id=${f.org} AND s.job_id=j.id) counts)
        SELECT (SELECT count(*)::integer FROM scraping_jobs WHERE org_id=${f.org}) AS total,
          coalesce((SELECT jsonb_agg(to_jsonb(items) ORDER BY id DESC) FROM items),'[]'::jsonb) AS jobs`;
      const row=(await pool.query(sql)).rows[0];
      if(!Number.isInteger(row?.total)||!Array.isArray(row.jobs))throw Error('DATA_UNAVAILABLE');
      return{...row,jobs:row.jobs.map(j=>statusSummary.projectJob(j,{now:now()})),page:f.page,limit:f.limit,observed_at:new Date(now()).toISOString()};
    }
  };
}
module.exports={dataService,filters};
