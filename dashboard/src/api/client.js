import axios from 'axios';

// A trusted gateway, not internal n8n webhooks. Mounting is pending.
const baseURL = '/dashboard-api';
const api = axios.create({ baseURL, timeout: 30000 });
let access = null, generation = 0;
export function configureAccess(value) { access = value; generation += 1; }
export async function fetchMembershipSession(token) {
  const result = await axios.get(`${baseURL}/session`, { timeout: 15000, headers: { Authorization: `Bearer ${token}` } });
  return result.data;
}
api.interceptors.request.use(async request => {
  const current = access, version = generation;
  if (!current || !Number.isSafeInteger(current.org_id) || current.org_id < 1 || typeof current.getToken !== 'function') throw Error('ORGANIZATION_ACCESS_REQUIRED');
  const token = await current.getToken();
  if (version !== generation || access !== current) throw Error('ACCESS_CHANGED');
  if (typeof token !== 'string' || !token) throw Error('SIGN_IN_REQUIRED');
  request.headers.Authorization = `Bearer ${token}`;
  request.params = request.method === 'get' ? { ...request.params, org_id: current.org_id } : undefined;
  if (request.method !== 'get') request.data = { ...request.data, org_id: current.org_id };
  request.accessGeneration = version;
  return request;
});
api.interceptors.response.use(response => {
  if (response.config.accessGeneration !== generation) throw Error('ACCESS_CHANGED');
  return response;
});
export const prepareApify = apify_api_key => api.post('/apify/prepare', { apify_api_key }).then(r=>r.data);
export const reconcileApify = recovery_token => api.post('/apify/reconcile', { recovery_token }).then(r=>r.data);
export const connectApify = (apify_api_key,recovery_token) => api.post('/apify/connect', { apify_api_key,...(recovery_token?{recovery_token}:{}) }).then(r => r.data);
export const startScraping = payload => api.post('/start-scraping', payload).then(r => r.data);
export const getStats = () => api.get('/api/stats').then(r => r.data);
export const getOverview = (days=30) => api.get('/api/overview',{params:{days}}).then(r=>r.data);
export const getCampaigns = (params={}) => api.get('/api/campaigns',{params}).then(r=>r.data);
export const getPipeline = () => api.get('/api/pipeline').then(r => r.data);
export const getLeads = (params = {}) => api.get('/api/leads', { params }).then(r => r.data);
export const getLeadDetail = lead_id => api.get('/api/lead-detail', { params: { lead_id } }).then(r => r.data);
export const getJobs = (params = {}) => api.get('/api/jobs',{params}).then(r => r.data);
export const getCleaningReviews = job_id => api.get('/api/cleaning-reviews',{params:{job_id}}).then(r => r.data);
export const skipCleaningReview = payload => api.post('/cleaning-review/skip',payload).then(r => r.data);
export const getAssessmentReviews = job_id => api.get('/api/assessment-reviews',{params:{job_id}}).then(r => r.data);
export const previewSearch = payload => api.post('/search/preview',payload).then(r=>r.data);
export const submitSearch = preview_token => api.post('/search/submit',{preview_token}).then(r=>r.data);
export const getSearchRequest = request_id => api.get('/api/search-request',{params:{request_id}}).then(r=>r.data);
export const getJobStatus = job_id => api.get('/api/job-status', { params: { job_id } }).then(r => r.data);
export const getLinkedIn = () => api.get('/api/linkedin-queue').then(r => r.data);
export const getAnalytics = () => api.get('/api/analytics').then(r => r.data);
export const getSalesQueue = () => api.get('/api/sales-queue').then(r => r.data);
export const getUserInfo = () => api.get('/api/user-info').then(r => r.data);
export const updateLeadStatus = (lead_id, action) => api.post('/api/leads/update-status', { lead_id, action }).then(r => r.data);

export const getPlans = params => api.get('/api/plans',{params}).then(r=>r.data);
export const getEmailPreflight = params => api.get('/api/email-preflight',{params}).then(r=>r.data);
export const getEmailBatches = campaign_id => api.get('/api/email-batches',{params:{campaign_id}}).then(r=>r.data);
export const getEmailFollowups = params => api.get('/api/email-followups',{params}).then(r=>r.data);
export const getCampaignAuthority = params => api.get('/api/campaign-authority',{params}).then(r=>r.data);
export const previewCampaignAuthority = payload => api.post('/campaign-authority/preview',payload).then(r=>r.data);
export const changeCampaignAuthority = payload => api.post('/campaign-authority/change',payload).then(r=>r.data);
export const controlCampaignAuthority = payload => api.post('/campaign-authority/control',payload).then(r=>r.data);
export const controlEmailBatch = payload => api.post('/email-batch/control',payload).then(r=>r.data);

export const createCampaign = config => api.post('/campaign/create',{config}).then(r=>r.data);
export const getCampaignPreferences = campaign_id => getCampaigns({campaign_id});
export const saveCampaignPreferences = payload => api.post('/campaign/create',payload).then(r=>r.data);

export const requestStrategy = payload => api.post('/strategy/request',payload).then(r=>r.data);
export const getStrategyRequest = request_id => api.get('/api/strategy-request',{params:{request_id}}).then(r=>r.data);

export const approvePlan = payload => api.post('/strategy/approval',payload).then(r=>r.data);

export const getOutreach = params => api.get('/api/outreach',{params}).then(r=>r.data);

export const getSettings = () => api.get('/api/settings').then(r=>r.data);

export const manageSender = payload => api.post('/sender/manage',payload).then(r=>r.data);

export const bindSender = payload => api.post('/sender/bind',payload).then(r=>r.data);

export const getGmailSetup = () => api.get('/gmail/status').then(r=>r.data);
export const beginGmail = payload => api.post('/gmail/begin',payload).then(r=>r.data);
export const finishGmail = state => api.post('/gmail/finish',{state}).then(r=>r.data);
export const reconcileGmail = (state,target={}) => api.post('/gmail/reconcile',{state,...target}).then(r=>r.data);
export const beginReconnectGmail = payload => api.post('/gmail/reconnect/begin',payload).then(r=>r.data);
export const connectSmtp = payload => api.post('/smtp/connect',payload).then(r=>r.data);
export const replaceSmtp = payload => api.post('/smtp/replace',payload).then(r=>r.data);

export const getLinkedInReceipt=params=>api.get('/api/linkedin-receipt',{params}).then(r=>r.data);
export const reportLinkedInTask=payload=>api.post('/linkedin/event',payload).then(r=>r.data);
export const prepareLinkedInTask=payload=>api.post('/linkedin/prepare',payload).then(r=>r.data);

export const getCallingSettings=campaign_id=>api.get('/api/calling-settings',{params:{campaign_id}}).then(r=>r.data);
export const getCallingCalendars=campaign_id=>api.get('/api/calling-calendars',{params:{campaign_id}}).then(r=>r.data);
export const saveCallingSettings=payload=>api.post('/calling/settings',payload).then(r=>r.data);

export const getCallingPreview=campaign_id=>api.get('/api/calling-preview',{params:{campaign_id}}).then(r=>r.data);
export const getManualWhatsApp=lead_id=>api.get('/api/whatsapp-manual',{params:{lead_id}}).then(r=>r.data);
export const prepareManualWhatsApp=payload=>api.post('/whatsapp/manual/prepare',payload).then(r=>r.data);

export const getManualFacebook=lead_id=>api.get("/api/facebook-manual",{params:{lead_id}}).then(r=>r.data);
export const prepareManualFacebook=payload=>api.post("/facebook/manual/prepare",payload).then(r=>r.data);

export const getSms=()=>api.get("/api/sms").then(r=>r.data);
export const smsAction=(action,payload)=>api.post("/sms/"+action,payload).then(r=>r.data);

export const createWorkspace=(token,payload)=>axios.post(`${baseURL}/workspace/create`,payload,{timeout:30000,headers:{Authorization:`Bearer ${token}`}}).then(r=>r.data);
export const getWorkspaceCreation=(token,request_id)=>axios.get(`${baseURL}/workspace/status`,{timeout:30000,headers:{Authorization:`Bearer ${token}`},params:{request_id}}).then(r=>r.data);

export const getCallingAccount=()=>api.get("/api/calling-account").then(r=>r.data);
export const connectCallingAccount=payload=>api.post("/calling/account/connect",payload).then(r=>r.data);

export const getCallingBinding=campaign_id=>api.get("/api/calling-binding",{params:{campaign_id}}).then(r=>r.data);
export const getCallingAccountReceipt=request_id=>api.get("/api/calling-account-receipt",{params:{request_id}}).then(r=>r.data);
export const changeCallingAccount=payload=>api.post("/calling/account/change",payload).then(r=>r.data);
export const bindCallingAccount=payload=>api.post("/calling/account/bind",payload).then(r=>r.data);

export const getCallingPreflight=()=>api.get("/api/calling-preflight").then(r=>r.data);
export const checkCallingPreflight=expected_account_version=>api.post("/calling/account/check",{expected_account_version}).then(r=>r.data);

export const getWorkspacePackage = () => api.get('/api/package').then(r=>r.data);

export const previewLeadImport=body=>api.post('/leads/import/preview',body).then(r=>r.data);
export const commitLeadImport=body=>api.post('/leads/import/commit',body).then(r=>r.data);
export const getLeadImports=(params={})=>api.get('/api/lead-imports',{params}).then(r=>r.data);
export const getLeadExport=({signal,...params})=>api.get('/api/lead-export',{params,signal}).then(r=>r.data);

export const previewDraftGroup=payload=>api.post('/strategy/group/preview',payload,{timeout:65000}).then(r=>r.data);
export const prepareDraftGroup=payload=>api.post('/strategy/group/prepare',payload,{timeout:65000}).then(r=>r.data);
export const getDraftGroup=payload=>api.post('/strategy/group/status',payload,{timeout:65000}).then(r=>r.data);
export const previewGroupApproval=payload=>api.post('/strategy/group/approval-preview',payload,{timeout:65000}).then(r=>r.data);
export const approveDraftGroup=payload=>api.post('/strategy/group/approve',payload,{timeout:65000}).then(r=>r.data);
