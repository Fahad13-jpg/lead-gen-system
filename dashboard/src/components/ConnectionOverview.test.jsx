import React,{act} from 'react';
import{createRoot}from'react-dom/client';
import ConnectionOverview from './ConnectionOverview';
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();window.history.replaceState(null,'','/');});
test('only current recorded checks count and unknown channel status stays unknown',()=>{
 act(()=>root.render(<ConnectionOverview settings={{connections:[{provider:'gmail',health:{status:'checked'}},{provider:'smtp',health:{status:'needs_attention'}},{provider:'whatsapp',health:{status:'checked'}}]}}/>));
 expect(container.textContent).toContain('1 of 2 recently checked');expect(container.textContent).toContain('Review senders needing attention');expect(container.textContent).toContain('Open setup to check');
});
test('a setup fragment opens the requested collapsed section',()=>{
 window.history.replaceState(null,'','/#sms-setup');
 act(()=>root.render(<><ConnectionOverview settings={{}}/><details id="sms-setup"><summary>SMS</summary></details></>));
 expect(container.querySelector('#sms-setup').open).toBe(true);
});
