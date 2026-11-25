import React,{act}from'react';
import{createRoot}from'react-dom/client';
import SmsSettings from'./SmsSettings';
import{getSms,smsAction}from'../api/client';
jest.mock('../context/AuthContext',()=>({useAuth:()=>({organization:{org_id:7,role:'owner'}})}));
jest.mock('../api/client',()=>({getSms:jest.fn(),smsAction:jest.fn()}));
let root,container;beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
test('phone linking explains private-message forwarding and never automatically connects or sends',async()=>{getSms.mockResolvedValue({configured:false,items:[]});await act(async()=>root.render(<SmsSettings/>));expect(container.textContent).toContain('Only messages matching known outreach recipients are retained');expect(container.querySelector('button[type="submit"]').disabled).toBe(true);expect(container.querySelectorAll('input[type="password"]').length).toBe(2);expect(smsAction).not.toHaveBeenCalled();});
test('missing public reply endpoint blocks enabling sends but shows saved phone and limits',async()=>{getSms.mockResolvedValue({configured:true,callback_setup_available:false,connection:{version:1,sender_phone:'+923175153405',sim_number:1,state:'paused',daily_limit:20,daily_segment_limit:40,slot:{timezone:'Asia/Karachi',start_hour:10,end_hour:11,weekdays:[1,2,3,4,5]}},items:[]});await act(async()=>root.render(<SmsSettings/>));expect(container.textContent).toContain('sending stays blocked');expect(container.querySelector('button[type="submit"]').disabled).toBe(true);expect(smsAction).not.toHaveBeenCalled();});


test('a rejected read-only login stays editable while an unknown save remains quarantined',async()=>{
 for(const [status,code,locked]of [[409,'SMS_LOGIN_REJECTED',false],[503,'SMS_ACTION_UNCONFIRMED',true]]){
  getSms.mockResolvedValue({configured:false,items:[]});smsAction.mockRejectedValue({response:{status,data:{error:code}}});await act(async()=>root.render(<SmsSettings key={code}/>));
  const values=['fixture-user','fixture-password','fixture-device','+923001234567','k'.repeat(32)];let i=0;
  for(const input of container.querySelectorAll('input:not([type=checkbox])')){await act(async()=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),'value').set.call(input,values[i++]);input.dispatchEvent(new Event('input',{bubbles:true}));});}
  await act(async()=>container.querySelector('input[type=checkbox]').click());await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(container.querySelector('fieldset').disabled).toBe(locked);expect(container.textContent).toContain(locked?'Result uncertain':'SMSGate rejected the login');
 }
});


test('loading phones avoids typed IDs, selects the reported SIM and preserves credentials for connection',async()=>{
 getSms.mockResolvedValue({configured:false,items:[]});smsAction.mockResolvedValue({devices:[{id:'server-device-correct',name:'My phone',sim_numbers:[2]}],saved:false,messages_sent:0});await act(async()=>root.render(<SmsSettings/>));
 const inputs=container.querySelectorAll('input');for(const [i,value]of [[0,'fixture-user'],[1,'fixture-password']])await act(async()=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(inputs[i]),'value').set.call(inputs[i],value);inputs[i].dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Load my SMSGate phones').click());expect(smsAction).toHaveBeenCalledWith('devices',{username:'fixture-user',password:'fixture-password'});expect(container.querySelectorAll('select')[0].value).toBe('server-device-correct');expect(container.querySelectorAll('select')[1].value).toBe('2');expect(container.querySelector('input[type=password]').value).toBe('fixture-password');expect(container.querySelector('button[type=submit]').disabled).toBe(true);
});
