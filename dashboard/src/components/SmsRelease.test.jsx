import React,{act}from'react';
import{createRoot}from'react-dom/client';
import SmsRelease from'./SmsRelease';
import{getSms,smsAction}from'../api/client';
jest.mock('../context/AuthContext',()=>({useAuth:()=>({organization:{org_id:7,role:'owner'}})}));
jest.mock('../api/client',()=>({getSms:jest.fn(),smsAction:jest.fn()}));
let root,container;const plan={id:12,content_hash:'a'.repeat(32),campaign_current:true,integrity_matches:true,approval_action:'approve',approval_hash_matches:true,expired:false,sms_draft:{recipient:'+923001234567',segments:1}};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);getSms.mockResolvedValue({connection:{version:2,state:'ready'},items:[]});});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
async function render(p=plan){await act(async()=>root.render(<SmsRelease plan={p}/>));}
async function fill(){await act(async()=>{const input=container.querySelector('input[type="text"],input:not([type])');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Owned test recipient permission');input.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>container.querySelector('input[type="checkbox"]').click());}
test('release requires approved content, ready connection, permission reference and explicit send acknowledgement',async()=>{
 smsAction.mockResolvedValue({released:true,dispatch_id:'1'});await render();expect(smsAction).not.toHaveBeenCalled();expect(container.querySelector('button[type="submit"]').disabled).toBe(true);await fill();await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(smsAction).toHaveBeenCalledWith('release',expect.objectContaining({plan_id:12,content_hash:plan.content_hash,connection_version:2,acknowledge_real_sms:true}));
});
test('revoked plans and paused phones cannot queue SMS',async()=>{
 getSms.mockResolvedValue({connection:{version:2,state:'paused'},items:[]});await render({...plan,approval_action:'revoke'});expect(container.querySelector('fieldset').disabled).toBe(true);expect(smsAction).not.toHaveBeenCalled();
});
test('uncertain release blocks another submission and saved queue reconciles it',async()=>{
 smsAction.mockRejectedValue(Error('timeout'));await render();await fill();await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(container.querySelector('fieldset').disabled).toBe(true);expect(smsAction).toHaveBeenCalledTimes(1);getSms.mockResolvedValue({connection:{version:2,state:'ready'},items:[{id:1,plan_id:12,state:'accepted',segments:1}]});await act(async()=>container.querySelector('button').click());expect(container.textContent).toContain('accepted');expect(container.querySelector('form')).toBeNull();expect(smsAction).toHaveBeenCalledTimes(1);
});
