import React,{act}from'react';
import{createRoot}from'react-dom/client';
import RequestStrategy from'./RequestStrategy';
import{useAuth}from'../context/AuthContext';
import{getLeads,getJobs,getLeadImports,requestStrategy,getStrategyRequest}from'../api/client';
jest.mock('../context/AuthContext',()=>({useAuth:jest.fn()}));
jest.mock('../api/client',()=>({getLeads:jest.fn(),getJobs:jest.fn(),getLeadImports:jest.fn(),requestStrategy:jest.fn(),getStrategyRequest:jest.fn()}));
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;Object.defineProperty(window,'crypto',{configurable:true,value:require('crypto').webcrypto});jest.clearAllMocks();sessionStorage.clear();useAuth.mockReturnValue({user:{subject:'fixture'},organization:{org_id:7,role:'owner'}});getLeads.mockResolvedValue({leads:[{id:167,company_name:'Fixture clinic'}],observed_at:new Date().toISOString()});container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
test('generation requires confirmation, retains an uncertain request and reconciles without retry',async()=>{
 requestStrategy.mockRejectedValue(Error('timeout'));await act(async()=>root.render(<RequestStrategy campaignId="1" readiness={{generation_allowed:true,reasons:[],requests_remaining:5}}/>));expect(requestStrategy).not.toHaveBeenCalled();
 await act(async()=>{const select=container.querySelector('select[aria-label="Select business"]');select.value='167';select.dispatchEvent(new Event('change',{bubbles:true}));});
 const button=[...container.querySelectorAll('button')].find(b=>b.textContent==='Prepare draft');expect(button.disabled).toBe(true);
 await act(async()=>container.querySelector('input[type="checkbox"]').click());
 await act(async()=>{button.click();button.click();});expect(requestStrategy).toHaveBeenCalledTimes(1);expect(requestStrategy.mock.calls[0][0].request_id).toMatch(/^dash_[a-f0-9]{32}$/);
 getStrategyRequest.mockResolvedValue({found:true,job_id:'8',status:'completed',plan_id:'9'});
 await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Check request progress').click());expect(container.textContent).toContain('Saved plan #9');expect(requestStrategy).toHaveBeenCalledTimes(1);
});
test('paused zero-allowance generation cannot submit or create an uncertain lock',async()=>{
 await act(async()=>root.render(<RequestStrategy campaignId="1" readiness={{generation_allowed:false,reasons:['STRATEGY_PROCESSING_PAUSED','STRATEGY_AI_ALLOWANCE_REQUIRED'],requests_remaining:0}}/>));
 expect(container.textContent).toContain('Strategy processing is paused');expect(container.textContent).toContain('AI generation needs an enabled request allowance');
 expect([...container.querySelectorAll('button')].find(b=>b.textContent==='Prepare draft').disabled).toBe(true);
 await act(async()=>{const forms=container.querySelectorAll('form');forms[1].dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
 expect(requestStrategy).not.toHaveBeenCalled();expect(sessionStorage.length).toBe(0);
});
test('a server readiness rejection clears only the new unsent request marker',async()=>{
 requestStrategy.mockRejectedValue({response:{status:409,data:{error:'STRATEGY_AI_ALLOWANCE_REQUIRED'}}});
 await act(async()=>root.render(<RequestStrategy campaignId="1" readiness={{generation_allowed:true,reasons:[]}}/>));
 await act(async()=>{const select=container.querySelector('select[aria-label="Select business"]');select.value='167';select.dispatchEvent(new Event('change',{bubbles:true}));container.querySelector('input[type="checkbox"]').click();});
 await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Prepare draft').click());
 expect(requestStrategy).toHaveBeenCalledTimes(1);expect(sessionStorage.length).toBe(0);expect(container.textContent).toContain('AI generation needs an enabled request allowance');expect(container.textContent).not.toContain('Request awaiting confirmation');
});

test('choosing a search waits for its selection and requests only that search’s leads',async()=>{getJobs.mockResolvedValue({jobs:[{id:123,job_name:'Clinic search'}]});await act(async()=>root.render(<RequestStrategy campaignId="1" readiness={{generation_allowed:true,reasons:[]}}/>));const source=container.querySelector('.draft-fields select');await act(async()=>{source.value='search';source.dispatchEvent(new Event('change',{bubbles:true}));});expect(container.querySelector('select[aria-label="Select business"]').disabled).toBe(true);expect(container.textContent).toContain('Choose a search above');expect(getLeads).toHaveBeenCalledTimes(1);const search=container.querySelectorAll('.draft-fields select')[1];await act(async()=>{search.value='123';search.dispatchEvent(new Event('change',{bubbles:true}));});expect(getLeads).toHaveBeenLastCalledWith(expect.objectContaining({search_id:'123'}));expect(requestStrategy).not.toHaveBeenCalled();});
