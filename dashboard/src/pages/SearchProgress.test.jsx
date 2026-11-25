import {MemoryRouter} from 'react-router-dom';
import React,{act}from'react';
import{createRoot}from'react-dom/client';
import LiveJobs,{jobGroup,AssessmentProgress,GatheringOutcome,SearchElapsed}from'./LiveJobs';
import{getJobs}from'../api/client';
import{useAuth}from'../context/AuthContext';
jest.mock('../api/client',()=>({getJobs:jest.fn()}));
jest.mock('../context/AuthContext',()=>({useAuth:jest.fn()}));
jest.mock('recharts',()=>{
 const React=require('react'),Box=({children})=>React.createElement('div',null,children);
 return{ResponsiveContainer:Box,PieChart:Box,Pie:Box,Cell:()=>null,Tooltip:()=>null,BarChart:Box,Bar:()=>null,CartesianGrid:()=>null,XAxis:()=>null,YAxis:()=>null};
});
let root,container;
const jobs=['running','completed','failed','cancelled'].map((status,index)=>({id:index+1,job_name:`Fixture search ${index+1}`,status,max_results:50,staged_count:20,cleaned_count:12,assessed_count:5,total_leads:20,duplicate_count:0}));
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;useAuth.mockReturnValue({organization:{role:'owner'}});container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);getJobs.mockResolvedValue({jobs,total:78,limit:10,page:1,observed_at:'2026-11-07T10:00:00Z'});});
afterEach(()=>{act(()=>root.unmount());container.remove();});
test('status groupings describe gathering and preserve unknown statuses',()=>{
 expect(jobGroup('completed')).toBe('finished');expect(jobGroup('running')).toBe('active');expect(jobGroup('failed')).toBe('attention');expect(jobGroup('cancelled')).toBe('other');expect(jobGroup('unknown')).toBe('other');
});
test('active search shows elapsed time and its refresh interval',()=>{
 const started=new Date(Date.now()-65000).toISOString();act(()=>root.render(<SearchElapsed job={{status:'running',created_at:started}}/>));
 expect(container.textContent).toContain('Started 1 minute ago');expect(container.textContent).toContain('updates every 30 seconds');
});
test('charts are explicitly page-scoped and filtering does not change totals',async()=>{
 await act(async()=>root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><LiveJobs/></MemoryRouter>));
 expect(container.textContent).toContain('4 of 78 searches');expect(container.querySelectorAll('.sp-job')).toHaveLength(4);expect(container.querySelector('.sp-search-actions a').getAttribute('href')).toBe('/leads?search_id=1');
 await act(async()=>{[...container.querySelectorAll('.sp-filter-tabs button')].find(b=>b.textContent.startsWith('Needs attention')).click();});
 expect(container.querySelectorAll('.sp-job')).toHaveLength(1);expect(container.querySelector('.sp-job').textContent).toContain('Fixture search 3');expect(container.textContent).toContain('4 of 78 searches');
});
test('empty status shows recovery and stage counts remain separate',async()=>{
 getJobs.mockResolvedValue({jobs:[jobs[0]],total:1,limit:10,page:1,observed_at:'2026-11-07T10:00:00Z'});
 await act(async()=>root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><LiveJobs/></MemoryRouter>));
 expect(container.querySelectorAll('.sp-stage')).toHaveLength(3);
 await act(async()=>{[...container.querySelectorAll('.sp-filter-tabs button')].find(b=>b.textContent.startsWith('Needs attention')).click();});
 expect(container.textContent).toContain('No searches in this status');
 await act(async()=>{[...container.querySelectorAll('button')].find(b=>b.textContent==='Show all on this page').click();});
 expect(container.querySelectorAll('.sp-job')).toHaveLength(1);
});
test('assessment status separates freshness, queue, failures and retained evidence',()=>{
 act(()=>root.render(<AssessmentProgress job={{basic_current_count:2,basic_pending_count:3,basic_processing_count:1,basic_failed_count:1}}/>));
 expect(container.textContent).toContain('Recently checked');expect(container.textContent).toContain('Waiting to be checked');
 expect(container.textContent).toContain('Checking now');expect(container.textContent).toContain('Could not be checked');
 expect(container.textContent).toContain('Some details may still be missing');expect(container.textContent).toContain('Older information stays saved');
 expect(container.textContent).toContain('View leads from this search');expect(container.textContent).not.toContain('verified leads');
 expect(container.querySelectorAll('dd')).toHaveLength(4);
});
test('missing assessment counters are not presented as zeros',()=>{
 act(()=>root.render(<AssessmentProgress job={{assessed_count:5}}/>));expect(container.textContent).toBe('');
});
test('new-business results distinguish existing matches, duplicates and final shortfall',()=>{
 act(()=>root.render(<GatheringOutcome job={{result_mode:'new',status:'completed',existing_match_count:7,target_shortfall:3,duplicate_count:12,completion_reason:'candidate_limit_reached'}}/>));
 expect([...container.querySelectorAll('dd')].map(n=>n.textContent)).toEqual(['7','3','New businesses']);
 expect(container.textContent).toContain('Candidate allowance reached');expect(container.textContent).toContain('separate counts');
});
test('in-progress and legacy searches do not pretend to have final shortfalls',()=>{
 act(()=>root.render(<GatheringOutcome job={{result_mode:'matching',status:'running',existing_match_count:2,target_shortfall:48}}/>));
 expect(container.textContent).toContain('Still gathering');expect(container.textContent).not.toContain('48');
 act(()=>root.render(<GatheringOutcome job={{result_mode:null,status:'completed',total_leads:1}}/>));
 expect(container.textContent).toContain('were not recorded');expect(container.querySelectorAll('dd')).toHaveLength(0);
});
test('search card badge follows recorded assessment lifecycle rather than completed gathering',async()=>{
 getJobs.mockResolvedValue({jobs:[{...jobs[1],lifecycle:{status:'completed',label:'Business checks saved',description:'Saved assessments can be partial.'}}],total:1,limit:10,page:1});
 await act(async()=>root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><LiveJobs/></MemoryRouter>));
 expect(container.querySelector('.sp-state').textContent).toBe('Business checks saved');expect(container.querySelector('.sp-job').textContent).toContain('Saved assessments can be partial.');
});


test('completed searches with checks still running appear in progress in both chart and filter',async()=>{
 const working={...jobs[1],id:10,lifecycle:{status:'running',label:'Checking business details'}},waiting={...jobs[1],id:11,lifecycle:{status:'scheduled',label:'Waiting to check details'}},done={...jobs[1],id:12,lifecycle:{status:'completed',label:'Business checks saved'}};
 getJobs.mockResolvedValue({jobs:[working,waiting,done],total:3,limit:10,page:1});
 await act(async()=>root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><LiveJobs/></MemoryRouter>));
 const progress=[...container.querySelectorAll('.sp-filter-tabs button')].find(b=>b.textContent.startsWith('In progress'));expect(progress.textContent).toBe('In progress2');expect(container.querySelector('.sp-donut').getAttribute('aria-label')).toContain('In progress 2');
 await act(async()=>progress.click());expect(container.querySelectorAll('.sp-job')).toHaveLength(2);expect(container.querySelector('.sp-job').textContent).toContain('Checking business details');
 const finished=[...container.querySelectorAll('.sp-filter-tabs button')].find(b=>b.textContent.startsWith('Finished'));await act(async()=>finished.click());expect(container.querySelectorAll('.sp-job')).toHaveLength(1);expect(container.querySelector('.sp-state').textContent).toBe('Business checks saved');
});
test('review and stopped work keep their own groups, and saved task counts cover older responses',()=>{
 expect(jobGroup({status:'completed',lifecycle:{status:'needs_attention'}})).toBe('attention');
 expect(jobGroup({status:'cancelled',basic_pending_count:2})).toBe('other');
 expect(jobGroup({status:'completed',basic_pending_count:2})).toBe('active');
 expect(jobGroup({status:'completed',cleaning_active_count:1})).toBe('active');
 expect(jobGroup({status:'completed',basic_failed_count:1})).toBe('attention');
});
