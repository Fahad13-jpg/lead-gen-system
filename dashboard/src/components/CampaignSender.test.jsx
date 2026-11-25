import React,{act}from'react';
import{createRoot}from'react-dom/client';
import CampaignSender from'./CampaignSender';
import{useAuth}from'../context/AuthContext';
import{getSettings,bindSender}from'../api/client';
jest.mock('../context/AuthContext',()=>({useAuth:jest.fn()}));
jest.mock('../api/client',()=>({getSettings:jest.fn(),bindSender:jest.fn()}));
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();sessionStorage.clear();useAuth.mockReturnValue({user:{subject:'fixture'},organization:{org_id:7,role:'owner'}});getSettings.mockResolvedValue({connections:[{connection_id:'one',provider:'smtp',state:'ready',send_capable:true,reply_capable:true}],observed_at:new Date().toISOString()});container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
test('binding requires confirmation, forwards campaign version and preserves disabled sending',async()=>{
 bindSender.mockResolvedValue({bound:true});const refresh=jest.fn();await act(async()=>root.render(<CampaignSender campaignId="3" version={4} refresh={refresh}/>));await act(async()=>{const select=container.querySelector('select');select.value='one';select.dispatchEvent(new Event('change',{bubbles:true}));});const button=[...container.querySelectorAll('button')].find(b=>b.textContent==='Save email account');expect(button.disabled).toBe(true);await act(async()=>container.querySelector('input').click());await act(async()=>{button.click();button.click();});expect(bindSender).toHaveBeenCalledTimes(1);expect(bindSender).toHaveBeenCalledWith({campaign_id:3,connection_id:'one',expected_version:4});expect(container.textContent).toContain('Email sending remains disabled');expect(refresh).toHaveBeenCalled();
});
test('unready sender cannot be bound',async()=>{
 getSettings.mockResolvedValue({connections:[{connection_id:'one',provider:'smtp',state:'pending_check'}],observed_at:new Date().toISOString()});await act(async()=>root.render(<CampaignSender campaignId="3" version={4} refresh={()=>{}}/>));await act(async()=>{const select=container.querySelector('select');select.value='one';select.dispatchEvent(new Event('change',{bubbles:true}));container.querySelector('input').click();});expect(container.textContent).toContain('This account needs a connection check in Settings');expect([...container.querySelectorAll('button')].find(b=>b.textContent==='Save email account').disabled).toBe(true);expect(bindSender).not.toHaveBeenCalled();
});
