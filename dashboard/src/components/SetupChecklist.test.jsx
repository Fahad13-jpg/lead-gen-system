import React,{act}from'react';
import{createRoot}from'react-dom/client';
import{MemoryRouter}from'react-router-dom';
import{SetupChecklistView}from'./SetupChecklist';
jest.mock('../api/client',()=>({getSettings:jest.fn(),getCampaigns:jest.fn()}));
let container,root;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
function render(props){act(()=>root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><SetupChecklistView {...props}/></MemoryRouter>));}
test('new workspace opens navigation without claiming connected tools are ready',()=>{
 render({counts:{cleaned_leads:0}});
 expect(container.querySelector('details').open).toBe(true);
 expect(container.querySelector('.sc-next a').getAttribute('href')).toBe('/scraping/new');
 expect(container.querySelectorAll('.complete')).toHaveLength(0);
 expect(container.textContent).toContain('They do not start searches');
});
test('saved milestones collapse the checklist and retain channel-check warning',()=>{
 render({counts:{cleaned_leads:12},campaign:{id:9,name:'Clinic offer'},settings:{apify:{key_configured:true,enabled:true}}});
 expect(container.querySelector('details').open).toBe(false);
 expect(container.querySelectorAll('.complete')).toHaveLength(2);
 expect(container.querySelector('a[href="/campaigns/9"]')).not.toBeNull();
 expect(container.textContent).toContain('Saved connections still need their channel checks');
});
test('failed reads show an unknown state rather than missing milestones',()=>{
 render({error:'Unavailable'});
 expect(container.textContent).toContain('Workspace setup');
 expect(container.textContent).toContain('could not be loaded');
 expect(container.querySelector('ol')).toBeNull();
});


test('unsettled research takes priority over creating another search',()=>{
 render({counts:{cleaned_leads:0},settings:{apify:{health:{reason:'apify_unsettled_searches'}}}});
 expect(container.querySelector('.sc-next a').getAttribute('href')).toBe('/scraping');
 expect(container.querySelector('.sc-next').textContent).toContain('reconciliation');
});
test('saved email without current checks points to sender review',()=>{
 render({counts:{cleaned_leads:4},campaign:{id:9},settings:{connections:[{provider:'gmail',health:{status:'needs_attention'}}]}});
 expect(container.querySelector('.sc-next a').getAttribute('href')).toBe('/settings#email-accounts');
});
