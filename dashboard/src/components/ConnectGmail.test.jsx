import React,{act}from'react';
import{createRoot}from'react-dom/client';
import ConnectGmail from'./ConnectGmail';
import{useAuth}from'../context/AuthContext';
import{getGmailSetup,beginGmail,finishGmail,reconcileGmail}from'../api/client';
jest.mock('../context/AuthContext',()=>({useAuth:jest.fn()}));
jest.mock('../api/client',()=>({getGmailSetup:jest.fn(),beginGmail:jest.fn(),finishGmail:jest.fn(),reconcileGmail:jest.fn()}));
let root,container;const key='lg_gmail_signup_fixture_7';
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();sessionStorage.clear();useAuth.mockReturnValue({user:{subject:'fixture'},organization:{org_id:7,role:'owner'}});getGmailSetup.mockResolvedValue({available:true});container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
test('finish uses only server state and leaves the sender pending verification',async()=>{
 sessionStorage.setItem(key,'state_nonce');finishGmail.mockResolvedValue({org_id:7,connection_id:'gmail_'+'a'.repeat(32),state:'pending_check',execution_authorized:false});const refresh=jest.fn();await act(async()=>root.render(<ConnectGmail refresh={refresh}/>));await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Finish Gmail connection').click());expect(finishGmail).toHaveBeenCalledWith('state_nonce');expect(sessionStorage.getItem(key)).toBeNull();expect(container.textContent).toContain('account check is pending');expect(refresh).toHaveBeenCalled();
});
test('uncertain completion blocks another enrollment',async()=>{
 sessionStorage.setItem(key,'state_nonce');finishGmail.mockRejectedValue(Error('timeout'));await act(async()=>root.render(<ConnectGmail refresh={()=>{}}/>));await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Finish Gmail connection').click());expect(container.textContent).toContain('awaiting a saved result');expect(container.querySelector('button').textContent).toBe('Check connection status');expect(sessionStorage.getItem(key)).toBe('uncertain:state_nonce');
});
test('ready enrollment explains permission checks without claiming delivery or authorizing a campaign',async()=>{
 sessionStorage.setItem(key,'state_nonce');finishGmail.mockResolvedValue({org_id:7,connection_id:'gmail_'+'a'.repeat(32),state:'ready',execution_authorized:false});
 await act(async()=>root.render(<ConnectGmail refresh={()=>{}}/>));await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Finish Gmail connection').click());
 expect(container.textContent).toContain('Identity and granted email permissions checked');expect(container.textContent).toContain('delivery has not been tested');expect(container.textContent).toContain('campaign approval');expect(sessionStorage.getItem(key)).toBeNull();
});
test('recovery clears the browser lock only after server confirmation',async()=>{
 sessionStorage.setItem(key,'uncertain:state_nonce');reconcileGmail.mockResolvedValue({safe_to_restart:true});
 await act(async()=>root.render(<ConnectGmail refresh={()=>{}}/>));await act(async()=>container.querySelector('button').click());
 expect(reconcileGmail).toHaveBeenCalledWith('state_nonce');expect(sessionStorage.getItem(key)).toBeNull();expect(container.textContent).toContain('Connect Gmail with Google');
});
test('failed reconciliation preserves the lock',async()=>{
 sessionStorage.setItem(key,'uncertain:state_nonce');reconcileGmail.mockResolvedValue({safe_to_restart:false});
 await act(async()=>root.render(<ConnectGmail refresh={()=>{}}/>));await act(async()=>container.querySelector('button').click());
 expect(sessionStorage.getItem(key)).toBe('uncertain:state_nonce');expect(container.textContent).toContain('Connection still needs checking');expect(container.textContent).not.toContain('Connect Gmail with Google');
});


test('confirmed recovery clears the pending marker and shows the saved connection without another enrollment',async()=>{
 sessionStorage.setItem(key,'uncertain:state_nonce');reconcileGmail.mockResolvedValue({confirmed:true,org_id:7,connection_id:'gmail_'+'b'.repeat(32),state:'ready',execution_authorized:false});const refresh=jest.fn();
 await act(async()=>root.render(<ConnectGmail refresh={refresh}/>));await act(async()=>container.querySelector('button').click());
 expect(sessionStorage.getItem(key)).toBeNull();expect(container.textContent).toContain('Gmail connected');expect(container.textContent).not.toContain('awaiting a saved result');expect(container.textContent).toContain('Connect another account');expect(beginGmail).not.toHaveBeenCalled();expect(finishGmail).not.toHaveBeenCalled();expect(refresh).toHaveBeenCalledTimes(1);
});
test('starting over checks the old request on the server and never opens another authorization automatically',async()=>{
 sessionStorage.setItem(key,'state_nonce');reconcileGmail.mockResolvedValue({safe_to_restart:false});await act(async()=>root.render(<ConnectGmail refresh={()=>{}}/>));
 await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Check before starting again').click());
 expect(reconcileGmail).toHaveBeenCalledWith('state_nonce');expect(sessionStorage.getItem(key)).toBe('uncertain:state_nonce');expect(beginGmail).not.toHaveBeenCalled();expect(container.textContent).not.toContain('Connect Gmail with Google');
});
test('foreign or malformed confirmation never clears the stored request',async()=>{
 sessionStorage.setItem(key,'uncertain:state_nonce');reconcileGmail.mockResolvedValue({confirmed:true,safe_to_restart:true,org_id:8,connection_id:'gmail_'+'b'.repeat(32),state:'ready',execution_authorized:false});await act(async()=>root.render(<ConnectGmail refresh={()=>{}}/>));await act(async()=>container.querySelector('button').click());
 expect(sessionStorage.getItem(key)).toBe('uncertain:state_nonce');expect(container.textContent).not.toContain('Connect another account');
});
test('definitive Google denial can be retried without implying that a sender was connected',async()=>{
 sessionStorage.setItem(key,'state_nonce');finishGmail.mockRejectedValue({response:{status:409,data:{error:'GMAIL_CONSENT_DENIED'}}});await act(async()=>root.render(<ConnectGmail refresh={()=>{}}/>));await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Finish Gmail connection').click());
 expect(sessionStorage.getItem(key)).toBeNull();expect(container.textContent).toContain('Google access was not granted');expect(container.textContent).toContain('Connect Gmail with Google');
});
test('an organization switch cannot apply an old finish result to the new workspace',async()=>{
 let done;sessionStorage.setItem(key,'state_nonce');finishGmail.mockImplementation(()=>new Promise(resolve=>done=resolve));const refresh=jest.fn();await act(async()=>root.render(<ConnectGmail refresh={refresh}/>));await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Finish Gmail connection').click());
 useAuth.mockReturnValue({user:{subject:'fixture'},organization:{org_id:8,role:'owner'}});await act(async()=>root.render(<ConnectGmail refresh={refresh}/>));await act(async()=>done({org_id:7,connection_id:'gmail_'+'a'.repeat(32),state:'ready',execution_authorized:false}));
 expect(container.textContent).not.toContain('Gmail connected');expect(sessionStorage.getItem(key)).toBe('state_nonce');expect(refresh).not.toHaveBeenCalled();
});

test('blocked browser storage prevents starting Google authorization',async()=>{
 await act(async()=>root.render(<ConnectGmail refresh={()=>{}}/>));const write=jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('storage blocked');});
 try{await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Connect Gmail with Google').click());expect(beginGmail).not.toHaveBeenCalled();expect(container.textContent).toContain('Browser storage is unavailable');expect(container.querySelector('button').disabled).toBe(true);}finally{write.mockRestore();}
});
test('unavailable setup can be refreshed without starting an authorization',async()=>{
 getGmailSetup.mockRejectedValueOnce(Error('unavailable')).mockResolvedValue({available:true});await act(async()=>root.render(<ConnectGmail refresh={()=>{}}/>));expect(container.textContent).toContain('Gmail setup could not be checked');await act(async()=>container.querySelector('button').click());expect(container.textContent).toContain('Connect Gmail with Google');expect(beginGmail).not.toHaveBeenCalled();
});
