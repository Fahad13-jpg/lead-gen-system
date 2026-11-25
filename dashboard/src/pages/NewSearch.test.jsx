import React,{act}from'react';
import{createRoot}from'react-dom/client';
import{MemoryRouter}from'react-router-dom';
import NewSearch from'./NewSearch';
import{previewSearch,submitSearch,getSearchRequest}from'../api/client';
import{useAuth}from'../context/AuthContext';
jest.mock('../api/client',()=>({previewSearch:jest.fn(),submitSearch:jest.fn(),getSearchRequest:jest.fn()}));
jest.mock('../context/AuthContext',()=>({useAuth:jest.fn()}));
let container,root;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;Object.defineProperty(window,'crypto',{configurable:true,value:require('crypto').webcrypto});jest.clearAllMocks();sessionStorage.clear();useAuth.mockReturnValue({organization:{org_id:7,role:'owner'},user:{subject:'fixture-subject'}});previewSearch.mockImplementation(async request=>({request,billing:{can_submit:true,maximum_customer_charge_usd:.5},candidate_limit:150,preview_token:'fixture-receipt'}));container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
async function render(){await act(async()=>root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><NewSearch/></MemoryRouter>));}
async function review(){await act(async()=>{container.querySelector('.ns-examples button').click();});await act(async()=>{container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});}
function confirmButton(){return[...container.querySelectorAll('button')].find(b=>b.textContent==='Confirm and start search');}
test('custom category terms are included in the reviewed request without starting a search',async()=>{
 await render();await act(async()=>container.querySelector('.ns-examples button').click());await act(async()=>{const input=container.querySelector('input[placeholder="e.g. Dental clinic, Dentist"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Restaurant, Cafe');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(confirmButton().disabled).toBe(true);expect(previewSearch.mock.calls[0][0].include_categories).toEqual(['Restaurant','Cafe']);expect(submitSearch).not.toHaveBeenCalled();expect(container.textContent).toContain('Accept categories');
});
test('Facebook selection exposes bounded discovery without submitting a paid request',async()=>{
 await render();const source=[...container.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='facebook_pages'));
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(source,'facebook_pages');source.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(container.textContent).toContain('A Messenger link does not authorize automated messages');
 expect(container.querySelector('.ns-check input').checked).toBe(true);
 const target=[...container.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='50'));
 expect([...target.options].map(o=>Number(o.value))).toEqual([5,10,25,50]);
 expect(previewSearch).not.toHaveBeenCalled();expect(submitSearch).not.toHaveBeenCalled();
});
test('review does not submit; confirmation starts exactly one signed request',async()=>{
 submitSearch.mockResolvedValue({job_id:123,status:'queued'});await render();await review();
 expect(previewSearch).toHaveBeenCalledTimes(1);expect(submitSearch).not.toHaveBeenCalled();expect(previewSearch.mock.calls[0][0].request_id).toMatch(/^dash_[a-f0-9]{32}$/);
 await act(async()=>{const button=confirmButton();button.click();button.click();});expect(submitSearch).toHaveBeenCalledTimes(1);expect(submitSearch).toHaveBeenCalledWith('fixture-receipt');expect(container.textContent).toContain('Search #123 is saved');
});
test('editing clears the review and insufficient credits block confirmation',async()=>{
 previewSearch.mockImplementation(async request=>({request,billing:{can_submit:false,reason:'INSUFFICIENT_PLATFORM_CREDITS'},candidate_limit:150,preview_token:'fixture'}));
 await render();await review();expect(confirmButton().disabled).toBe(true);expect(container.textContent).toContain('needs platform credits');
 await act(async()=>{container.querySelector('.ns-examples button').click();});expect(confirmButton()).toBeUndefined();expect(submitSearch).not.toHaveBeenCalled();
});
test('uncertain submission survives remount and reconciles without retrying',async()=>{
 submitSearch.mockRejectedValue(Error('timeout'));await render();await review();await act(async()=>confirmButton().click());
 expect(container.textContent).toContain('Check your previous request');expect(container.querySelector('form')).toBeNull();
 await act(async()=>root.unmount());root=createRoot(container);await render();expect(container.querySelector('form')).toBeNull();
 getSearchRequest.mockResolvedValue({found:true,job_id:125,status:'queued'});
 await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Check saved request').click());expect(container.textContent).toContain('Search #125 is saved');expect(submitSearch).toHaveBeenCalledTimes(1);
});
test('member role cannot operate the search form',async()=>{
 useAuth.mockReturnValue({organization:{org_id:7,role:'member'},user:{subject:'fixture-subject'}});await render();expect(container.querySelector('fieldset').disabled).toBe(true);expect(container.textContent).toContain('Ask an owner or admin');
});

test('combined source reviews two bounded requests then confirms both exactly once',async()=>{
 await render();await review();
 const source=[...container.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='maps_facebook'));
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(source,'maps_facebook');source.dispatchEvent(new Event('change',{bubbles:true}));});
 previewSearch.mockClear();previewSearch.mockImplementation(async request=>({request,billing:{can_submit:true,maximum_customer_charge_usd:request.max_customer_cost_usd},candidate_limit:request.max_results*3,preview_token:'fixture-'+request.source}));
 await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 const requests=previewSearch.mock.calls.map(c=>c[0]);expect(requests.map(r=>r.source)).toEqual(['google_maps','facebook_pages']);expect(requests.reduce((n,r)=>n+r.max_results,0)).toBe(50);expect(requests.reduce((n,r)=>n+r.max_cost_usd,0)).toBe(.5);expect(submitSearch).not.toHaveBeenCalled();
 submitSearch.mockResolvedValueOnce({job_id:126,status:'queued'}).mockResolvedValueOnce({job_id:127,status:'queued'});
 await act(async()=>{confirmButton().click();});expect(submitSearch).toHaveBeenCalledTimes(2);expect(container.textContent).toContain('Both searches are saved');expect(container.textContent).toContain('Search #126');expect(container.textContent).toContain('Search #127');
});

test('combined uncertain admission survives reload and checks its saved ID without retrying either source',async()=>{
 await render();await review();
 const source=[...container.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='maps_facebook'));
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(source,'maps_facebook');source.dispatchEvent(new Event('change',{bubbles:true}));});
 previewSearch.mockImplementation(async request=>({request,billing:{can_submit:true,maximum_customer_charge_usd:request.max_customer_cost_usd},candidate_limit:request.max_results*3,preview_token:'fixture-'+request.source}));
 await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 submitSearch.mockRejectedValue(Error('timeout'));await act(async()=>confirmButton().click());
 expect(submitSearch).toHaveBeenCalledTimes(1);expect(container.textContent).toContain('Not started');
 await act(async()=>root.unmount());root=createRoot(container);await render();expect(container.querySelector('form')).toBeNull();
 getSearchRequest.mockResolvedValue({found:true,job_id:128,status:'queued'});
 await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Check saved requests').click());
 expect(container.textContent).toContain('Search #128');expect(container.textContent).toContain('Not started');expect(submitSearch).toHaveBeenCalledTimes(1);expect(getSearchRequest).toHaveBeenCalledTimes(1);
});

test('Yelp is unavailable for Pakistan and reviews a bounded US request without starting it',async()=>{
 await render();const source=[...container.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='yelp'));
 expect([...source.options].find(o=>o.value==='yelp').disabled).toBe(true);
 await act(async()=>container.querySelectorAll('.ns-examples button')[2].click());
 expect([...source.options].find(o=>o.value==='yelp').disabled).toBe(false);
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(source,'yelp');source.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(container.textContent).toContain('Live result quality has not been verified');
 await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(previewSearch.mock.calls[0][0]).toMatchObject({source:'yelp',country_code:'US',max_results:50,max_cost_usd:.5,require_contact:true});expect(submitSearch).not.toHaveBeenCalled();
});

async function fillLocation(text){await act(async()=>{const input=container.querySelector('#search-location');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}));});}
test('misspelled city offers a correction and cannot review until chosen',async()=>{
 await render();await act(async()=>container.querySelector('.ns-examples button').click());await fillLocation('Islmabad');
 expect(container.querySelector('[role=combobox]').getAttribute('aria-expanded')).toBe('true');expect(container.querySelector('[role=listbox]').textContent).toContain('Islamabad');
 await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(previewSearch).not.toHaveBeenCalled();
 await act(async()=>container.querySelector('[role=option]').click());await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(previewSearch.mock.calls[0][0].location).toContain('Islamabad');expect(submitSearch).not.toHaveBeenCalled();
});
test('unknown areas need explicit confirmation and changing country clears the old area',async()=>{
 await render();await act(async()=>container.querySelector('.ns-examples button').click());await fillLocation('An unlisted district');
 await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(previewSearch).not.toHaveBeenCalled();
 await act(async()=>container.querySelector('.location-custom input').click());await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(previewSearch.mock.calls[0][0].location).toBe('An unlisted district');expect(container.textContent).toContain('not been verified');
 const country=[...container.querySelectorAll('select')].find(s=>s.querySelector('option[value=PK]'));
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(country,'US');country.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(container.querySelector('#search-location').value).toBe('');expect(confirmButton()).toBeUndefined();
});
test('example selection clears stale category filters',async()=>{
 await render();const input=container.querySelector('input[placeholder="e.g. Dental clinic, Dentist"]');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Restaurant');input.dispatchEvent(new Event('input',{bubbles:true}));});await review();
 expect(previewSearch.mock.calls[0][0].include_categories).toEqual([]);
});

test('city dropdown opens with Pakistan choices before typing and selects a city',async()=>{
 await render();const toggle=container.querySelector('[aria-label="Show cities in Pakistan"]');await act(async()=>toggle.click());
 expect(container.querySelector('[role=combobox]').getAttribute('aria-expanded')).toBe('true');const options=[...container.querySelectorAll('[role=option]')];expect(options.length).toBeGreaterThan(0);expect(options.every(o=>o.textContent.endsWith('Pakistan'))).toBe(true);
 await act(async()=>options[0].click());expect(container.querySelector('#search-location').value).toContain('Pakistan');expect(container.querySelector('[role=combobox]').getAttribute('aria-expanded')).toBe('false');expect(submitSearch).not.toHaveBeenCalled();
});
test('US city dropdown is country-specific and supports keyboard selection',async()=>{
 await render();const country=[...container.querySelectorAll('select')].find(s=>s.querySelector('option[value=PK]'));await act(async()=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(country,'US');country.dispatchEvent(new Event('change',{bubbles:true}));});
 await act(async()=>container.querySelector('[aria-label="Show cities in the United States"]').click());expect([...container.querySelectorAll('[role=option]')].every(o=>o.textContent.endsWith('United States'))).toBe(true);
 const input=container.querySelector('#search-location');await act(async()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true})));await act(async()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));
 expect(input.value).toContain('United States');expect(previewSearch).not.toHaveBeenCalled();expect(submitSearch).not.toHaveBeenCalled();
});
