'use strict';
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const pageMetadata=require('./page-metadata.cjs');
const evaluationRelease=require('../../dashboard/src/release.json');
// Fixed authenticated routes only; never proxy arbitrary n8n paths.
function createServer({draftBatch,leadImports,leadExport,identity,data,cleaningReview,gathering,sender,gmail,smtp,batch,authority,linkedin,calling,whatsapp,facebook,sms,enrollment,callingAccounts,callingBinding,callingPreflight,buildRoot,port=3002,now=Date.now,rateLimit=30,publicOrigin=null,localAppOrigin,health,packageAccess,siteConfig}){
  const configuredOrigin=require('./runtime-config.cjs').publicOrigin(publicOrigin||undefined);
  const configuredLocal=require('./runtime-config.cjs').localOrigin(localAppOrigin);
  const publicSite=siteConfig||pageMetadata.config({...process.env,DASHBOARD_PUBLIC_ORIGIN:configuredOrigin||''});
  const root=path.resolve(buildRoot),origins=new Set([`http://localhost:${port}`,`http://127.0.0.1:${port}`,...(configuredOrigin?[configuredOrigin]:[]),...(configuredLocal?[configuredLocal,'http://127.0.0.1:3000']:[])]),hosts=new Set([...origins].map(origin=>new URL(origin).host));
  let windowStart=now(),attempts=0,inFlight=0;
  const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow',...(status===429?{'Retry-After':'30'}:{})});res.end(JSON.stringify(body));};
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cross-Origin-Opener-Policy','same-origin-allow-popups');
    res.setHeader('Content-Security-Policy',"frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Permissions-Policy','camera=(), geolocation=()');
    try{
      if(!hosts.has(req.headers.host))return json(res,403,{error:'HOST_NOT_ALLOWED'});
      const url=new URL(req.url,'http://localhost');
      const callback=req.method==='GET'&&req.url.split('?')[0]==='/oauth/gmail/callback';
      // Google redirects retain cross-site Fetch Metadata through the redirect chain.
      // Permit only the clean return document, never API reads or mutations.
      const gmailReturn=req.method==='GET'&&req.url==='/settings?gmail_return=1'&&
        req.headers['sec-fetch-mode']==='navigate'&&req.headers['sec-fetch-dest']==='document'&&!req.headers.origin;
      // A link opened from another app/site is a safe page load, not an API
      // request. Allow only top-level HTML GET/HEAD navigations to app pages;
      // keep APIs, webhooks, OAuth endpoints and the clean Gmail return guarded.
      const appApiPath=url.pathname==='/dashboard-api'||url.pathname.startsWith('/dashboard-api/')||url.pathname==='/webhook'||url.pathname.startsWith('/webhook/');
      const oauthPath=url.pathname==='/oauth'||url.pathname.startsWith('/oauth/');
      const safeDocumentNavigation=['GET','HEAD'].includes(req.method)&&
        req.headers['sec-fetch-mode']==='navigate'&&req.headers['sec-fetch-dest']==='document'&&
        String(req.headers.accept||'').toLowerCase().includes('text/html')&&
        !appApiPath&&!oauthPath&&!(url.pathname==='/settings'&&url.search);
      if(!callback&&!gmailReturn&&!safeDocumentNavigation&&(req.headers.origin&&!origins.has(req.headers.origin)||req.headers['sec-fetch-site']==='cross-site'))return json(res,403,{error:'ORIGIN_NOT_ALLOWED'});
      if(evaluationRelease.evaluationMode&&(/^\/dashboard-api\/(?:sms\/|calling\/|api\/(?:sms|calling)[^/]*$)/.test(url.pathname)||/^\/dashboard-api\/whatsapp\/(?:sender|signup|inbox)\//.test(url.pathname)))return json(res,403,{error:'AVAILABLE_IN_VERSION_2'});
      // Keep local browser sessions on Firebase's authorized hostname. APIs and callbacks never redirect.
      const localPage=/^\/(?:$|(?:login|access|terms|design-preview|privacy|faq|contact|dashboard|scraping|leads|campaigns|outreach|settings)(?:\/|$))/.test(url.pathname);
      if(configuredLocal&&req.headers.host==='127.0.0.1:3000'&&req.method==='GET'&&!req.url.startsWith('//')&&localPage){res.writeHead(302,{'Location':configuredLocal+url.pathname+url.search,'Cache-Control':'no-store'});return res.end();}
      if(['GET','HEAD'].includes(req.method)&&url.pathname==='/robot.txt'){res.writeHead(301,{'Location':'/robots.txt','Cache-Control':'no-store'});return res.end();}
      if(['GET','HEAD'].includes(req.method)&&['/robots.txt','/sitemap.xml'].includes(url.pathname)){
        let text;try{text=url.pathname==='/robots.txt'?pageMetadata.robots(publicSite):pageMetadata.sitemap(publicSite);}catch{return json(res,503,{error:'PUBLIC_SITE_NOT_INDEXABLE'});}
        res.writeHead(200,{'Content-Type':url.pathname==='/robots.txt'?'text/plain; charset=utf-8':'application/xml; charset=utf-8','Cache-Control':'no-store'});return res.end(req.method==='HEAD'?undefined:text);
      }
      if(req.method==='GET'&&['/health/live','/health/ready'].includes(url.pathname)){
        if(url.pathname==='/health/ready'){if(typeof health!=='function')return json(res,503,{status:'unavailable'});try{await health();}catch{return json(res,503,{status:'unavailable'});}}
        return json(res,200,{status:'ok'});
      }
      if(callback){if(!gmail)return json(res,503,{error:'GMAIL_SETUP_REQUIRED'});if([...url.searchParams.keys()].some(k=>url.searchParams.getAll(k).length!==1))return json(res,400,{error:'INVALID_CALLBACK'});await gmail.capture(url.searchParams);res.writeHead(302,{'Location':(configuredLocal||'')+'/settings?gmail_return=1','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});return res.end();}
      const whatsappActions=whatsapp&&{'/dashboard-api/whatsapp/manual/prepare':'prepareManualWhatsApp','/dashboard-api/whatsapp/sender/check':'checkWhatsAppSender','/dashboard-api/whatsapp/signup/begin':'beginWhatsAppSignup','/dashboard-api/whatsapp/signup/complete':'completeWhatsAppSignup','/dashboard-api/whatsapp/inbox/review':'reviewWhatsApp','/dashboard-api/whatsapp/sender/manage':'manageWhatsApp'};
      const smsAction=sms&&{'/dashboard-api/sms/devices':'devices','/dashboard-api/sms/connect':'connect','/dashboard-api/sms/check':'check','/dashboard-api/sms/configure':'configure','/dashboard-api/sms/release':'release','/dashboard-api/sms/cancel':'cancel'}[url.pathname];
      const smsRead=sms&&url.pathname==='/dashboard-api/api/sms';
      const facebookAction=facebook&&url.pathname==='/dashboard-api/facebook/manual/prepare';
      const callingPreflightAction=callingPreflight&&url.pathname==='/dashboard-api/calling/account/check';
      const callingPreflightRead=callingPreflight&&url.pathname==='/dashboard-api/api/calling-preflight';
      const callingBindingAction=callingBinding&&{'/dashboard-api/calling/account/change':'change','/dashboard-api/calling/account/bind':'bind'}[url.pathname];
      const callingBindingRead=callingBinding&&{'/dashboard-api/api/calling-binding':'read','/dashboard-api/api/calling-account-receipt':'receipt'}[url.pathname];
      const callingAccountAction=callingAccounts&&url.pathname==='/dashboard-api/calling/account/connect';
      const callingAccountRead=callingAccounts&&url.pathname==='/dashboard-api/api/calling-account';
      const enrollmentAction=enrollment&&url.pathname==='/dashboard-api/workspace/create';
      const enrollmentRead=enrollment&&url.pathname==='/dashboard-api/workspace/status';
      const draftBatchAction=draftBatch&&{'/dashboard-api/strategy/group/preview':'preview','/dashboard-api/strategy/group/prepare':'prepare','/dashboard-api/strategy/group/status':'status','/dashboard-api/strategy/group/approval-preview':'approvalPreview','/dashboard-api/strategy/group/approve':'approve'}[url.pathname];
      const cleaningReviewAction=cleaningReview&&url.pathname==='/dashboard-api/cleaning-review/skip'?'skip':null;
      const action=cleaningReviewAction?'cleaningReviewAction':draftBatchAction?'draftBatchAction':callingPreflightAction?'checkCallingPreflight':callingBindingAction?'callingBindingAction':callingAccountAction?'connectCallingAccount':enrollmentAction?'createWorkspace':smsAction?'smsAction':facebookAction?'prepareManualFacebook':whatsappActions?.[url.pathname]||calling&&{'/dashboard-api/calling/settings':'saveCallingSettings'}[url.pathname]||linkedin&&{'/dashboard-api/linkedin/event':'linkedinEvent','/dashboard-api/linkedin/prepare':'linkedinPrepare'}[url.pathname]||gathering&&{'/dashboard-api/apify/connect':'connectApify','/dashboard-api/apify/prepare':'prepareApify','/dashboard-api/apify/reconcile':'reconcileApify','/dashboard-api/strategy/approval':'approvePlan','/dashboard-api/strategy/request':'requestStrategy','/dashboard-api/campaign/create':'saveCampaign','/dashboard-api/search/preview':'preview','/dashboard-api/search/submit':'submit'}[url.pathname]||sender&&{'/dashboard-api/sender/manage':'manageSender','/dashboard-api/sender/bind':'bindSender'}[url.pathname]||gmail&&{'/dashboard-api/gmail/begin':'beginGmail','/dashboard-api/gmail/reconnect/begin':'beginReconnectGmail','/dashboard-api/gmail/finish':'finishGmail','/dashboard-api/gmail/reconcile':'reconcileGmail'}[url.pathname]||smtp&&{'/dashboard-api/smtp/connect':'connectSmtp','/dashboard-api/smtp/replace':'replaceSmtp'}[url.pathname]||batch&&{'/dashboard-api/email-batch/control':'controlEmailBatch'}[url.pathname]||authority&&{'/dashboard-api/campaign-authority/preview':'previewCampaignAuthority','/dashboard-api/campaign-authority/change':'changeCampaignAuthority','/dashboard-api/campaign-authority/control':'controlCampaignAuthority'}[url.pathname]||leadImports&&{'/dashboard-api/leads/import/preview':'previewLeadImport','/dashboard-api/leads/import/commit':'commitLeadImport'}[url.pathname];
      if(!['GET','HEAD'].includes(req.method)&&!(action&&req.method==='POST')){res.setHeader('Allow',action?'POST':'GET, HEAD');return json(res,405,{error:'METHOD_NOT_ALLOWED'});}
      if(action&&(req.method!=='POST'||!origins.has(req.headers.origin)||req.headers['content-type']!=='application/json'||url.search))return json(res,400,{error:'INVALID_ACTION_REQUEST'});
      if(['beginGmail','beginReconnectGmail'].includes(action)&&req.headers.origin!==(configuredLocal||gmail.origin))return json(res,400,{error:'GMAIL_CANONICAL_ORIGIN_REQUIRED'});
      const facebookRead=facebook&&url.pathname==='/dashboard-api/api/facebook-manual';
      const whatsappRead=whatsapp&&{'/dashboard-api/api/whatsapp-manual':'manualContext','/dashboard-api/api/whatsapp-status':'status','/dashboard-api/api/whatsapp-senders':'senders','/dashboard-api/api/whatsapp-inbox':'inbox'}[url.pathname];
      const callingRead=calling&&{'/dashboard-api/api/calling-settings':'read','/dashboard-api/api/calling-preview':'preview','/dashboard-api/api/calling-calendars':'list'}[url.pathname];
      const linkedinRead=linkedin&&{'/dashboard-api/api/linkedin-queue':'queue','/dashboard-api/api/linkedin-receipt':'receipt'}[url.pathname];
      const campaignStatus=authority&&url.pathname==='/dashboard-api/api/campaign-authority';
      const batchList=batch&&url.pathname==='/dashboard-api/api/email-batches';
      const gmailStatus=gmail&&url.pathname==='/dashboard-api/gmail/status';
      const packageRead=packageAccess&&url.pathname==='/dashboard-api/api/package';
      const importRead=leadImports&&url.pathname==='/dashboard-api/api/lead-imports';
      const exportRead=leadExport&&url.pathname==='/dashboard-api/api/lead-export';
      const cleaningReviewRead=cleaningReview&&url.pathname==='/dashboard-api/api/cleaning-reviews';
      const assessmentReviewRead=cleaningReview&&url.pathname==='/dashboard-api/api/assessment-reviews';
      const isSession=url.pathname==='/dashboard-api/session';
      const dataMethod=data&&{'/dashboard-api/api/email-followups':'emailFollowups','/dashboard-api/api/email-preflight':'emailPreflight','/dashboard-api/api/strategy-request':'strategyRequest','/dashboard-api/api/settings':'settings','/dashboard-api/api/outreach':'outreach','/dashboard-api/api/plans':'plans','/dashboard-api/api/campaigns':'campaigns','/dashboard-api/api/leads':'leads','/dashboard-api/api/lead-detail':'leadDetail','/dashboard-api/api/jobs':'jobs','/dashboard-api/api/overview':'overview','/dashboard-api/api/search-request':'searchRequest'}[url.pathname];
      if(importRead||exportRead||packageRead||isSession||dataMethod||action||gmailStatus||batchList||campaignStatus||linkedinRead||callingRead||whatsappRead||facebookRead||smsRead||enrollmentRead||callingAccountRead||callingBindingRead||callingPreflightRead||cleaningReviewRead||assessmentReviewRead){
        if(!action&&(req.method!=='GET'||isSession&&url.search))return json(res,400,{error:'INVALID_SESSION_REQUEST'});
        const params=Object.fromEntries(url.searchParams);
        if([...url.searchParams.keys()].some(k=>url.searchParams.getAll(k).length!==1))return json(res,400,{error:'INVALID_FILTER'});
        if(now()-windowStart>=60000){windowStart=now();attempts=0;}
        if(++attempts>rateLimit||inFlight>=4)return json(res,429,{error:'TRY_LATER'});
        const match=/^Bearer ([A-Za-z0-9_.-]{1,16384})$/.exec(req.headers.authorization||'');
        if(!match)return json(res,401,{error:'AUTHENTICATION_REQUIRED'});
        inFlight++;let timer;
        const pending=Promise.resolve().then(async()=>{
          if(action){
            let length=0,chunks=[];
            for await(const chunk of req){const bytes=Buffer.from(chunk);length+=bytes.length;if(length>(['previewLeadImport','commitLeadImport'].includes(action)?2200000:action==='saveCampaign'?65536:['connectSmtp','replaceSmtp'].includes(action)?16384:8192))throw Error('INVALID_FILTER');chunks.push(bytes);}
            let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('INVALID_FILTER');}
            if(packageAccess)await packageAccess.authorize(match[1],body,{action,smsAction,callingBindingAction});
            if(['previewLeadImport','commitLeadImport'].includes(action))return leadImports[action==='previewLeadImport'?'preview':'commit'](match[1],body);
            if(action==='draftBatchAction')return draftBatch[draftBatchAction](match[1],body);
            if(action==='cleaningReviewAction')return cleaningReview[cleaningReviewAction](match[1],body);
            if(action==='checkCallingPreflight')return callingPreflight.check(match[1],body);
            if(action==='callingBindingAction')return callingBinding[callingBindingAction](match[1],body);
            if(action==='connectCallingAccount')return callingAccounts.connect(match[1],body);
            if(action==='createWorkspace')return enrollment.create(match[1],body);
            if(action==='smsAction')return sms[smsAction](match[1],body);
            if(action==='prepareManualFacebook')return facebook.prepare(match[1],body);
            if(action==='prepareManualWhatsApp')return whatsapp.prepareManual(match[1],body);
            if(action==='checkWhatsAppSender')return whatsapp.check(match[1],body);
            if(['beginWhatsAppSignup','completeWhatsAppSignup'].includes(action))return whatsapp[action==='beginWhatsAppSignup'?'beginSignup':'completeSignup'](match[1],body,req.headers.origin);
            if(['reviewWhatsApp','manageWhatsApp'].includes(action))return whatsapp[action==='reviewWhatsApp'?'review':'manage'](match[1],body);
            if(action==='saveCallingSettings')return calling.save(match[1],body);
            if(['linkedinEvent','linkedinPrepare'].includes(action))return linkedin[action==='linkedinEvent'?'event':'prepare'](match[1],body);
            if(['previewCampaignAuthority','changeCampaignAuthority','controlCampaignAuthority'].includes(action))return authority[{previewCampaignAuthority:'preview',changeCampaignAuthority:'change',controlCampaignAuthority:'control'}[action]](match[1],body);
            return (action==='controlEmailBatch'?batch:['connectSmtp','replaceSmtp'].includes(action)?smtp:['beginGmail','beginReconnectGmail','finishGmail','reconcileGmail'].includes(action)?gmail:['manageSender','bindSender'].includes(action)?sender:gathering)[action](match[1],body);
          }
          return importRead?leadImports.list(match[1],params):exportRead?leadExport(match[1],params):packageRead?packageAccess.status(match[1],params):cleaningReviewRead?cleaningReview.list(match[1],params):assessmentReviewRead?cleaningReview.assessments(match[1],params):callingPreflightRead?callingPreflight.status(match[1],params):callingBindingRead?callingBinding[callingBindingRead](match[1],params):callingAccountRead?callingAccounts.status(match[1],params):enrollmentRead?enrollment.status(match[1],params):smsRead?sms.status(match[1],params):facebookRead?facebook.context(match[1],params):whatsappRead?whatsapp[whatsappRead](match[1],params):callingRead?calling[callingRead](match[1],params):linkedinRead?linkedin[linkedinRead](match[1],params):campaignStatus?authority.status(match[1],params):batchList?batch.listEmailBatches(match[1],params):isSession?identity.session(match[1]):gmailStatus?gmail.status(match[1],params):data[dataMethod](match[1],params);
        });
        // A timeout does not release capacity while the provider call is still running.
        pending.then(()=>{inFlight--;},()=>{inFlight--;});
        try{
          const actionTimeout=draftBatchAction?60000:20000;
          const result=await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('SESSION_TIMEOUT')),actionTimeout);})]);
          return json(res,action==='submit'?202:200,result);
        }catch(error){
          const code=error?.message;
          if(action==='draftBatchAction'){
            const known=['DRAFT_BATCH_CHANGED','DRAFT_BATCH_TEMPLATE_REQUIRED','DRAFT_BATCH_ACK_REQUIRED','DRAFT_BATCH_NOT_READY','DRAFT_BATCH_UNCONFIRMED','STRATEGY_SERVICE_UNAVAILABLE','STRATEGY_PROCESSING_PAUSED','STRATEGY_AI_ALLOWANCE_REQUIRED','STRATEGY_AI_LIMIT_REACHED','STRATEGY_MODE_UNSUPPORTED','STRATEGY_CAMPAIGN_NOT_FOUND','STRATEGY_READINESS_UNCONFIRMED','CAMPAIGN_NOT_FOUND','ROLE_REQUIRED','INVALID_FILTER','INVALID_ORG','PLUS_REQUIRED','PLUS_APPROVAL_REQUIRED'];
            const safeCode=known.includes(code)?code:code==='SESSION_TIMEOUT'?'SESSION_TIMEOUT':'UNEXPECTED_ERROR';
            const sqlState=/^[0-9A-Z]{5}$/.test(error?.code||'')?error.code:undefined;
            console.error(JSON.stringify({event:'dashboard_draft_batch_failure',action:draftBatchAction,reason:safeCode,...(sqlState?{sql_state:sqlState}:{})}));
            if(code==='SESSION_TIMEOUT')return json(res,503,{error:'DRAFT_BATCH_UNCONFIRMED'});
          }
          if(['CSV_INVALID','CSV_LIMIT','CSV_EMPTY','CSV_HEADERS','CSV_NO_ACCEPTED_ROWS'].includes(code))return json(res,400,{error:code});
          if(['DRAFT_BATCH_CHANGED','DRAFT_BATCH_TEMPLATE_REQUIRED','DRAFT_BATCH_ACK_REQUIRED','DRAFT_BATCH_NOT_READY'].includes(code))return json(res,409,{error:code});
          if(code==='CSV_REQUEST_CONFLICT')return json(res,409,{error:code});
          if(['PLUS_REQUIRED','PLUS_APPROVAL_REQUIRED'].includes(code))return json(res,403,{error:code});
          if(code==='PACKAGE_ACCESS_UNAVAILABLE')return json(res,503,{error:code});
          if(['INVALID_FILTER','INVALID_ORG'].includes(code))return json(res,400,{error:'INVALID_FILTER'});
          if(code==='ROLE_REQUIRED')return json(res,403,{error:code});
          if(code==='REVIEW_NOT_FOUND')return json(res,404,{error:code});
          if(['REVIEW_NOT_PENDING','REVIEW_NOT_SAVED'].includes(code))return json(res,409,{error:code});
          if(code==='MEMBERSHIP_REQUIRED')return json(res,403,{error:'MEMBERSHIP_REQUIRED'});
          if(code==='APPROVAL_CHECK_UNAVAILABLE')return json(res,503,{error:code});
          if(['APPROVAL_CONTENT_CHANGED','APPROVAL_PLAN_BLOCKED','APPROVAL_ACK_REQUIRED'].includes(code))return json(res,409,{error:code});
          if(['GMAIL_SETUP_REQUIRED','GMAIL_STATE_EXPIRED','GMAIL_CALLBACK_NOT_READY','GMAIL_CONSENT_DENIED','GMAIL_CONNECTION_UNCONFIRMED','GMAIL_SIGNUP_BUSY'].includes(code))return json(res,409,{error:code});
          if(['APIFY_RECOVERY_INVALID','APIFY_RECOVERY_EXPIRED'].includes(code))return json(res,409,{error:code});
          if(code==='APIFY_RECOVERY_UNAVAILABLE')return json(res,503,{error:code});
          if(code==='APIFY_CONNECTION_UNAVAILABLE')return json(res,503,{error:code});
          if(['APIFY_KEY_NOT_VERIFIED','PROVIDER_ACCOUNT_ALREADY_LINKED','ACCOUNT_HAS_UNSETTLED_JOBS','ORG_NOT_READY'].includes(code))return json(res,409,{error:code});
          if(code==='GMAIL_RECONNECT_FORBIDDEN')return json(res,403,{error:code});
          if(['GMAIL_RECONNECT_VERSION_CONFLICT','GMAIL_RECONNECT_ACCOUNT_MISMATCH','GMAIL_RECONNECT_IDENTITY_REVIEW_REQUIRED'].includes(code))return json(res,409,{error:code});
          if(code==='SENDER_BIND_REJECTED')return json(res,409,{error:code});
          if(code==='SENDER_CHANGE_REJECTED')return json(res,409,{error:code});
          if(['SMTP_REQUEST_CONFLICT','SMTP_ORG_UNAVAILABLE','SMTP_VERSION_CONFLICT','SMTP_REPLACEMENT_REJECTED'].includes(code))return json(res,409,{error:code});
          if(code==='SMTP_SETUP_REQUIRED')return json(res,503,{error:code});
          if(code==='STRATEGY_REQUEST_REJECTED')return json(res,409,{error:code});
          if(['CAMPAIGN_VERSION_CONFLICT','CAMPAIGN_BENEFIT_RULE_REVIEW_REQUIRED'].includes(code))return json(res,409,{error:code});
          if(code==='CAMPAIGN_NOT_FOUND')return json(res,404,{error:code});
          if(['STRATEGY_SERVICE_UNAVAILABLE','STRATEGY_PROCESSING_PAUSED','STRATEGY_AI_ALLOWANCE_REQUIRED','STRATEGY_AI_LIMIT_REACHED','STRATEGY_MODE_UNSUPPORTED','STRATEGY_CAMPAIGN_NOT_FOUND','STRATEGY_READINESS_UNCONFIRMED'].includes(code))return json(res,409,{error:code});
          if(code==='EMAIL_BATCH_NOT_AVAILABLE')return json(res,404,{error:code});
          if(['EMAIL_BATCH_CHANGED','EMAIL_BATCH_START_DISABLED','EMAIL_BATCH_EXPIRED','EMAIL_BATCH_BUSY'].includes(code))return json(res,409,{error:code});
          if(['CAMPAIGN_AUTHORITY_CHANGED','CAMPAIGN_AUTHORITY_NOT_READY','CAMPAIGN_AUTHORITY_ACK_REQUIRED','CAMPAIGN_AUTHORITY_REJECTED','CAMPAIGN_AUTHORITY_SETUP_REQUIRED','CAMPAIGN_AUTOMATION_START_DISABLED'].includes(code))return json(res,409,{error:code});
          if(['CALLING_CALENDAR_NOT_AVAILABLE','CALLING_ACTIVE_OR_UNCERTAIN'].includes(code))return json(res,409,{error:code});
          if(code==='LINKEDIN_ACTION_REJECTED')return json(res,409,{error:code,reason:error.reason});
          if(['WHATSAPP_SIGNUP_SETUP_REQUIRED','WHATSAPP_SIGNUP_ORIGIN_REQUIRED','WHATSAPP_SIGNUP_RESULT_REJECTED'].includes(code))return json(res,409,{error:code});
          if(['WHATSAPP_CHECK_BUSY','WHATSAPP_CHECK_UNAVAILABLE'].includes(code))return json(res,409,{error:code});
          if(['SMS_LOGIN_REJECTED','SMS_DEVICE_LOOKUP_UNAVAILABLE'].includes(code))return json(res,409,{error:code});
          if(['SMS_CONNECTION_EXISTS','SMS_CONNECTION_CHANGED','SMS_CONNECTION_NOT_READY','SMS_CALLBACK_SETUP_REQUIRED','SMS_CALLBACK_NOT_READY','SMS_DEVICE_NOT_VERIFIED','SMS_PLAN_NOT_READY','SMS_PLAN_CHANGED','SMS_RECIPIENT_STOPPED','SMS_RELEASE_CONFLICT','SMS_ALREADY_IN_FLIGHT'].includes(code))return json(res,409,{error:code});
          if(code==='FACEBOOK_MANUAL_BLOCKED')return json(res,409,{error:code});
          if(code==='WHATSAPP_MANUAL_BLOCKED')return json(res,409,{error:code});
          if(code==='WHATSAPP_ACTION_REJECTED')return json(res,409,{error:code});
          if(['WORKSPACE_REQUEST_CONFLICT','WORKSPACE_ACCESS_REVIEW_REQUIRED','WORKSPACE_MEMBERSHIP_EXISTS'].includes(code))return json(res,409,{error:code});
          if(['CALLING_REQUEST_CONFLICT','CALLING_ACCOUNT_CHANGED','CALLING_ACCOUNT_NOT_CONNECTED','CALLING_CHANNEL_REQUIRED','CALLING_ACCOUNT_KEY_REQUIRED'].includes(code))return json(res,409,{error:code});
          if(code==='CALLING_ACCOUNT_NOT_VERIFIED'){const reason=['CALLING_API_KEY_REJECTED','CALLING_AGENT_NOT_FOUND','CALLING_VERSION_NOT_AVAILABLE','CALLING_VERSION_NOT_PUBLISHED','CALLING_NUMBER_NOT_FOUND','CALLING_LOOKUP_UNAVAILABLE'].includes(error.publicReason)?error.publicReason:'CALLING_LOOKUP_UNAVAILABLE';return json(res,409,{error:code,reason});}
          if(['CALLING_ACCOUNT_EXISTS','CALLING_ACCOUNT_ALREADY_LINKED'].includes(code))return json(res,409,{error:code});
          if(code==='ROLE_REQUIRED')return json(res,403,{error:'ROLE_REQUIRED'});
          if(['PREVIEW_EXPIRED','ORG_NOT_READY','REQUEST_ID_CONFLICT','PLATFORM_NOT_CONFIGURED','BYOK_NOT_CONNECTED','ORG_QUEUE_FULL','PROVIDER_BUDGET_EXHAUSTED','PRICE_CONFIRMATION_REQUIRED','INSUFFICIENT_PLATFORM_CREDITS','INVALID_REQUEST'].includes(code))return json(res,409,{error:code});
          if(['AUTHENTICATION_FAILED','AUTHENTICATION_REQUIRED'].includes(code))return json(res,401,{error:'AUTHENTICATION_FAILED'});
          if(['previewLeadImport','commitLeadImport'].includes(action))return json(res,503,{error:action==='commitLeadImport'?'CSV_IMPORT_UNCONFIRMED':'CSV_PREVIEW_UNAVAILABLE'});
          if(action)return json(res,503,{error:action==='draftBatchAction'?'DRAFT_BATCH_UNCONFIRMED':action==='checkCallingPreflight'?'CALLING_CHECK_UNCONFIRMED':action==='callingBindingAction'?'CALLING_ACCOUNT_UNCONFIRMED':action==='connectCallingAccount'?'CALLING_ACCOUNT_UNCONFIRMED':action==='createWorkspace'?'WORKSPACE_CREATION_UNCONFIRMED':action==='smsAction'?'SMS_ACTION_UNCONFIRMED':action==='prepareManualFacebook'?'FACEBOOK_MANUAL_UNAVAILABLE':action==='prepareManualWhatsApp'?'WHATSAPP_MANUAL_UNAVAILABLE':action==='checkWhatsAppSender'?'WHATSAPP_CHECK_UNCONFIRMED':['beginWhatsAppSignup','completeWhatsAppSignup'].includes(action)?'WHATSAPP_SIGNUP_UNCONFIRMED':['reviewWhatsApp','manageWhatsApp'].includes(action)?'WHATSAPP_WRITE_UNCONFIRMED':action==='saveCallingSettings'?'CALLING_SETTINGS_WRITE_UNCONFIRMED':['linkedinEvent','linkedinPrepare'].includes(action)?'LINKEDIN_WRITE_UNCONFIRMED':['previewCampaignAuthority','changeCampaignAuthority','controlCampaignAuthority'].includes(action)?'CAMPAIGN_AUTHORITY_WRITE_UNCONFIRMED':action==='controlEmailBatch'?'EMAIL_BATCH_CONTROL_UNCONFIRMED':action==='replaceSmtp'?'SMTP_REPLACEMENT_UNCONFIRMED':action==='connectSmtp'?'SMTP_CONNECTION_UNCONFIRMED':['beginGmail','beginReconnectGmail','finishGmail','reconcileGmail'].includes(action)?'GMAIL_CONNECTION_UNCONFIRMED':action==='bindSender'?'SENDER_BIND_UNCONFIRMED':action==='connectApify'?'APIFY_CONNECTION_UNCONFIRMED':['prepareApify','reconcileApify'].includes(action)?'APIFY_RECOVERY_UNAVAILABLE':action==='manageSender'?'SENDER_CHANGE_UNCONFIRMED':action==='approvePlan'?'APPROVAL_UNCONFIRMED':action==='requestStrategy'?'STRATEGY_REQUEST_UNCONFIRMED':action==='saveCampaign'?'CAMPAIGN_SAVE_UNCONFIRMED':action==='submit'?'SUBMISSION_UNCONFIRMED':'PREVIEW_UNAVAILABLE'});
          return json(res,['AUTHENTICATION_FAILED','AUTHENTICATION_REQUIRED'].includes(code)?401:503,{error:['AUTHENTICATION_FAILED','AUTHENTICATION_REQUIRED'].includes(code)?'AUTHENTICATION_FAILED':'ACCESS_UNAVAILABLE'});
        }finally{clearTimeout(timer);}
      }
      if(url.pathname.startsWith('/dashboard-api/')||url.pathname.startsWith('/webhook/'))return json(res,503,{error:'DATA_AND_ACTION_ROUTES_NOT_CONNECTED'});
      let decoded;try{decoded=decodeURIComponent(url.pathname);}catch{return json(res,400,{error:'INVALID_PATH'});}
      if(decoded.includes('\0')||decoded.includes('\\'))return json(res,400,{error:'INVALID_PATH'});
      let file=path.resolve(root,'.'+decoded);
      if(file!==root&&!file.startsWith(root+path.sep))return json(res,403,{error:'PATH_NOT_ALLOWED'});
      const page=pageMetadata.getPage(decoded),documentRequest=page.found||req.headers['sec-fetch-dest']==='document'||String(req.headers.accept||'').includes('text/html');
      const isAsset=decoded.startsWith('/static/')||decoded.startsWith('/brand/')||decoded.startsWith('/fonts/')||/\.(?:js|css|json|png|jpg|svg|ico|woff2?|ttf|map|txt|xml)$/.test(decoded);
      if(page.found||documentRequest&&!isAsset){
        let html;try{html=await fs.readFile(path.join(root,'index.html'),'utf8');}catch{res.writeHead(503,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Retry-After':'30'});return res.end(req.method==='HEAD'?undefined:pageMetadata.unavailable());}
        const rendered=pageMetadata.render(html,decoded,publicSite),status=page.found?200:404;
        res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':page.indexable&&publicSite.indexing?'index, follow':'noindex, nofollow'});
        return res.end(req.method==='HEAD'?undefined:rendered);
      }
      const extension=path.extname(file).toLowerCase();
      const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.txt':'text/plain','.ttf':'font/ttf','.woff':'font/woff','.woff2':'font/woff2'}[extension];
      if(!mime)return json(res,404,{error:'NOT_FOUND'});
      let bytes;try{bytes=await fs.readFile(file);}catch{return json(res,404,{error:'NOT_FOUND'});}
      // Unlisted HTML files never become alternate indexable entry points.
      res.writeHead(200,{'Content-Type':mime,'Content-Length':bytes.length,'Cache-Control':extension==='.html'?'no-store':/^\/static\/(?:js|css|assets)\/[^/]+\.[a-f0-9]{8,}\.(?:chunk\.)?(?:js|css|woff2?|ttf|png|svg|jpg)$/.test(decoded)?'public, max-age=31536000, immutable':extension==='.json'?'no-cache':'public, max-age=3600',...(extension==='.html'?{'X-Robots-Tag':'noindex, nofollow'}:{})});
      res.end(req.method==='HEAD'?undefined:bytes);
    }catch{if(!res.headersSent)json(res,503,{error:'SERVICE_UNAVAILABLE'});else res.end();}
  });
  server.requestTimeout=25000;server.headersTimeout=10000;server.maxHeadersCount=50;server.maxRequestsPerSocket=100;
  return server;
}
module.exports={createServer};
