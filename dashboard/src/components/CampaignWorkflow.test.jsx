import React,{act,useState}from'react';
import{createRoot}from'react-dom/client';
import CampaignWorkflow from'./CampaignWorkflow';
let container,root;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
test('step navigation preserves form state and only changes the visible section',()=>{
 let mounts=0;
 function Draft(){const[value,setValue]=useState('Saved draft');React.useEffect(()=>{mounts++;},[]);return <input aria-label="Draft" value={value} onChange={e=>setValue(e.target.value)}/>;}
 act(()=>root.render(<CampaignWorkflow prepare={<Draft/>} setup={<p>Account setup</p>} review={<p>Content review</p>}/>));
 const buttons=container.querySelectorAll('nav button');
 act(()=>buttons[1].click());
 expect(container.querySelector('#campaign-step-prepare').hidden).toBe(false);
 const input=container.querySelector('input');
 act(()=>buttons[2].click());
 expect(container.querySelector('#campaign-step-prepare').hidden).toBe(true);
 act(()=>buttons[1].click());
 expect(container.querySelector('input')).toBe(input);
 expect(input.value).toBe('Saved draft');expect(mounts).toBe(1);
 expect(buttons[1].getAttribute('aria-current')).toBe('step');
});
