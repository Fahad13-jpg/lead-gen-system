import React,{act}from'react';
import{createRoot}from'react-dom/client';
import{MemoryRouter}from'react-router-dom';
import WorkspaceFrame from'./WorkspaceFrame';
let root,host;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
const render=()=>act(()=>root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><WorkspaceFrame user={{email:'owner@example.org'}} organization={{name:'Example',role:'owner'}} pageTitle="Overview" onLogout={()=>{}}><p>Workspace content</p></WorkspaceFrame></MemoryRouter>));
test('mobile navigation isolates the background, closes with Escape and restores focus',async()=>{
 render();const toggle=host.querySelector('[aria-label="Open navigation"]'),surface=host.querySelector('.dp-workspace');
 act(()=>toggle.click());expect(toggle.getAttribute('aria-expanded')).toBe('true');expect(surface.inert).toBe(true);expect(document.body.style.overflow).toBe('hidden');
 await act(async()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));await new Promise(resolve=>setTimeout(resolve,5));});
 expect(toggle.getAttribute('aria-expanded')).toBe('false');expect(surface.inert).toBe(false);expect(document.activeElement).toBe(toggle);expect(document.body.style.overflow).toBe('');
});
test('unmounting an open drawer restores document scrolling',()=>{
 render();act(()=>host.querySelector('[aria-label="Open navigation"]').click());act(()=>root.unmount());expect(document.body.style.overflow).toBe('');
});
