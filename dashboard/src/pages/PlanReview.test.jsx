import React,{act}from'react';
import{createRoot}from'react-dom/client';
import{MemoryRouter,Routes,Route}from'react-router-dom';
import PlanReview from'./PlanReview';
import{getPlans}from'../api/client';
jest.mock('../api/client',()=>({getPlans:jest.fn()}));
jest.mock('../components/DraftPreparation',()=>()=>null);
jest.mock('../components/PlanApproval',()=>()=>null);
jest.mock('../components/CampaignSender',()=>()=> <p>Email sender controls</p>);
jest.mock('../components/CampaignEmailControl',()=>()=>null);
jest.mock('../components/EmailBatchReview',()=>()=>null);
jest.mock('../components/ReleasedEmailBatches',()=>()=>null);
jest.mock('../components/EmailFollowups',()=>()=>null);
jest.mock('../components/CampaignAutomation',()=>()=>null);
jest.mock('../components/LinkedInTasks',()=>({PrepareLinkedInTask:()=>null}));
jest.mock('../components/CallingCalendar',()=>()=>null);
jest.mock('../components/CallingBinding',()=>()=> <p>Calling account controls</p>);
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
async function render(){await act(async()=>root.render(<MemoryRouter initialEntries={['/campaigns/1']} future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Routes><Route path="/campaigns/:campaignId" element={<PlanReview/>}/></Routes></MemoryRouter>));}
test('saved approval does not hide expiry, old versions or fallback acknowledgement',async()=>{
 getPlans.mockResolvedValue({found:true,current_version:2,total:1,page:1,limit:10,observed_at:new Date().toISOString(),plans:[{id:'9',lead_id:167,campaign_version:1,expired:true,approval_action:'approve',approval_hash_matches:true,integrity_matches:true,state:'template_fallback',fallback_acknowledgement_required:true,fit_notes:[],blocking_reasons:[],validation_errors:[],review_flags:[],channel_plan:[],followups:[],step1:{channel:'email',parts:[{type:'observed',ref:'fact_1',text:'<img src=x onerror=alert(1)>'}]}}]});
 await render();expect(container.textContent).toContain('Older campaign version');expect(container.textContent).toContain('Expired');expect(container.textContent).toContain('Approval recorded');expect(container.textContent).toContain('explicit acknowledgement');expect(container.textContent).toContain('Reference: fact_1');expect(container.querySelector('img')).toBeNull();
});
test('missing campaign displays no protected plans',async()=>{
 getPlans.mockResolvedValue({found:false});await render();expect(container.textContent).toContain('Campaign not available');expect(container.querySelector('.pr-plan')).toBeNull();
});
test('known SMS-only campaigns omit unrelated account controls',async()=>{
 getPlans.mockResolvedValue({found:true,current_version:1,campaign_name:'SMS introduction',configured_channels:['sms'],total:0,page:1,limit:10,plans:[]});
 await render();expect(container.textContent).toContain('SMS introduction');expect(container.textContent).not.toContain('Email sender controls');expect(container.textContent).not.toContain('Calling account controls');
});
test('missing channel metadata retains email controls while paid account controls stay locked',async()=>{
 getPlans.mockResolvedValue({found:true,current_version:1,total:0,page:1,limit:10,plans:[]});
 await render();expect(container.textContent).toContain('Email sender controls');expect(container.textContent).not.toContain('Calling account controls');expect(container.textContent).toContain('Package access not confirmed');
});
test('failed AI attempt shows its cause and real usage without displaying a draft or retrying',async()=>{
 getPlans.mockResolvedValue({found:true,current_version:3,total:1,page:1,limit:10,plans:[{id:'10',lead_id:449,campaign_version:3,state:'ai_failed',failure_reason:'MISSING_QUALITY_FLAG:weak_offer_fit',prompt_version:'strategy_v2.7',generation_details:{attempts:1,tokens:{total:2031},usage_complete:true},fit_notes:[],blocking_reasons:[],validation_errors:[],review_flags:[],channel_plan:[],followups:[],step1:null}]});
 await render();expect(container.textContent).toContain('AI draft was not accepted');expect(container.textContent).toContain('omitted a required fit or evidence review warning');expect(container.textContent).toContain('Tokens used: 2031');expect(container.textContent).toContain('No outgoing message saved');expect(getPlans).toHaveBeenCalledTimes(1);
});
test('older failure is collapsed only when the same business and campaign version has a newer draft',async()=>{
 const base={lead_id:476,company_name:'Smile Center Dental Clinic',campaign_version:4,fit_notes:[],blocking_reasons:[],validation_errors:[],review_flags:[],channel_plan:[],followups:[],step1:null};
 getPlans.mockResolvedValue({found:true,current_version:4,total:3,page:1,limit:10,plans:[{...base,id:'11',state:'ai_completed'},{...base,id:'10',state:'ai_failed'},{...base,id:'9',lead_id:477,state:'ai_failed'}]});
 await render();const history=container.querySelectorAll('.pr-attempt-history');expect(history).toHaveLength(1);expect(history[0].open).toBe(false);expect(history[0].querySelector('summary').textContent).toContain('Earlier failed attempt · Plan #10');expect(history[0].querySelector('summary').textContent).toContain('Newer draft #11');expect(getPlans).toHaveBeenCalledTimes(1);
});
