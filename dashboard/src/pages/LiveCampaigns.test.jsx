import {MemoryRouter} from 'react-router-dom';
import React,{act}from'react';
import{createRoot}from'react-dom/client';
import LiveCampaigns from'./LiveCampaigns';
import{getCampaigns}from'../api/client';
jest.mock('../api/client',()=>({getCampaigns:jest.fn()}));
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
test('campaign records show current version metrics without asserting send readiness',async()=>{
 getCampaigns.mockResolvedValue({campaigns:[{id:'1',version:2,name:'Clinic website',offer:'<img src=x> website demo',cta:'Book a demo',mode:'ai',channels:['email'],plans:3,approval_records:2,expired:1}],total:12,page:1,limit:10,observed_at:new Date().toISOString()});
 await act(async()=>root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><LiveCampaigns/></MemoryRouter>));expect(container.textContent).toContain('Version 2');expect(container.textContent).toContain('Recorded approvals can belong to expired plans');expect(container.querySelector('img')).toBeNull();
 await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Next').click());expect(getCampaigns).toHaveBeenLastCalledWith({page:2,limit:10});
});
test('empty records and unavailable service are distinct',async()=>{
 getCampaigns.mockRejectedValue(Error('offline'));await act(async()=>root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><LiveCampaigns/></MemoryRouter>));expect(container.querySelector('[role="alert"]')).not.toBeNull();expect(container.textContent).not.toContain('No campaigns saved yet');
});


test('uncertain campaigns explain the block and link to existing outreach instead of a send action',async()=>{
 getCampaigns.mockResolvedValue({campaigns:[{id:'1',version:1,name:'Fixture',channels:['email'],plans:1,approval_records:1,expired:0,lifecycle:{label:'Needs attention',description:'Review the existing activity before sending a replacement.',next_action:{code:'reconcile',label:'Review the uncertain result'}}}],total:1,page:1,limit:10});
 await act(async()=>root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><LiveCampaigns/></MemoryRouter>));expect(container.textContent).toContain('before sending a replacement');expect(container.querySelector('a[href="/outreach"]').textContent).toContain('Review the uncertain result');
});
