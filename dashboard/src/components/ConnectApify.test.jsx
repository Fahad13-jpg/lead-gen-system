import React,{act}from'react';
import{createRoot}from'react-dom/client';
import ConnectApify from'./ConnectApify';
import{useAuth}from'../context/AuthContext';
import{connectApify,prepareApify,reconcileApify}from'../api/client';
jest.mock('../context/AuthContext',()=>({useAuth:jest.fn()}));
jest.mock('../api/client',()=>({connectApify:jest.fn(),prepareApify:jest.fn(),reconcileApify:jest.fn()}));
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();sessionStorage.clear();prepareApify.mockResolvedValue({recovery_token:'signed_reference'});reconcileApify.mockResolvedValue({configuration_matches:false});useAuth.mockReturnValue({user:{subject:'fixture'},organization:{org_id:7,role:'owner'}});container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
test('uncertain key submission stores only a recovery reference and does not retry',async()=>{
 connectApify.mockRejectedValue(Error('timeout'));await act(async()=>root.render(<ConnectApify refresh={()=>{}}/>));
 await act(async()=>{const input=container.querySelector('input[type=password]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'apify_api_fixture');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>container.querySelector('input[type=checkbox]').click());await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(connectApify).toHaveBeenCalledTimes(1);expect(connectApify).toHaveBeenCalledWith('apify_api_fixture','signed_reference');expect(container.querySelector('input[type=password]')).toBeNull();expect(JSON.parse(sessionStorage.getItem('lg_apify_change_fixture_7'))).toEqual({recovery_token:'signed_reference'});expect(sessionStorage.getItem('lg_apify_change_fixture_7')).not.toContain('apify_api_fixture');expect(container.textContent).toContain('awaiting confirmation');
});
test('members cannot submit organization keys',async()=>{
 useAuth.mockReturnValue({user:{subject:'fixture'},organization:{org_id:7,role:'member'}});await act(async()=>root.render(<ConnectApify refresh={()=>{}}/>));expect(container.querySelector('form')).toBeNull();expect(connectApify).not.toHaveBeenCalled();
});
test('explicit replacement clears a stale marker without resubmitting a key',async()=>{
 sessionStorage.setItem('lg_apify_change_fixture_7','pending');
 await act(async()=>root.render(<ConnectApify refresh={()=>{}}/>));
 const replace=[...container.querySelectorAll('button')].find(b=>b.textContent==='Enter a replacement key');
 await act(async()=>replace.click());
 expect(sessionStorage.getItem('lg_apify_change_fixture_7')).toBeNull();
 expect(container.querySelector('input[type=password]').value).toBe('');
 expect(container.querySelector('input[type=checkbox]').checked).toBe(false);
 expect(container.querySelector('button[type=submit]').disabled).toBe(true);
 expect(connectApify).not.toHaveBeenCalled();
 expect(container.textContent).toContain('previous request has not been repeated');
});

async function submitKey(){
 await act(async()=>{const input=container.querySelector('input[type=password]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'apify_api_fixture');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>container.querySelector('input[type=checkbox]').click());await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
}
test('a lost response resolves the matching saved key with one read and no repeated connection',async()=>{
 connectApify.mockRejectedValue(Error('timeout'));reconcileApify.mockResolvedValue({configuration_matches:true,enabled:true});const refresh=jest.fn();await act(async()=>root.render(<ConnectApify refresh={refresh}/>));await submitKey();
 expect(connectApify).toHaveBeenCalledTimes(1);expect(reconcileApify).toHaveBeenCalledTimes(1);expect(sessionStorage.getItem('lg_apify_change_fixture_7')).toBeNull();expect(container.textContent).toContain('Your submitted key is saved');expect(container.textContent).toContain('live provider check was not confirmed');expect(refresh).toHaveBeenCalledTimes(1);
});
test('reload recovers an existing reference without asking for a key or sending another connection request',async()=>{
 sessionStorage.setItem('lg_apify_change_fixture_7',JSON.stringify({recovery_token:'saved_reference'}));reconcileApify.mockResolvedValue({configuration_matches:true,enabled:false});await act(async()=>root.render(<ConnectApify refresh={()=>{}}/>));
 expect(reconcileApify).toHaveBeenCalledWith('saved_reference');expect(connectApify).not.toHaveBeenCalled();expect(prepareApify).not.toHaveBeenCalled();expect(container.textContent).toContain('account remains disabled');
});
test('failed recovery preparation never starts the connection write',async()=>{
 prepareApify.mockRejectedValue(Error('unavailable'));await act(async()=>root.render(<ConnectApify refresh={()=>{}}/>));await submitKey();expect(connectApify).not.toHaveBeenCalled();expect(sessionStorage.getItem('lg_apify_change_fixture_7')).toBeNull();expect(container.textContent).toContain('No connection request was submitted');
});
test('organization change during preparation cannot submit the old key into the new workspace',async()=>{
 let done;prepareApify.mockImplementation(()=>new Promise(resolve=>done=resolve));await act(async()=>root.render(<ConnectApify refresh={()=>{}}/>));await submitKey();
 useAuth.mockReturnValue({user:{subject:'fixture'},organization:{org_id:8,role:'owner'}});await act(async()=>root.render(<ConnectApify refresh={()=>{}}/>));await act(async()=>done({recovery_token:'old_workspace_reference'}));
 expect(connectApify).not.toHaveBeenCalled();expect(sessionStorage.getItem('lg_apify_change_fixture_8')).toBeNull();
});
