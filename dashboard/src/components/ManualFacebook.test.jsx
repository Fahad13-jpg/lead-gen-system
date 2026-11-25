import React,{act}from'react';
import{createRoot}from'react-dom/client';
import ManualFacebook from'./ManualFacebook';
import{getManualFacebook,prepareManualFacebook}from'../api/client';
jest.mock('../context/AuthContext',()=>({useAuth:()=>({user:{subject:'one'},organization:{org_id:7}})}));
jest.mock('../api/client',()=>({getManualFacebook:jest.fn(),prepareManualFacebook:jest.fn()}));
const page='https://www.facebook.com/business/',url='https://m.me/business',message='Hello business';
let root,container,open,writeText;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);open=jest.spyOn(window,'open').mockReturnValue(null);writeText=jest.fn().mockResolvedValue();Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});getManualFacebook.mockResolvedValue({available:true,manual_only:true,execution_authorized:false,targets:[{page_url:page,url}]});prepareManualFacebook.mockResolvedValue({lead_id:3,page_url:page,url,message,manual_only:true,message_sent:false,provider_verified:false,execution_authorized:false});});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();open.mockRestore();});
async function render(){await act(async()=>root.render(<ManualFacebook leadId={3}/>));}
async function fill(){await act(async()=>{const t=container.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,message);t.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>container.querySelector('input').click());}
async function submit(){await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
test('opens only the checked target after preparation and offers a link if the popup is blocked',async()=>{
 await render();expect(container.querySelector('button').disabled).toBe(true);await fill();await submit();expect(prepareManualFacebook).toHaveBeenCalledWith({lead_id:3,page_url:page,message,acknowledge_manual_contact:true});expect(writeText).toHaveBeenCalledWith(message);expect(open).toHaveBeenCalledWith('about:blank','_blank');expect(container.querySelector('a').href).toBe(url);expect(container.textContent).toContain('send it there');
});
test('clipboard failure retains selectable text and a checked Facebook link',async()=>{
 writeText.mockRejectedValue(Error());await render();await fill();await submit();expect(open).toHaveBeenCalled();expect(container.textContent).toContain('Copy the message below');expect(container.querySelector('textarea[readonly]').value).toBe(message);
});
test('known stops and changed destinations do not expose a send/open action',async()=>{
 getManualFacebook.mockResolvedValue({available:false,reason:'recipient_stopped_or_needs_review',manual_only:true,execution_authorized:false,targets:[]});await render();expect(container.querySelector('form')).toBeNull();expect(container.textContent).toContain('asked not to be contacted');
});
test('a mismatched prepare response is rejected before clipboard or navigation',async()=>{
 prepareManualFacebook.mockResolvedValue({lead_id:3,page_url:page,url:'https://evil.example/',message,manual_only:true,message_sent:false,provider_verified:false,execution_authorized:false});await render();await fill();await submit();expect(writeText).not.toHaveBeenCalled();expect(open).toHaveBeenCalledWith('about:blank','_blank');expect(container.querySelector('a')).toBeNull();
});
test('approved strategy prefills exact read-only text and binds preparation to its plan hash',async()=>{
 const draft={plan_id:12,content_hash:'a'.repeat(32),page_url:page,message,campaign_name:'My offer'};
 getManualFacebook.mockResolvedValue({available:true,manual_only:true,execution_authorized:false,targets:[{page_url:page,url}],draft});await render();expect(container.querySelector('textarea').value).toBe(message);expect(container.querySelector('textarea').readOnly).toBe(true);await act(async()=>container.querySelector('input').click());await submit();expect(prepareManualFacebook).toHaveBeenCalledWith(expect.objectContaining({source_plan_id:12,source_content_hash:draft.content_hash,message}));
});
