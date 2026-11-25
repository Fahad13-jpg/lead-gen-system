import React,{act}from'react';
import{createRoot}from'react-dom/client';
import PlanApproval from'./PlanApproval';
import{useAuth}from'../context/AuthContext';
import{approvePlan}from'../api/client';
jest.mock('../context/AuthContext',()=>({useAuth:jest.fn()}));
jest.mock('../api/client',()=>({approvePlan:jest.fn()}));
let root,container;const plan={id:'9',content_hash:'a'.repeat(32),integrity_matches:true,expired:false,state:'template_fallback',version:'strategy_v2',validation_errors:[],blocking_reasons:[],fallback_acknowledgement_required:true};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();jest.clearAllMocks();useAuth.mockReturnValue({user:{subject:'fixture'},organization:{org_id:7,role:'owner'}});container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
test('approval needs content confirmation and explicit fallback acknowledgement',async()=>{
 approvePlan.mockResolvedValue({recorded:true});const refresh=jest.fn();await act(async()=>root.render(<PlanApproval plan={plan} refresh={refresh}/>));const button=[...container.querySelectorAll('button')].find(b=>b.textContent==='Approve message');expect(button.disabled).toBe(true);
 await act(async()=>container.querySelectorAll('input')[0].click());expect(button.disabled).toBe(true);await act(async()=>container.querySelectorAll('input')[1].click());expect(button.disabled).toBe(false);
 await act(async()=>{button.click();button.click();});expect(approvePlan).toHaveBeenCalledTimes(1);expect(approvePlan.mock.calls[0][0].content_hash).toBe(plan.content_hash);expect(approvePlan.mock.calls[0][0].acknowledge_fallback).toBe(true);expect(refresh).toHaveBeenCalled();
});
test('uncertain approval waits for refresh and is not retried',async()=>{
 approvePlan.mockRejectedValue(Error('timeout'));await act(async()=>root.render(<PlanApproval plan={{...plan,fallback_acknowledgement_required:false,state:'ai_completed'}} refresh={()=>{}}/>));await act(async()=>container.querySelector('input').click());await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Approve message').click());expect(container.textContent).toContain('Result uncertain');expect(approvePlan).toHaveBeenCalledTimes(1);
});
test('definitive rejection clears pending marker and requires review again',async()=>{
 approvePlan.mockRejectedValue({response:{status:409,data:{error:'APPROVAL_PLAN_BLOCKED'}}});const refresh=jest.fn();await act(async()=>root.render(<PlanApproval plan={{...plan,state:'ai_completed',fallback_acknowledgement_required:false}} refresh={refresh}/>));
 await act(async()=>container.querySelector('input').click());await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Approve message').click());expect(container.textContent).toContain('Approval was rejected');expect(container.textContent).not.toContain('Result uncertain');expect(sessionStorage.length).toBe(0);expect(refresh).toHaveBeenCalledTimes(1);expect(container.querySelector('input').checked).toBe(false);expect(approvePlan).toHaveBeenCalledTimes(1);
});
test('old campaign version blocks approval but permits revoking an existing approval',async()=>{
 approvePlan.mockResolvedValue({recorded:true});await act(async()=>root.render(<PlanApproval plan={{...plan,state:'ai_completed',fallback_acknowledgement_required:false,campaign_current:false,approval_action:'approve',approval_hash_matches:true}} refresh={()=>{}}/>));
 await act(async()=>container.querySelector('input').click());const buttons=[...container.querySelectorAll('button')];expect(buttons.find(b=>b.textContent==='Message approved').disabled).toBe(true);expect(buttons.find(b=>b.textContent==='Remove approval').disabled).toBe(false);await act(async()=>buttons.find(b=>b.textContent==='Remove approval').click());expect(approvePlan).toHaveBeenCalledWith(expect.objectContaining({action:'revoke'}));
});
