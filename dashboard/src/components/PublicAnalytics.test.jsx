import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,useNavigate} from 'react-router-dom';
import PublicAnalytics from './PublicAnalytics';
let root,container;
function Fixture(){const navigate=useNavigate();return <><PublicAnalytics/><button onClick={()=>navigate('/leads/123?email=private@example.test')}>Private page</button></>;}
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);const cfg=document.createElement('script');cfg.id='public-site-config';cfg.type='application/json';cfg.textContent=JSON.stringify({publicOrigin:'https://app.example.test',ga4MeasurementId:'G-TEST123456'});document.head.appendChild(cfg);});
afterEach(()=>{act(()=>root.unmount());container.remove();document.getElementById('public-site-config')?.remove();document.getElementById('public-ga-tag')?.remove();delete window.gtag;delete window.dataLayer;delete window['ga-disable-G-TEST123456'];});
test('analytics makes no request before consent and sanitized public pageviews stop on private routes',async()=>{
 await act(async()=>root.render(<MemoryRouter initialEntries={['/?email=private@example.test']}><Fixture/></MemoryRouter>));expect(document.getElementById('public-ga-tag')).toBeNull();
 await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Allow analytics').click());expect(document.getElementById('public-ga-tag')).not.toBeNull();
 const events=window.dataLayer.filter(a=>a[0]==='event');expect(events).toHaveLength(1);expect(events[0][2].page_location).toBe('https://app.example.test/');expect(JSON.stringify(events)).not.toContain('private@example.test');
 await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Private page').click());expect(window['ga-disable-G-TEST123456']).toBe(true);expect(window.dataLayer.filter(a=>a[0]==='event')).toHaveLength(1);
});
