import React,{act}from'react';
import{createRoot}from'react-dom/client';
import SenderActions from'./SenderActions';
import{useAuth}from'../context/AuthContext';
import{manageSender}from'../api/client';
jest.mock('../context/AuthContext',()=>({useAuth:jest.fn()}));
jest.mock('../api/client',()=>({manageSender:jest.fn()}));
let root,container;const connection={connection_id:'fixture',version:2,can_manage:true};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();sessionStorage.clear();useAuth.mockReturnValue({user:{subject:'fixture'},organization:{org_id:7}});container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
test('changing availability requires confirmation and sends the displayed version once',async()=>{
 manageSender.mockResolvedValue({state:'disabled'});const refresh=jest.fn();await act(async()=>root.render(<SenderActions connection={connection} refresh={refresh}/>));const button=[...container.querySelectorAll('button')].find(b=>b.textContent==='Confirm connection change');expect(button.disabled).toBe(true);
 await act(async()=>container.querySelector('input').click());await act(async()=>{button.click();button.click();});expect(manageSender).toHaveBeenCalledTimes(1);expect(manageSender).toHaveBeenCalledWith({connection_id:'fixture',expected_version:2,action:'pause'});expect(refresh).toHaveBeenCalled();
});
test('uncertain changes are not retried and read-only senders have no action controls',async()=>{
 manageSender.mockRejectedValue(Error('timeout'));await act(async()=>root.render(<SenderActions connection={connection} refresh={()=>{}}/>));await act(async()=>container.querySelector('input').click());await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Confirm connection change').click());expect(container.textContent).toContain('awaiting confirmation');expect(manageSender).toHaveBeenCalledTimes(1);
 await act(async()=>root.render(<SenderActions connection={{...connection,can_manage:false}} refresh={()=>{}}/>));expect(container.querySelector('button')).toBeNull();
});
