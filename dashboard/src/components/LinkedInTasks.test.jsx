import React,{act}from'react';
import{createRoot}from'react-dom/client';
import LinkedInTasks,{PrepareLinkedInTask}from'./LinkedInTasks';
import{useAuth}from'../context/AuthContext';
import{getLinkedIn,getLinkedInReceipt,reportLinkedInTask,prepareLinkedInTask}from'../api/client';
jest.mock('../context/AuthContext',()=>({useAuth:jest.fn()}));
jest.mock('../api/client',()=>({getLinkedIn:jest.fn(),getLinkedInReceipt:jest.fn(),reportLinkedInTask:jest.fn(),prepareLinkedInTask:jest.fn()}));
const h='c'.repeat(32),event_id='12345678-1234-1234-1234-123456789abc',task={activity_id:9,plan_id:'12',step:'1',content_hash:h,state:'ready',profile_url:'https://www.linkedin.com/in/owner/',manual_action_due:true,can_manage:true};
let root,container,tab;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.resetAllMocks();sessionStorage.clear();useAuth.mockReturnValue({user:{subject:'fixture'},organization:{org_id:7,role:'owner'}});Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:jest.fn(()=>event_id)}});tab={opener:{},closed:false,location:{href:'about:blank'},close:jest.fn()};window.open=jest.fn(()=>tab);Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:jest.fn().mockResolvedValue(undefined)}});getLinkedIn.mockResolvedValue({items:[task],manual_only:true,execution_authorized:false,limit:100});container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
const button=t=>[...container.querySelectorAll('button')].find(b=>b.textContent===t);
async function render(element=<LinkedInTasks/>){await act(async()=>root.render(element));}
async function choose(value){await act(async()=>{const select=container.querySelector('select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,value);select.dispatchEvent(new Event('change',{bubbles:true}));});}
test('queue mounts read-only and exposes a user-initiated checked profile link',async()=>{await render();expect(reportLinkedInTask).not.toHaveBeenCalled();expect(prepareLinkedInTask).not.toHaveBeenCalled();expect(container.querySelector('a').href).toBe(task.profile_url);expect(container.querySelector('a').rel).toBe('noopener noreferrer');expect(button('Save my report').disabled).toBe(true);});
test('copy uses the confirmed approved text and never reports a sent outcome',async()=>{reportLinkedInTask.mockResolvedValue({saved:true,event_id,activity_id:9,action:'copy_note',copy_text:'<img src=x> Hello',provider_verified:false,execution_authorized:false});await render();await act(async()=>button('Copy note & open LinkedIn').click());expect(reportLinkedInTask).toHaveBeenCalledWith({activity_id:9,content_hash:h,event_id,action:'copy_note',confirmed_by_customer:true});expect(container.querySelector('textarea[readonly]').value).toBe('<img src=x> Hello');expect(container.querySelector('img')).toBeNull();expect(sessionStorage.length).toBe(0);});
test('uncertain outcome persists a no-repeat gate and reconciles only the same event/action',async()=>{reportLinkedInTask.mockRejectedValue(Error('timeout'));await render();await choose('request_sent');await act(async()=>container.querySelector('input[type=checkbox]').click());await act(async()=>button('Save my report').click());expect(sessionStorage.length).toBe(1);expect(button('Save my report').matches(':disabled')).toBe(true);getLinkedInReceipt.mockResolvedValue({recorded:true,activity_id:9,action:'accepted'});await act(async()=>button('Refresh LinkedIn tasks').click());expect(sessionStorage.length).toBe(1);getLinkedInReceipt.mockResolvedValue({recorded:true,activity_id:9,action:'request_sent'});await act(async()=>button('Refresh LinkedIn tasks').click());expect(sessionStorage.length).toBe(0);expect(reportLinkedInTask).toHaveBeenCalledTimes(1);expect(getLinkedInReceipt).toHaveBeenCalledWith({kind:'event',activity_id:9,content_hash:h,event_id,action:'request_sent'});});
test('preparation binds the approved plan hash and reconciles uncertainty without preparing twice',async()=>{const p={id:'12',content_hash:h,campaign_current:true,expired:false,integrity_matches:true,approval_action:'approve',approval_hash_matches:true,linkedin_manual:{profile_url:task.profile_url,steps:[{step:1,message:'Approved message',connection_note:'Hello',delay_days:0}]}};prepareLinkedInTask.mockRejectedValue(Error('timeout'));await render(<PrepareLinkedInTask plan={p}/>);await choose('1');await act(async()=>container.querySelector('input[type=checkbox]').click());await act(async()=>button('Add LinkedIn task').click());expect(prepareLinkedInTask).toHaveBeenCalledWith({plan_id:12,step:1,content_hash:h,acknowledge_manual_task:true});getLinkedInReceipt.mockResolvedValue({recorded:true,activity_id:9,execution_authorized:false});await act(async()=>button('Check saved LinkedIn task').click());expect(prepareLinkedInTask).toHaveBeenCalledTimes(1);expect(sessionStorage.length).toBe(0);expect(container.textContent).toContain('Task #9 is saved');});

const copyReply=action=>({saved:true,event_id,activity_id:9,action,copy_text:'Approved draft',provider_verified:false,execution_authorized:false});
test('combined action opens only the checked profile after receiving and copying approved text',async()=>{
 let resolve;reportLinkedInTask.mockReturnValue(new Promise(r=>{resolve=r;}));await render();
 await act(async()=>button('Copy note & open LinkedIn').click());
 expect(window.open).not.toHaveBeenCalled();expect(tab.location.href).toBe('about:blank');
 await act(async()=>resolve(copyReply('copy_note')));
 expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Approved draft');expect(window.open).toHaveBeenCalledWith('about:blank','_blank');expect(tab.opener).toBeNull();expect(tab.location.href).toBe(task.profile_url);expect(tab.close).not.toHaveBeenCalled();
 expect(reportLinkedInTask).toHaveBeenCalledTimes(1);expect(reportLinkedInTask.mock.calls[0][0].action).toBe('copy_note');expect(container.textContent).toContain('Nothing has been marked as sent');
});
test('accepted task combines copying the message and opening the profile without marking it sent',async()=>{
 getLinkedIn.mockResolvedValue({items:[{...task,state:'accepted'}],manual_only:true,execution_authorized:false});reportLinkedInTask.mockResolvedValue(copyReply('copy_message'));await render();
 await act(async()=>button('Copy message & open LinkedIn').click());expect(reportLinkedInTask.mock.calls[0][0].action).toBe('copy_message');expect(tab.location.href).toBe(task.profile_url);
});
test('blocked popup offers an explicit profile link after copying',async()=>{
 window.open.mockReturnValue(null);reportLinkedInTask.mockResolvedValue(copyReply('copy_note'));await render();await act(async()=>button('Copy note & open LinkedIn').click());
 const link=[...container.querySelectorAll('a')].find(a=>a.textContent==='Continue to LinkedIn');expect(link.href).toBe(task.profile_url);expect(link.rel).toBe('noopener noreferrer');expect(navigator.clipboard.writeText).toHaveBeenCalled();
});
test('clipboard denial provides selectable text and a profile link without opening a tab',async()=>{
 navigator.clipboard.writeText.mockRejectedValue(Error('denied'));reportLinkedInTask.mockResolvedValue(copyReply('copy_note'));await render();await act(async()=>button('Copy note & open LinkedIn').click());
 expect(window.open).not.toHaveBeenCalled();expect(tab.location.href).toBe('about:blank');expect(container.querySelector('textarea[readonly]').value).toBe('Approved draft');expect(container.textContent).toContain('Select and copy');expect(container.textContent).toContain('Continue to LinkedIn');
});
test('rejected or uncertain copy does not open a tab or repeat the action',async()=>{
 reportLinkedInTask.mockRejectedValue(Error('timeout'));await render();await act(async()=>button('Copy note & open LinkedIn').click());
 expect(window.open).not.toHaveBeenCalled();expect(tab.location.href).toBe('about:blank');expect(navigator.clipboard.writeText).not.toHaveBeenCalled();expect(container.textContent).not.toContain('Continue to LinkedIn');expect(reportLinkedInTask).toHaveBeenCalledTimes(1);
});
test('an untrusted destination cannot open a tab or submit a copy event',async()=>{
 getLinkedIn.mockResolvedValue({items:[{...task,profile_url:'https://evil.example/in/owner/'}],manual_only:true,execution_authorized:false});await render();await act(async()=>button('Copy note & open LinkedIn').click());expect(window.open).not.toHaveBeenCalled();expect(reportLinkedInTask).not.toHaveBeenCalled();
});
