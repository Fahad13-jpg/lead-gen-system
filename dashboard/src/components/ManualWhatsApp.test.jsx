import React,{act}from'react';
import{createRoot}from'react-dom/client';
import ManualWhatsApp from'./ManualWhatsApp';
import{getManualWhatsApp,prepareManualWhatsApp}from'../api/client';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
jest.mock('../api/client',()=>({getManualWhatsApp:jest.fn(),prepareManualWhatsApp:jest.fn()}));
jest.mock('../context/AuthContext',()=>({useAuth:()=>({user:{subject:'fixture'},organization:{org_id:7}})}));
let root,container,open;beforeEach(()=>{jest.clearAllMocks();open=jest.spyOn(window,'open').mockReturnValue(null);container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);getManualWhatsApp.mockResolvedValue({available:true,recipient:'+923175153405'});});afterEach(async()=>{await act(async()=>root.unmount());container.remove();open.mockRestore();});
async function render(){await act(async()=>root.render(<ManualWhatsApp leadId={3}/>));}
async function type(text){await act(async()=>{const t=container.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,text);t.dispatchEvent(new Event('input',{bubbles:true}));});}
test('review is required and the link opens only after a validated preparation; edits invalidate it',async()=>{
 await render();expect(container.querySelector('button[type="submit"]').disabled).toBe(true);await type('Hello');await act(async()=>container.querySelector('input').click());
 prepareManualWhatsApp.mockResolvedValue({lead_id:3,recipient:'+923175153405',message:'Hello',url:'https://wa.me/923175153405?text=Hello',manual_only:true,message_sent:false,provider_verified:false,execution_authorized:false});
 await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));const a=container.querySelector('a');expect(a.href).toBe('https://wa.me/923175153405?text=Hello');expect(a.rel).toBe('noopener noreferrer');expect(container.textContent).toContain('does not send the message');
 await type('Changed');expect(container.querySelector('a')).toBeNull();expect(container.querySelector('input').checked).toBe(false);
});
test('recorded recipient stop exposes no compose or open action',async()=>{
 getManualWhatsApp.mockResolvedValue({available:false,reason:'recipient_stopped_or_needs_review'});await render();expect(container.querySelector('textarea')).toBeNull();expect(container.querySelector('a')).toBeNull();expect(container.textContent).toContain('asked not to be contacted');
});
test('an unexpected destination or uncertain response never becomes an open link',async()=>{
 await render();await type('Hello');await act(async()=>container.querySelector('input').click());prepareManualWhatsApp.mockResolvedValue({url:'https://evil.example'});await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(container.querySelector('a')).toBeNull();expect(container.textContent).toContain('Nothing was sent');
});
test('a saved strategy preloads editable text and one user action opens the validated chat',async()=>{
 const draft={plan_id:12,content_hash:'a'.repeat(32),campaign_name:'My campaign',message:'Saved strategy'};
 getManualWhatsApp.mockResolvedValue({available:true,recipient:'+923175153405',draft});await render();expect(container.querySelector('textarea').value).toBe('Saved strategy');expect(container.textContent).toContain('Message from My campaign');
 const popup={opener:{},closed:false,close:jest.fn(),location:{replace:jest.fn()}};open.mockReturnValue(popup);
 const url='https://wa.me/923175153405?text=Saved%20strategy';prepareManualWhatsApp.mockResolvedValue({lead_id:3,recipient:'+923175153405',message:draft.message,url,manual_only:true,message_sent:false,provider_verified:false,execution_authorized:false});
 await act(async()=>container.querySelector('input').click());await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(open).toHaveBeenCalledTimes(1);expect(popup.opener).toBeNull();expect(popup.location.replace).toHaveBeenCalledWith(url);expect(prepareManualWhatsApp).toHaveBeenCalledWith(expect.objectContaining({source_plan_id:12,source_content_hash:draft.content_hash}));expect(container.querySelector('a')).toBeNull();
});
