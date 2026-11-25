import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {ThemeProvider} from '../context/ThemeContext';
import Faq from '../pages/Faq';
import Privacy from '../pages/Privacy';
import Contact from '../pages/Contact';
import NotFound from '../pages/NotFound';
import AppErrorBoundary from './AppErrorBoundary';
import PageMetadata from './PageMetadata';
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
async function render(Page,url='/'){await act(async()=>root.render(<ThemeProvider><MemoryRouter initialEntries={[url]}><PageMetadata/><Page/></MemoryRouter></ThemeProvider>));}
test('FAQ answers describe the actual manual channels, provider funding and approval requirements',async()=>{
 await render(Faq,'/faq');expect(container.querySelectorAll('details').length).toBe(10);expect(container.textContent).toContain('not include provider credits');expect(container.textContent).toContain('No. These are manual');expect(document.title).toContain('Frequently asked questions');
});
test('privacy and contact pages disclose unfinished operator details without a fake form',async()=>{
 await render(Privacy,'/privacy');expect(container.textContent).toContain('Pre-release');expect(container.textContent).toContain('including messages unrelated to outreach');expect(container.querySelector('a[href="/contact"]')).not.toBeNull();
 await render(Contact,'/contact');expect(container.querySelector('form')).toBeNull();expect(container.textContent).toContain('Support contact is being finalized');
});
test('not found page provides working recovery links and one clear heading',async()=>{
 await render(NotFound,'/missing');expect(container.querySelectorAll('h1')).toHaveLength(1);expect(container.textContent).toContain('404');expect(container.querySelector('a[href="/dashboard"]')).not.toBeNull();expect(document.querySelector('meta[name="robots"]').content).toBe('noindex, nofollow');
});
test('rendering failures show recovery without exposing exception text',async()=>{
 const log=jest.spyOn(console,'error').mockImplementation(()=>{});function Broken(){throw Error('PRIVATE_INTERNAL_VALUE');}
 try{await act(async()=>root.render(<AppErrorBoundary><Broken/></AppErrorBoundary>));expect(container.querySelector('[role="alert"]')).not.toBeNull();expect(container.textContent).toContain('Reload page');expect(container.textContent).not.toContain('PRIVATE_INTERNAL_VALUE');}finally{log.mockRestore();}
});
