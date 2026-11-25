import React,{act}from'react';
import{createRoot}from'react-dom/client';
import ReconnectGmail from'./ReconnectGmail';
import{useAuth}from'../context/AuthContext';
import{beginReconnectGmail,finishGmail,reconcileGmail}from'../api/client';
jest.mock('../context/AuthContext',()=>({useAuth:jest.fn()}));
jest.mock('../api/client',()=>({beginReconnectGmail:jest.fn(),finishGmail:jest.fn(),reconcileGmail:jest.fn()}));
let root,container,refresh;const connection={connection_id:'gmail_fixture',version:3,can_reconnect:true},key='lg_gmail_reconnect_fixture_7_gmail_fixture',state='a'.repeat(43);
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();sessionStorage.clear();refresh=jest.fn();useAuth.mockReturnValue({user:{subject:'fixture'},organization:{org_id:7,role:'owner'}});container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
async function render(c=connection){await act(async()=>root.render(<ReconnectGmail connection={c} refresh={refresh}/>));}
test('begin requires acknowledgement and sends the exact target/version without enrolling another sender',async()=>{
 beginReconnectGmail.mockRejectedValue({response:{status:409}});await render();const button=container.querySelector('button');expect(button.disabled).toBe(true);await act(async()=>container.querySelector('input').click());await act(async()=>{button.click();button.click();});expect(beginReconnectGmail).toHaveBeenCalledTimes(1);expect(beginReconnectGmail).toHaveBeenCalledWith({connection_id:'gmail_fixture',expected_version:3,acknowledge_reconnect:true});
});
test('finish consumes only the saved OAuth state and explains the required campaign rebind',async()=>{
 sessionStorage.setItem(key,JSON.stringify({state,version:3,phase:'authorization'}));finishGmail.mockResolvedValue({reconnected:true,connection_id:'gmail_fixture',execution_authorized:false,campaign_rebind_required:true});await render();await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Finish Gmail reauthorization').click());expect(finishGmail).toHaveBeenCalledWith(state);expect(sessionStorage.getItem(key)).toBeNull();expect(container.textContent).toContain('re-select this sender');expect(refresh).toHaveBeenCalled();
});
test('uncertain completion never retries tokens; fresh consent needs explicit server reconciliation',async()=>{
 sessionStorage.setItem(key,JSON.stringify({state,version:3,phase:'authorization'}));finishGmail.mockRejectedValue(Error('timeout'));await render();await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Finish Gmail reauthorization').click());expect(container.textContent).toContain('result uncertain');expect(container.textContent).not.toContain('Finish Gmail reauthorization');reconcileGmail.mockResolvedValue({safe_to_restart:true,outcome_confirmed:false});await act(async()=>container.querySelector('button').click());expect(reconcileGmail).toHaveBeenCalledWith(state,{connection_id:'gmail_fixture'});expect(finishGmail).toHaveBeenCalledTimes(1);expect(container.textContent).toContain('outcome was not confirmed');expect(sessionStorage.length).toBe(0);
});
test('accounts without reconnect permission expose no OAuth action',async()=>{await render({...connection,can_reconnect:false});expect(container.textContent).toBe('');expect(beginReconnectGmail).not.toHaveBeenCalled();});

test('a server-reported uncertain result keeps the saved authorization for reconciliation',async()=>{
 sessionStorage.setItem(key,JSON.stringify({state,version:3,phase:'authorization'}));finishGmail.mockRejectedValue({response:{status:409,data:{error:'GMAIL_CONNECTION_UNCONFIRMED'}}});await render();await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Finish Gmail reauthorization').click());
 expect(JSON.parse(sessionStorage.getItem(key)).phase).toBe('uncertain');expect(container.textContent).not.toContain('Finish Gmail reauthorization');expect(beginReconnectGmail).not.toHaveBeenCalled();
});
