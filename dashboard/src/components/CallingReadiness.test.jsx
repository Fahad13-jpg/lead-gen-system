import React,{act}from'react';
import{createRoot}from'react-dom/client';
import CallingReadiness from'./CallingReadiness';
import{getCallingPreview}from'../api/client';
jest.mock('../api/client',()=>({getCallingPreview:jest.fn()}));
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.resetAllMocks();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
async function render(){await act(async()=>root.render(<CallingReadiness campaignId="3" version={4}/>));}
test('preview is explicitly requested and blocked reasons/uncertainty never become dial actions',async()=>{getCallingPreview.mockResolvedValue({version:4,preview_only:true,execution_authorized:false,plan_limit:10,step_limit:20,items:[{plan_id:'9',lead_id:167,step:1,company_name:'Clinic',plan_checks_passed:false,ready_for_release_review:false,reasons:['approval_required']}],active_or_uncertain:[{activity_id:12,state:'reconciliation_required'}]});await render();expect(getCallingPreview).not.toHaveBeenCalled();await act(async()=>container.querySelector('button').click());expect(getCallingPreview).toHaveBeenCalledWith('3');expect(container.textContent).toContain('approval required');expect(container.textContent).toContain('Automatic redial is blocked');expect(container.querySelectorAll('button')).toHaveLength(1);});
test('a newer campaign response is rejected rather than shown as current readiness',async()=>{getCallingPreview.mockResolvedValue({version:5,preview_only:true,execution_authorized:false,items:[],active_or_uncertain:[]});await render();await act(async()=>container.querySelector('button').click());expect(container.textContent).toContain('Refresh campaign settings');expect(container.textContent).not.toContain('No current call steps');});
