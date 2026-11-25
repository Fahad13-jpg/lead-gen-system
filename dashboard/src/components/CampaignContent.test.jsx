import React,{act,useState}from'react';
import{createRoot}from'react-dom/client';
import CampaignContent from'./CampaignContent';
let root,container;
const initial={name:'Clinic campaign',mode:'ai',channels:['email'],offer:{name:'Website',description:'A demonstration',approved_points:['Show services'],prohibited_claims:[]},cta:{text:'Request demo',url:''},email_template:null,sequence:[{channel:'email',delay_days:0},{channel:'email',delay_days:3}]};
function Fixture(){const[form,setForm]=useState(initial);return <><CampaignContent form={form} set={(k,v)=>setForm(f=>({...f,[k]:v}))}/><pre>{JSON.stringify(form)}</pre></>;}
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
const current=()=>JSON.parse(container.querySelector('pre').textContent);
async function change(title,value){const label=[...container.querySelectorAll('label')].find(l=>l.textContent.startsWith(title)),input=label.querySelector('input,textarea,select');await act(async()=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),'value').set.call(input,value);input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
test('offer and CTA fields update structured content without altering sender or triggering generation',async()=>{
 await act(async()=>root.render(<Fixture/>));await change('Product or service name','Clinic website');await change('Approved benefits','Show services\nReceive enquiries');await change('Requested next step','Book a demo');
 expect(current().offer.name).toBe('Clinic website');expect(current().offer.approved_points).toEqual(['Show services','Receive enquiries']);expect(current().cta.text).toBe('Book a demo');expect(current().mode).toBe('ai');
});
test('template mode exposes exact customer copy and one field for each configured follow-up',async()=>{
 await act(async()=>root.render(<Fixture/>));await change('Strategy mode','template');expect(current().email_template.followups).toHaveLength(1);await change('First email','\nHello {{company_name}}\n\n');expect(current().email_template.body).toBe('\nHello {{company_name}}\n\n');expect(container.textContent).toContain('Additional template languages');
});
