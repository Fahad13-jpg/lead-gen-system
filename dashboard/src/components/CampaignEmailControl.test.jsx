import React,{act}from'react';
import{createRoot}from'react-dom/client';
import CampaignEmailControl from'./CampaignEmailControl';
import{useAuth}from'../context/AuthContext';
import{saveCampaignPreferences}from'../api/client';
jest.mock('../context/AuthContext',()=>({useAuth:jest.fn()}));
jest.mock('../api/client',()=>({saveCampaignPreferences:jest.fn()}));
let root,container,refresh;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();sessionStorage.clear();refresh=jest.fn();useAuth.mockReturnValue({user:{subject:'fixture'},organization:{org_id:7,role:'owner'}});container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
async function render(enabled=true,version=4){await act(async()=>root.render(<CampaignEmailControl campaignId="3" version={version} enabled={enabled} refresh={refresh}/>));}
test('pause submits only a versioned disable once and leaves reply monitoring alone',async()=>{
 saveCampaignPreferences.mockResolvedValue({saved:true,version:5});await render();await act(async()=>{container.querySelector('button').click();container.querySelector('button').click();});expect(saveCampaignPreferences).toHaveBeenCalledTimes(1);expect(saveCampaignPreferences).toHaveBeenCalledWith({campaign_id:3,expected_version:4,preferences:{pause_email:true}});expect(container.textContent).toContain('Email policy paused');expect(container.textContent).toContain('Reply checks continue separately');expect(refresh).toHaveBeenCalled();
});
test('unknown, paused or unauthorized campaigns cannot pause or resume',async()=>{
 for(const enabled of [null,false]){await render(enabled);expect(container.querySelector('button').disabled).toBe(true);}
 useAuth.mockReturnValue({user:{subject:'fixture'},organization:{org_id:7,role:'member'}});await render();expect(container.querySelector('button').disabled).toBe(true);expect(saveCampaignPreferences).not.toHaveBeenCalled();
});
test('uncertain write persists a no-retry gate and reconciles only after a newer snapshot',async()=>{
 saveCampaignPreferences.mockRejectedValue(Error('timeout'));await render();await act(async()=>container.querySelector('button').click());expect(container.textContent).toContain('Pause result uncertain');await act(async()=>container.querySelector('button').click());expect(saveCampaignPreferences).toHaveBeenCalledTimes(1);expect(refresh).toHaveBeenCalled();await render(false,5);expect(container.textContent).toContain('Email policy is now paused');expect(sessionStorage.length).toBe(0);
});
