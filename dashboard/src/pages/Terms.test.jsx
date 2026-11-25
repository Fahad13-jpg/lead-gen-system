import React,{act}from'react';
import{createRoot}from'react-dom/client';
import{MemoryRouter}from'react-router-dom';
import Terms from'./Terms';
test('pre-release terms disclose pending operator details and have working section targets',()=>{global.IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);try{act(()=>root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Terms/></MemoryRouter>));expect(host.querySelector('h1').textContent).toBe('Terms and conditions');expect(host.textContent).toContain('Pre-release terms');expect(host.textContent).toContain('Pending confirmation');for(const link of host.querySelectorAll('aside nav a'))expect(host.querySelector(link.getAttribute('href'))).not.toBeNull();}finally{act(()=>root.unmount());host.remove();}});
