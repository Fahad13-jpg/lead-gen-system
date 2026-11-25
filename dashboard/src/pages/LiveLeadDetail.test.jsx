import React,{act}from'react';
import{createRoot}from'react-dom/client';
import{MemoryRouter,Routes,Route}from'react-router-dom';
import LiveLeadDetail from'./LiveLeadDetail';
import{getLeadDetail}from'../api/client';
jest.mock('../api/client',()=>({getLeadDetail:jest.fn()}));
let root,container;
const fixture={found:true,lead:{id:167,company_name:'Fixture clinic',category:'Dental clinic',city:'Fixture city',website:'https://example.org/'},report_available:true,assessment:{website_presence:'unknown',website_current:false,research_current:null,basic_at:null,research_at:null,evaluated_at:null,overall_status:'insufficient_fresh_evidence',warnings:[],conflicts:[],blocking_reasons:['no_fresh_provider_verified_email']},summary:'<img src=x onerror=alert(1)>',description:null,evidence:[],services:[],pages:[{url:'https://example.org/',status:200,html_bytes:null,text_bytes:null,truncated:null,usable_html:true}],emails:[{value:'fixture@example.org',status:'expired'}],tasks:[],linkedin:{profiles:[],posts:[]},observed_at:'2026-11-07T10:00:00Z'};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();getLeadDetail.mockResolvedValue(fixture);container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
async function render(entry='/leads/167'){await act(async()=>root.render(<MemoryRouter initialEntries={[entry]} future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Routes><Route path="/leads/:leadId" element={<LiveLeadDetail/>}/></Routes></MemoryRouter>));}
test('shows saved evidence and freshness without inventing presence, verification or page diagnostics',async()=>{
 await render();expect(getLeadDetail).toHaveBeenCalledWith('167');expect(container.textContent).toContain('Fixture clinic');expect(container.textContent).toContain('Needs another check');expect(container.textContent).toContain('Check date not known');expect(container.textContent).toContain('Verification expired');expect(container.textContent).toContain('Email has not been checked recently');expect(container.textContent).toContain('Unknown');
 expect(container.querySelector('img')).toBeNull();expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
 for(const a of container.querySelectorAll('a[target="_blank"]'))expect(a.rel).toBe('noopener noreferrer');
});
test('unavailable report still shows the cleaned business without asserting readiness',async()=>{
 getLeadDetail.mockResolvedValue({...fixture,report_available:false,emails:[],pages:[]});await render();expect(container.textContent).toContain('Fixture clinic');expect(container.textContent).toContain('No business check is saved yet');expect(container.textContent).toContain('No website observations are saved');
});
test('missing organization lead and transport errors remain distinct',async()=>{
 getLeadDetail.mockResolvedValue({found:false});await render();expect(container.textContent).toContain('Lead not available');expect(container.textContent).not.toContain('Fixture clinic');
});
test('an initial failure does not claim the lead is missing',async()=>{
 getLeadDetail.mockRejectedValue(Error('offline'));await render();expect(container.querySelector('[role="alert"]')).not.toBeNull();expect(container.textContent).not.toContain('Lead not available');
});

test('back link keeps the originating search and rejects unrelated destinations',async()=>{await render({pathname:'/leads/167',state:{from:'/leads?search_id=123'}});expect(container.querySelector('.ld-back').getAttribute('href')).toBe('/leads?search_id=123');});
test('back link rejects unrelated destinations',async()=>{await render({pathname:'/leads/167',state:{from:'https://example.org'}});expect(container.querySelector('.ld-back').getAttribute('href')).toBe('/leads');});
test('Facebook URLs are social profiles rather than business websites',async()=>{
 getLeadDetail.mockResolvedValue({...fixture,lead:{...fixture.lead,website:'https://www.facebook.com/people/Fixture/123'}});await render();const website=[...container.querySelectorAll('.ld-contacts dt')].find(e=>e.textContent==='Website');expect(website.nextElementSibling.textContent).toBe('Not recorded');expect(container.querySelector('a[href="https://www.facebook.com/people/Fixture/123"]').textContent).toContain('Open Facebook profile');expect(container.textContent).toContain('No business website is saved');
});
test('lookalike domains remain ordinary websites, not Facebook profiles',async()=>{
 getLeadDetail.mockResolvedValue({...fixture,lead:{...fixture.lead,website:'https://facebook.com.example.org/'}});await render();const website=[...container.querySelectorAll('.ld-contacts dt')].find(e=>e.textContent==='Website');expect(website.nextElementSibling.textContent).toContain('facebook.com.example.org');expect(container.textContent).not.toContain('Open Facebook profile');
});
