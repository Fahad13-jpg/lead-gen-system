import React,{act}from'react';
import{createRoot}from'react-dom/client';
import ConnectSmtp from'./ConnectSmtp';
import{useAuth}from'../context/AuthContext';
import{connectSmtp}from'../api/client';
jest.mock('../context/AuthContext',()=>({useAuth:jest.fn()}));
jest.mock('../api/client',()=>({connectSmtp:jest.fn()}));
let root,container,refresh;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();sessionStorage.clear();Object.defineProperty(window,'crypto',{configurable:true,value:{getRandomValues:array=>{array.fill(7);return array;}}});refresh=jest.fn();useAuth.mockReturnValue({user:{subject:'fixture'},organization:{org_id:7,role:'owner'}});container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
async function render(connections=[]){await act(async()=>root.render(<ConnectSmtp refresh={refresh} connections={connections}/>));}
async function submit(){const form=container.querySelector('form');for(const[name,value]of Object.entries({email:'fixture@example.org',smtp_host:'smtp.example.org',smtp_password:'SMTP_SECRET',imap_host:'imap.example.org',imap_password:'IMAP_SECRET'}))form.elements.namedItem(name).value=value;await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
test('saving uses canonical mailbox inputs, clears passwords and never stores them in browser storage',async()=>{
 connectSmtp.mockImplementation(async p=>({connection_id:p.request_id,state:'pending_check',execution_authorized:false}));await render();await submit();expect(connectSmtp).toHaveBeenCalledTimes(1);expect(connectSmtp.mock.calls[0][0].smtp.port).toBe(587);expect(connectSmtp.mock.calls[0][0].imap.port).toBe(993);expect(sessionStorage.length).toBe(0);expect(container.querySelector('[name="smtp_password"]').value).toBe('');expect(container.textContent).toContain('saved for connection checking');expect(refresh).toHaveBeenCalled();
});
test('uncertain saves keep a secret-free reconciliation lock instead of retrying',async()=>{
 connectSmtp.mockRejectedValue(Error('timeout'));await render();await submit();expect(container.querySelector('form')).toBeNull();expect(container.textContent).toContain('Save result uncertain');const request_id=connectSmtp.mock.calls[0][0].request_id;expect(sessionStorage.getItem('lg_smtp_signup_fixture_7')).toBe(request_id);expect(JSON.stringify(sessionStorage)).not.toContain('SECRET');await act(async()=>container.querySelector('button').click());expect(connectSmtp).toHaveBeenCalledTimes(1);await render([{connection_id:request_id,provider:'smtp',state:'pending_check'}]);expect(container.querySelector('form')).not.toBeNull();expect(sessionStorage.length).toBe(0);
});

test('confirmed credential save with incomplete workflow setup requests review instead of new credentials',async()=>{
 connectSmtp.mockImplementation(async p=>({connection_id:p.request_id,state:'pending_check',execution_authorized:false,workflow_setup:'pending_operator_review'}));await render();await submit();expect(container.textContent).toContain('workflow setup needs administrator review');expect(sessionStorage.length).toBe(0);expect(refresh).toHaveBeenCalled();
});
