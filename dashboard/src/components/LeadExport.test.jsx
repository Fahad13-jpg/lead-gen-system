import React,{act}from'react';
import{createRoot}from'react-dom/client';
import LeadExport from'./LeadExport';
import{getLeadExport}from'../api/client';
import{downloadCsv}from'../leadCsv';
jest.mock('../api/client',()=>({getLeadExport:jest.fn()}));jest.mock('../leadCsv',()=>({downloadCsv:jest.fn()}));
let host,root;beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});afterEach(()=>{act(()=>root.unmount());host.remove();});
test('downloads all pages of the chosen scope before creating one CSV',async()=>{getLeadExport.mockResolvedValueOnce({columns:['Business'],rows:[['A']],total:2,upper_id:2,next_cursor:1,done:false}).mockResolvedValueOnce({columns:['Business'],rows:[['B']],total:2,upper_id:2,next_cursor:2,done:true});await act(async()=>root.render(<LeadExport filters={{search_id:'4'}}/>));await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Download CSV').click());expect(getLeadExport.mock.calls[1][0]).toEqual(expect.objectContaining({search_id:'4',cursor:1,upper_id:2,stage:'cleaned'}));expect(downloadCsv).toHaveBeenCalledWith(expect.any(String),['Business'],[['A'],['B']]);});
test('a failed later page cannot be downloaded as a complete export',async()=>{getLeadExport.mockResolvedValueOnce({columns:['Business'],rows:[['A']],total:2,upper_id:2,next_cursor:1,done:false}).mockRejectedValueOnce(Error('network'));await act(async()=>root.render(<LeadExport filters={{}}/>));await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Download CSV').click());expect(downloadCsv).not.toHaveBeenCalled();expect(host.textContent).toContain('no partial CSV');});
