import React,{act}from'react';
import{createRoot}from'react-dom/client';
import{MemoryRouter,Routes,Route}from'react-router-dom';
import CampaignPreferences from'./CampaignPreferences';
import{getCampaignPreferences,saveCampaignPreferences}from'../api/client';
import{useAuth}from'../context/AuthContext';
jest.mock('../api/client',()=>({getCampaignPreferences:jest.fn(),saveCampaignPreferences:jest.fn()}));
jest.mock('../context/AuthContext',()=>({useAuth:jest.fn()}));
const data={found:true,campaign_id:'1',name:'Clinic campaign',version:3,preferences:{timezone:'Asia/Karachi',tone:'professional',sending_window:{start_hour:9,end_hour:17,weekdays:[1,2,3,4,5]},sequence:[{channel:'email',delay_days:0},{channel:'email',delay_days:3}],expiry_days:7,source_check_max_age_days:30}};
let container,root;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();sessionStorage.clear();useAuth.mockReturnValue({user:{subject:'fixture'},organization:{org_id:7,role:'owner'}});getCampaignPreferences.mockResolvedValue(data);container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
async function render(){await act(async()=>root.render(<MemoryRouter initialEntries={['/campaigns/1/preferences']} future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Routes><Route path="/campaigns/:campaignId/preferences" element={<CampaignPreferences/>}/></Routes></MemoryRouter>));}
async function save(){await act(async()=>{const checks=container.querySelectorAll('input[type=checkbox]');checks[checks.length-1].click();});await act(async()=>{const f=container.querySelector('form');f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});}
test('versioned save uses current settings exactly once and requires review acknowledgement',async()=>{
 saveCampaignPreferences.mockResolvedValue({saved:true,campaign_id:1,version:4});await render();expect(container.textContent).toContain('Working hours');expect([...container.querySelectorAll('button')].find(b=>b.textContent==='Save changes').disabled).toBe(true);await save();expect(saveCampaignPreferences).toHaveBeenCalledTimes(1);expect(saveCampaignPreferences).toHaveBeenCalledWith({campaign_id:1,expected_version:3,preferences:{tone:'professional'}});expect(container.textContent).toContain('Changes saved');expect(container.textContent).toContain('Prepare and review new messages');
 getCampaignPreferences.mockResolvedValue({...data,version:4});await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Change settings again').click());expect(container.querySelector('form')).not.toBeNull();expect(container.textContent).toContain('Clinic campaign');expect(sessionStorage.length).toBe(0);expect(saveCampaignPreferences).toHaveBeenCalledTimes(1);
});
test('version conflict requires a fresh load and does not retain an uncertain marker',async()=>{
 saveCampaignPreferences.mockRejectedValue({response:{status:409,data:{error:'CAMPAIGN_VERSION_CONFLICT'}}});await render();await save();expect(container.textContent).toContain('Someone changed this campaign');expect(container.querySelector('fieldset').disabled).toBe(true);expect(sessionStorage.length).toBe(0);
});
test('uncertain save stays blocked after remount and can reconcile through a read only',async()=>{
 saveCampaignPreferences.mockRejectedValue(Error('timeout'));await render();await save();expect(container.textContent).toContain('Checking your save');await act(async()=>root.unmount());root=createRoot(container);await render();expect(container.querySelector('form')).toBeNull();expect(saveCampaignPreferences).toHaveBeenCalledTimes(1);
 getCampaignPreferences.mockResolvedValue({...data,version:4});await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Refresh settings').click());expect(container.textContent).toContain('Changes saved');expect(saveCampaignPreferences).toHaveBeenCalledTimes(1);
});
test('members can inspect but cannot change preferences',async()=>{
 useAuth.mockReturnValue({user:{subject:'fixture'},organization:{org_id:7,role:'member'}});await render();expect(container.querySelector('fieldset').disabled).toBe(true);expect(saveCampaignPreferences).not.toHaveBeenCalled();
});
test('switching organization clears the previous organization save marker',async()=>{
 sessionStorage.setItem('lg_campaign_preferences_fixture_7_1',JSON.stringify({uncertain:true}));await render();expect(container.textContent).toContain('Checking your save');
 useAuth.mockReturnValue({user:{subject:'fixture'},organization:{org_id:9,role:'owner'}});await render();expect(container.querySelector('form')).not.toBeNull();expect(container.textContent).not.toContain('Checking your save');expect(saveCampaignPreferences).not.toHaveBeenCalled();
});
test('email cap uses the saved sender ceiling and posts only the requested change',async()=>{
 getCampaignPreferences.mockResolvedValue({...data,email_daily_limit:{available:true,value:10,ceiling:10},preferences:{...data.preferences,email_daily_limit:10}});saveCampaignPreferences.mockResolvedValue({saved:true,campaign_id:1,version:4});await render();
 const label=[...container.querySelectorAll('label')].find(l=>l.textContent.startsWith('Requested daily email cap')),input=label.querySelector('input');expect(input.max).toBe('10');expect(container.textContent).toContain('shared across this organization');
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'4');input.dispatchEvent(new Event('input',{bubbles:true}));});await save();expect(saveCampaignPreferences).toHaveBeenCalledWith({campaign_id:1,expected_version:3,preferences:{email_daily_limit:4}});
});
