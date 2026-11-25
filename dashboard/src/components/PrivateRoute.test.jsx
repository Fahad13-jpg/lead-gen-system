import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route,useLocation} from 'react-router-dom';
import PrivateRoute from './PrivateRoute';
import {useAuth} from '../context/AuthContext';
jest.mock('../context/AuthContext',()=>({useAuth:jest.fn()}));
let root,container,status;
function Location(){return <span data-path>{useLocation().pathname}</span>;}
function Fixture(){return <MemoryRouter initialEntries={['/campaigns/new']} future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Location/><Routes><Route path="/campaigns/new" element={<PrivateRoute><h1>Create campaign</h1></PrivateRoute>}/><Route path="/access" element={<h1>Access</h1>}/><Route path="/login" element={<h1>Login</h1>}/></Routes></MemoryRouter>;}
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;status='loading';useAuth.mockImplementation(()=>({status}));container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
test('page reload keeps campaign URL through asynchronous authentication',async()=>{
 await act(async()=>root.render(<Fixture/>));expect(container.querySelector('[data-path]').textContent).toBe('/campaigns/new');expect(container.textContent).not.toContain('Create campaign');
 status='ready';await act(async()=>root.render(<Fixture/>));expect(container.querySelector('[data-path]').textContent).toBe('/campaigns/new');expect(container.textContent).toContain('Create campaign');
});
test('signed-out and denied users still cannot view protected content',async()=>{
 status='signed_out';await act(async()=>root.render(<Fixture/>));expect(container.querySelector('[data-path]').textContent).toBe('/login');expect(container.textContent).not.toContain('Create campaign');
});
