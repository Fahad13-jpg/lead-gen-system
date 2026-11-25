import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {ChannelPicker,PackageGate,PackageSummary} from './PackageAccess';
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
test('Free keeps four manual/email choices available and locks paid channels',()=>{
 act(()=>root.render(<ChannelPicker channels={['email']} access={{name:'free',features:{sms:false,calling:false}}} onToggle={()=>{}}/>));
 const inputs=[...container.querySelectorAll('input')];expect(inputs.filter(i=>!i.disabled)).toHaveLength(4);expect(inputs.filter(i=>i.disabled)).toHaveLength(2);
 expect(container.textContent).toContain('WhatsApp · manual');expect(container.textContent).toContain('Messenger · manual');
});
test('Plus exposes configured paid choices while an unknown package fails closed',()=>{
 act(()=>root.render(<ChannelPicker channels={[]} access={{name:'plus',features:{sms:true,calling:true}}} onToggle={()=>{}}/>));expect([...container.querySelectorAll('input')].some(i=>i.disabled)).toBe(false);
 act(()=>root.render(<PackageGate feature="calling" access={null}><button>Call now</button></PackageGate>));expect(container.querySelector('button')).toBeNull();expect(container.textContent).toContain('Package access not confirmed');
});
test('a downgraded user can remove an existing paid channel but cannot enable another',()=>{
 const toggle=jest.fn();act(()=>root.render(<ChannelPicker channels={['sms']} access={{name:'free',features:{}}} onToggle={toggle}/>));
 const input=[...container.querySelectorAll('label')].find(l=>l.textContent==='SMSPlus').querySelector('input');expect(input.disabled).toBe(false);act(()=>input.click());expect(toggle).toHaveBeenCalledWith('sms',false);
});

test('check package gives visible loading and completion feedback without changing the package',()=>{
 const refresh=jest.fn(),data={name:'plus',features:{calling:true}};
 act(()=>root.render(<PackageSummary state={{data,loading:false,error:false,refresh,checkedAt:Date.now(),manuallyChecked:false}}/>));
 act(()=>container.querySelector('button').click());expect(refresh).toHaveBeenCalledTimes(1);
 act(()=>root.render(<PackageSummary state={{data,loading:true,error:false,refresh,checkedAt:null,manuallyChecked:true}}/>));
 expect(container.querySelector('button').disabled).toBe(true);expect(container.querySelector('button').textContent).toBe('Checking…');expect(container.querySelector('[role="status"]').textContent).toContain('Checking your workspace access');
 act(()=>root.render(<PackageSummary state={{data,loading:false,error:false,refresh,checkedAt:Date.now(),manuallyChecked:true}}/>));
 expect(container.querySelector('button').disabled).toBe(false);expect(container.querySelector('[role="status"]').textContent).toContain('Package checked. Your workspace has Plus access.');expect(container.textContent).toContain('Last checked');
});

