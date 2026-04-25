import axios from 'axios';

const api = axios.create({ baseURL: '/webhook', timeout: 180000 });

const uid = () => {
  try { return JSON.parse(localStorage.getItem('lg_user'))?.id || 1; }
  catch { return 1; }
};

// Auth
export const apiRegister = (email, password) =>
  api.post('/auth/register', { email, password }).then(r => r.data);

export const apiLogin = (email, password) =>
  api.post('/auth/login', { email, password }).then(r => r.data);

// Apify
export const connectApify = (apiKey) =>
  api.post('/connect-apify', { user_id: uid(), apify_api_key: apiKey }).then(r => r.data);

// Scraping
export const startScraping = (payload) =>
  api.post('/start-scraping', { ...payload, user_id: uid() }).then(r => r.data);

// Dashboard data
export const getStats      = () => api.get(`/api/stats?user_id=${uid()}`).then(r => r.data);
export const getPipeline   = () => api.get(`/api/pipeline?user_id=${uid()}`).then(r => r.data);
export const getLeads      = (params = {}) => api.get('/api/leads', { params: { user_id: uid(), ...params } }).then(r => r.data);
export const getLeadDetail = (leadId) => api.get(`/api/lead-detail?lead_id=${leadId}`).then(r => r.data);
export const getJobs       = () => api.get(`/api/jobs?user_id=${uid()}`).then(r => r.data);
export const getJobStatus  = (jobId) => api.get(`/api/job-status?user_id=${uid()}&job_id=${jobId}`).then(r => r.data);
export const getLinkedIn   = () => api.get(`/api/linkedin-queue?user_id=${uid()}`).then(r => r.data);
export const getAnalytics  = () => api.get(`/api/analytics?user_id=${uid()}`).then(r => r.data);
export const getSalesQueue = () => api.get(`/api/sales-queue?user_id=${uid()}`).then(r => r.data);
export const getUserInfo   = () => api.get(`/api/user-info?user_id=${uid()}`).then(r => r.data);

export const updateLeadStatus = (leadId, action) =>
  api.post('/api/leads/update-status', { lead_id: leadId, action }).then(r => r.data);