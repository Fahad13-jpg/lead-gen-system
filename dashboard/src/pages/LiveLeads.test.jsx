import React,{act}from'react';
import{createRoot}from'react-dom/client';
import{MemoryRouter,useLocation}from'react-router-dom';
import LiveLeads from'./LiveLeads';
import{getLeads}from'../api/client';
jest.mock('../api/client',()=>({getLeads:jest.fn()}));
let root,host;
const fixture={leads:[{id:42,company_name:'Example Studio',category:'Design',city:'Lahore',country:'Pakistan',email:'hello@example.org',phone:'+923001234567'}],total:1,page:1,limit:25,observed_at:'2026-11-17T12:00:00Z'};
function Location(){return <output data-location>{useLocation().pathname}</output>;}
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();getLeads.mockResolvedValue(fixture);host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();jest.restoreAllMocks();});
async function render(entry='/leads'){await act(async()=>root.render(<MemoryRouter initialEntries={[entry]} future={{v7_startTransition:true,v7_relativeSplatPath:true}}><LiveLeads/><Location/></MemoryRouter>));}
test('clicking a contact cell opens the lead; its name remains a real link',async()=>{await render();expect(host.querySelector('.live-lead-link').getAttribute('href')).toBe('/leads/42');await act(async()=>host.querySelector('tbody td:nth-child(3)').dispatchEvent(new MouseEvent('click',{button:0,bubbles:true})));expect(host.querySelector('[data-location]').textContent).toBe('/leads/42');});
test('selected contact text is not treated as a navigation click',async()=>{await render();jest.spyOn(window,'getSelection').mockReturnValue({toString:()=> 'hello@example.org'});act(()=>host.querySelector('tbody td:nth-child(3)').click());expect(host.querySelector('[data-location]').textContent).toBe('/leads');});
test('modified row clicks open a separate tab without changing this page',async()=>{await render();const open=jest.spyOn(window,'open').mockImplementation(()=>null);act(()=>host.querySelector('tbody td:nth-child(2)').dispatchEvent(new MouseEvent('click',{button:0,ctrlKey:true,bubbles:true})));expect(open).toHaveBeenCalledWith('/leads/42','_blank','noopener,noreferrer');expect(host.querySelector('[data-location]').textContent).toBe('/leads');});

test('returning to a lead list restores its search and filters',async()=>{await render({pathname:'/leads',search:'?search_id=123',state:{leadList:{query:'Studio',contact:'email_found',stage:'enriched',page:2}}});expect(getLeads).toHaveBeenLastCalledWith(expect.objectContaining({search_id:'123',q:'Studio',contact:'email_found',stage:'enriched',page:2}));expect(host.querySelector('input').value).toBe('Studio');});
