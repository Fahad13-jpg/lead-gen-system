import React,{act}from'react';
import{createRoot}from'react-dom/client';
import{MemoryRouter}from'react-router-dom';
import LiveOverview from'./LiveOverview';
import{getOverview}from'../api/client';
jest.mock('../components/SetupChecklist',()=>()=>null);
jest.mock('../api/client',()=>({getOverview:jest.fn()}));
jest.mock('recharts',()=>{
 const React=require('react'),Box=({children})=>React.createElement('div',null,children);
 return{ResponsiveContainer:Box,AreaChart:Box,Area:()=>null,CartesianGrid:()=>null,XAxis:()=>null,YAxis:()=>null,Tooltip:()=>null,PieChart:Box,Pie:Box,Cell:()=>null};
});
let container,root;
const fixture={counts:{cleaned_leads:48,email_found:18,assessed_leads:20,searches:78,active_searches:2,review_searches:3},search_activity:[{date:'2026-11-07',searches:4}],recent_jobs:[{id:9,job_name:'Fixture clinic search',status:'completed',max_results:50}],days:30,database_timezone:'UTC',observed_at:'2026-11-07T10:00:00Z'};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();getOverview.mockResolvedValue(fixture);container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
async function render(){await act(async()=>root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><LiveOverview/></MemoryRouter>));}
test('organization totals and period activity have separate scopes; period selection refetches',async()=>{
 await render();expect(container.textContent).toContain('All saved records');expect(container.textContent).toContain('4 searches created in this period');
 expect(container.querySelector('[aria-label="30 records with email; 18 without a recorded email"]')).toBeNull();
 expect(container.querySelector('[aria-label="18 records with email; 30 without a recorded email"]')).not.toBeNull();
 expect(container.textContent).toContain('Fixture clinic search');
 await act(async()=>{const select=container.querySelector('select');select.value='7';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(getOverview).toHaveBeenLastCalledWith(7);
});
test('empty data displays explicit empty states',async()=>{
 getOverview.mockResolvedValue({...fixture,counts:Object.fromEntries(Object.keys(fixture.counts).map(k=>[k,0])),search_activity:[],recent_jobs:[]});
 await render();expect(container.textContent).toContain('No cleaned leads yet');expect(container.textContent).toContain('No searches created in this period');expect(container.textContent).toContain('No searches saved yet');
});
test('initial failure does not show invented zero totals',async()=>{
 getOverview.mockRejectedValue(Error('offline'));await render();expect(container.querySelector('[role="alert"]')).not.toBeNull();expect(container.querySelector('.ov-totals')).toBeNull();
});
