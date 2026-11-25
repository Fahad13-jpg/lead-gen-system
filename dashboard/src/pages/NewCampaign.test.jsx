import React,{act}from'react';
import{createRoot}from'react-dom/client';
import{MemoryRouter}from'react-router-dom';
import NewCampaign from'./NewCampaign';
import{createCampaign}from'../api/client';
import{useAuth}from'../context/AuthContext';
jest.mock('../api/client',()=>({createCampaign:jest.fn()}));
jest.mock('../context/AuthContext',()=>({useAuth:jest.fn()}));
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();sessionStorage.clear();useAuth.mockReturnValue({user:{subject:'fixture'},organization:{org_id:7,role:'owner'}});container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
async function render(){await act(async()=>root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><NewCampaign/></MemoryRouter>));}
async function submit(){await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
test('save forwards campaign config without generating strategies and prevents duplicate clicks',async()=>{
 createCampaign.mockResolvedValue({saved:true,campaign_id:3});await render();await act(async()=>{const form=container.querySelector('form');form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
 expect(createCampaign).toHaveBeenCalledTimes(1);expect(createCampaign.mock.calls[0][0].email_verification_policy).toBe('basic');expect(container.textContent).toContain('Campaign saved');
 await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Create another campaign').click());expect(container.querySelector('form')).not.toBeNull();
});
test('uncertain save remains blocked after remount without automatic retry',async()=>{
 createCampaign.mockRejectedValue(Error('offline'));await render();await submit();expect(container.textContent).toContain('Check the save result');
 await act(async()=>root.unmount());root=createRoot(container);await render();expect(container.querySelector('form')).toBeNull();expect(createCampaign).toHaveBeenCalledTimes(1);
});
test('member role cannot save',async()=>{
 useAuth.mockReturnValue({user:{subject:'fixture'},organization:{org_id:7,role:'member'}});await render();expect(container.querySelector('fieldset').disabled).toBe(true);await submit();expect(createCampaign).not.toHaveBeenCalled();
});
test('known unavailable campaign service does not leave an uncertain-save marker',async()=>{
 createCampaign.mockRejectedValue({response:{status:409,data:{error:'STRATEGY_SERVICE_UNAVAILABLE'}}});await render();await submit();
 expect(createCampaign).toHaveBeenCalledTimes(1);expect(sessionStorage.length).toBe(0);expect(container.querySelector('form')).not.toBeNull();expect(container.textContent).toContain('Campaign setup is not ready');
});
test('Messenger selection saves an AI-only single-step campaign without requesting generation',async()=>{
 createCampaign.mockResolvedValue({saved:true,campaign_id:3});await render();const label=[...container.querySelectorAll('label')].find(l=>l.textContent.includes('Messenger · manual'));await act(async()=>label.querySelector('input').click());await submit();expect(createCampaign).toHaveBeenCalledWith(expect.objectContaining({mode:'ai',channels:['messenger'],sequence:[{channel:'messenger',delay_days:0}]}));
});

test('creating another campaign starts with blank content and default channels',async()=>{
 createCampaign.mockResolvedValue({saved:true,campaign_id:3});await render();
 await act(async()=>{const input=container.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'First campaign');input.dispatchEvent(new Event('input',{bubbles:true}));});
 const messenger=[...container.querySelectorAll('label')].find(l=>l.textContent.includes('Messenger · manual'));await act(async()=>messenger.querySelector('input').click());await submit();
 await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Create another campaign').click());
 expect(container.querySelector('input').value).toBe('');expect(container.querySelector('textarea').value).toBe('');
 expect([...container.querySelectorAll('label')].find(l=>l.textContent==='Email').querySelector('input').checked).toBe(true);
 expect([...container.querySelectorAll('label')].find(l=>l.textContent.includes('Messenger · manual')).querySelector('input').checked).toBe(false);
 expect(createCampaign).toHaveBeenCalledTimes(1);
});
test('confirmed server save remains visible if storing its browser receipt fails',async()=>{
 createCampaign.mockResolvedValue({saved:true,campaign_id:3});await render();const original=Storage.prototype.setItem,write=jest.spyOn(Storage.prototype,'setItem').mockImplementation(function(k,v){if(JSON.parse(v).saved)throw Error('quota');return original.call(this,k,v);});
 try{await submit();expect(container.textContent).toContain('Campaign saved');expect(container.textContent).toContain('could not remember the confirmation');expect(container.querySelector('a[href="/campaigns/3"]')).not.toBeNull();expect(createCampaign).toHaveBeenCalledTimes(1);}finally{write.mockRestore();}
});
test('a save finishing after a workspace switch cannot replace the new workspace form',async()=>{
 let finish;createCampaign.mockImplementation(()=>new Promise(resolve=>finish=resolve));await render();await submit();
 useAuth.mockReturnValue({user:{subject:'fixture'},organization:{org_id:8,role:'owner'}});await render();await act(async()=>finish({saved:true,campaign_id:3}));
 expect(container.querySelector('form')).not.toBeNull();expect(container.textContent).not.toContain('Campaign saved');expect(sessionStorage.getItem('lg_campaign_save_fixture_8')).toBeNull();expect(JSON.parse(sessionStorage.getItem('lg_campaign_save_fixture_7')).saved).toBe(true);
});
