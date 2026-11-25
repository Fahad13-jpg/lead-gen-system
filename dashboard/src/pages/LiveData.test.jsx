import React,{act}from'react';
import{createRoot}from'react-dom/client';
import{MemoryRouter}from'react-router-dom';
import LiveLeads from'./LiveLeads';
import LiveJobs from'./LiveJobs';
import{getLeads,getJobs}from'../api/client';
jest.mock('../api/client',()=>({getLeads:jest.fn(),getJobs:jest.fn()}));
let container,root;
const fixture={leads:[{id:1,company_name:'Fixture clinic',city:'Fixture city',email:null,phone:null,last_assessed_at:null}],total:1,page:1,limit:25,observed_at:'2026-11-07T10:00:00Z'};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();jest.useRealTimers();});
async function refresh(){await act(async()=>{[...container.querySelectorAll('button')].find(b=>b.textContent==='Refresh').click();});}
test('a failed initial read is an error rather than an empty lead list',async()=>{
 getLeads.mockRejectedValue(Error('offline'));
 await act(async()=>root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><LiveLeads/></MemoryRouter>));
 expect(container.querySelector('[role=alert]')).not.toBeNull();expect(container.textContent).not.toContain('No matching leads');
});
test('refresh failure preserves a marked stale snapshot; revoked access clears it',async()=>{
 getLeads.mockResolvedValueOnce(fixture).mockRejectedValueOnce(Error('offline')).mockRejectedValueOnce({response:{status:403}});
 await act(async()=>root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><LiveLeads/></MemoryRouter>));
 expect(container.textContent).toContain('Fixture clinic');
 await refresh();expect(container.textContent).toContain('Fixture clinic');expect(container.textContent).toContain('earlier snapshot');
 await refresh();expect(container.textContent).not.toContain('Fixture clinic');expect(container.textContent).toContain('You do not have access to this action');
});
test('search progress refreshes every 30 seconds and skips hidden tabs',async()=>{
 jest.useFakeTimers();Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
 getJobs.mockResolvedValue({jobs:[],total:0,page:1,limit:10,observed_at:'2026-11-07T10:00:00Z'});
 await act(async()=>root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><LiveJobs/></MemoryRouter>));expect(getJobs).toHaveBeenCalledTimes(1);
 await act(async()=>{jest.advanceTimersByTime(30000);});expect(getJobs).toHaveBeenCalledTimes(2);
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
 await act(async()=>{jest.advanceTimersByTime(30000);});expect(getJobs).toHaveBeenCalledTimes(2);
});


