import React,{act}from'react';
import{createRoot}from'react-dom/client';
import LiveOutreach from'./LiveOutreach';
import{getOutreach}from'../api/client';
jest.mock('../api/client',()=>({getOutreach:jest.fn()}));
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
test('provider acceptance is distinct from delivery and channel changes reset pagination',async()=>{
 getOutreach.mockResolvedValue({total:1,reply_records:0,bounce_records:0,uncertain_records:0,page:1,limit:20,observed_at:new Date().toISOString(),activities:[{id:1,lead_id:167,company_name:'Fixture clinic',channel:'email',status:'sent',dispatch_state:'provider_accepted',delivery_status:null,created_at:'2026-11-08T09:00:00'}]});
 await act(async()=>root.render(<LiveOutreach/>));expect(container.textContent).toContain('provider accepted');expect(container.textContent).toContain('Delivery: Not recorded');expect(container.textContent).toContain('not unique prospects');expect(container.textContent).toContain('2026-11-08 09:00:00');
 await act(async()=>{const select=container.querySelector('select');select.value='whatsapp';select.dispatchEvent(new Event('change',{bubbles:true}));});expect(getOutreach).toHaveBeenLastCalledWith({channel:'whatsapp',page:1,limit:20});
});
test('an unavailable service is not presented as zero activity',async()=>{
 getOutreach.mockRejectedValue(Error('offline'));await act(async()=>root.render(<LiveOutreach/>));expect(container.querySelector('[role="alert"]')).not.toBeNull();expect(container.querySelector('.ot-stats')).toBeNull();expect(container.textContent).not.toContain('No activity recorded');
});
test('call outcomes show persisted opt-outs and distinguish a pending booking from success',async()=>{
 getOutreach.mockResolvedValue({total:1,reply_records:0,bounce_records:0,uncertain_records:0,page:1,limit:20,activities:[{id:2,lead_id:167,channel:'call',status:'awaiting_final_cost',call_result:{outcome:'opt_out',followup_pause_reason:'opt_out',booking:{state:'reconciliation_required'},callback_requested:false}}]});
 await act(async()=>root.render(<LiveOutreach/>));expect(container.textContent).toContain('Call outcome: Opted out');expect(container.textContent).toContain('Paused · Opted out');expect(container.textContent).toContain('Confirmation needs review');expect(container.textContent).not.toContain('Appointment: Booked');
});
test('a callback request is not displayed as a scheduled call',async()=>{
 getOutreach.mockResolvedValue({total:1,reply_records:0,bounce_records:0,uncertain_records:0,page:1,limit:20,activities:[{id:2,lead_id:167,channel:'call',call_result:{outcome:'callback_requested',callback_requested:true,booking:null}}]});
 await act(async()=>root.render(<LiveOutreach/>));expect(container.textContent).toContain('A call has not been scheduled.');expect(container.textContent).not.toContain('Appointment:');
});


test('review filtering is page-scoped and never offers a send or retry',async()=>{
 getOutreach.mockResolvedValue({total:40,reply_records:5,bounce_records:0,uncertain_records:3,page:1,limit:20,activities:[{id:1,lead_id:1,company_name:'Uncertain fixture',dispatch_state:'uncertain'},{id:2,lead_id:2,company_name:'Reply fixture',replied_at:'2026-11-19T10:00:00'}]});
 await act(async()=>root.render(<LiveOutreach/>));
 await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent.startsWith('Needs review on this page')).click());
 expect(container.querySelectorAll('.ot-activity')).toHaveLength(1);expect(container.querySelector('.ot-activity').textContent).toContain('Uncertain fixture');expect(container.textContent).toContain('Check the existing activity');expect(container.querySelector('.ot-activity button')).toBeNull();
});
