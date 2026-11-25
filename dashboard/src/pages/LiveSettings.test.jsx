import React,{act}from'react';
import{createRoot}from'react-dom/client';
import LiveSettings from'./LiveSettings';
import{getSettings}from'../api/client';
import{useAuth}from'../context/AuthContext';
jest.mock('../api/client',()=>({getSettings:jest.fn()}));
jest.mock('../context/AuthContext',()=>({useAuth:jest.fn()}));
jest.mock('../components/ConnectGmail',()=>()=>null);
jest.mock('../components/ConnectSmtp',()=>()=>null);
jest.mock('../components/ReplaceSmtpPassword',()=>()=>null);
jest.mock('../components/ReconnectGmail',()=>()=>null);
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();useAuth.mockReturnValue({user:{email:'fixture@example.org',subject:'fixture'},organization:{org_id:7}});container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
test('settings show recorded capabilities and limits without implying a live check',async()=>{
 getSettings.mockResolvedValue({organization:{name:'Fixture',status:'active'},role:'owner',apify:{enabled:false,key_configured:true},connection_total:1,connections:[{connection_id:'fixture',provider:'gmail',email:'fixture@example.org',sharing:'team',state:'ready',daily_limit:10,mailbox_rolling_limit:10,min_interval_seconds:300,send_capable:true,reply_capable:false}],observed_at:new Date().toISOString()});
 await act(async()=>root.render(<LiveSettings/>));expect(container.textContent).toContain('Configured but disabled');expect(container.textContent).toContain('Recorded as capable');expect(container.textContent).toContain('Not confirmed');expect(container.textContent).toContain('300 seconds');expect(container.textContent).toContain('not a live balance');
});
test('configuration errors do not pretend no sender is connected',async()=>{
 getSettings.mockRejectedValue(Error('offline'));await act(async()=>root.render(<LiveSettings/>));expect(container.querySelector('[role="alert"]')).not.toBeNull();expect(container.textContent).not.toContain('No visible sender connections');
});
