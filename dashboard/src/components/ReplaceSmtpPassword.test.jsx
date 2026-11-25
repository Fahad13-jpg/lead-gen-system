import React,{act}from'react';
import{createRoot}from'react-dom/client';
import ReplaceSmtpPassword from'./ReplaceSmtpPassword';
import{useAuth}from'../context/AuthContext';
import{replaceSmtp}from'../api/client';
jest.mock('../context/AuthContext',()=>({useAuth:jest.fn()}));
jest.mock('../api/client',()=>({replaceSmtp:jest.fn()}));
let root,container,refresh;const connection={connection_id:'smtp_fixture',version:3,can_replace:true};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();sessionStorage.clear();refresh=jest.fn();useAuth.mockReturnValue({user:{subject:'fixture'},organization:{org_id:7,role:'owner'}});container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
async function render(c=connection){await act(async()=>root.render(<ReplaceSmtpPassword connection={c} refresh={refresh}/>));}
async function submit(){const form=container.querySelector('form');form.elements.namedItem('smtp_password').value='NEW_SMTP_FIXTURE';form.elements.namedItem('imap_password').value='NEW_IMAP_FIXTURE';await act(async()=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});}
test('replacement needs acknowledgement, sends the displayed version once and clears secrets',async()=>{
 let captured;replaceSmtp.mockImplementation(async p=>{captured=JSON.parse(JSON.stringify(p));return{connection_id:connection.connection_id,version:4,state:'pending_check',execution_authorized:false,campaign_rebind_required:true};});await render();await submit();expect(replaceSmtp).not.toHaveBeenCalled();await act(async()=>container.querySelector('[type="checkbox"]').click());await submit();expect(replaceSmtp).toHaveBeenCalledTimes(1);expect(captured).toEqual({connection_id:connection.connection_id,expected_version:3,acknowledge_recheck:true,smtp_password:'NEW_SMTP_FIXTURE',imap_password:'NEW_IMAP_FIXTURE'});expect(container.querySelector('[name="smtp_password"]').value).toBe('');expect(sessionStorage.length).toBe(0);expect(container.textContent).toContain('Re-select this sender');expect(refresh).toHaveBeenCalled();
});
test('uncertain replacement stays locked without storing passwords or claiming success on another version',async()=>{
 replaceSmtp.mockRejectedValue(Error('timeout'));await render();await act(async()=>container.querySelector('[type="checkbox"]').click());await submit();expect(container.querySelector('form')).toBeNull();expect(sessionStorage.getItem('lg_smtp_replace_fixture_7_smtp_fixture')).toBe('{"version":3}');expect(container.textContent).toContain('result uncertain');await act(async()=>container.querySelector('button').click());expect(replaceSmtp).toHaveBeenCalledTimes(1);await render({...connection,version:4});expect(container.textContent).toContain('Account version changed');expect(container.textContent).not.toContain('Passwords replaced.');expect(sessionStorage.length).toBe(0);
});
test('private accounts without replacement permission expose no password form',async()=>{await render({...connection,can_replace:false});expect(container.textContent).toBe('');expect(replaceSmtp).not.toHaveBeenCalled();});
