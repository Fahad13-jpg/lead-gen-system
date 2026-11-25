import React,{act}from'react';
import{createRoot}from'react-dom/client';
import{MemoryRouter}from'react-router-dom';
import Access from'./Access';
import{useAuth}from'../context/AuthContext';
jest.mock('../context/AuthContext',()=>({useAuth:jest.fn()}));
jest.mock('../auth/firebase',()=>({resendVerification:jest.fn(),authErrorMessage:()=> 'Access check failed'}));
let root,container,create,check;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();sessionStorage.clear();Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'}});create=jest.fn();check=jest.fn();useAuth.mockReturnValue({status:'no_membership',user:{subject:'a'.repeat(64)},createOrganization:create,checkOrganizationCreation:check,refreshIdentity:jest.fn(),logout:jest.fn()});container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
async function render(){await act(async()=>root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Access/></MemoryRouter>));}
async function fill(){await act(async()=>{const i=container.querySelector('input:not([type])');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'My business');i.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>container.querySelector('input[type="checkbox"]').click());}
test('verified unassigned users can create only an acknowledged new workspace without credits or sending promises',async()=>{
 create.mockResolvedValue({saved:true});await render();expect(container.textContent).toContain('Create your workspace');expect(container.querySelector('button[type="submit"]').disabled).toBe(true);await fill();await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(create).toHaveBeenCalledWith({name:'My business',request_id:expect.any(String),acknowledge_owner:true});expect(sessionStorage.length).toBe(0);expect(container.textContent).toContain('No provider credits');
});
test('uncertain creation remains blocked after remount and is reconciled through a read without repeated creation',async()=>{
 create.mockRejectedValue(Error('timeout'));await render();await fill();await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await act(async()=>root.unmount());root=createRoot(container);await render();expect(container.querySelector('form')).toBeNull();check.mockResolvedValue({saved:false});await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Check saved workspace').click());expect(container.querySelector('form')).not.toBeNull();expect(create).toHaveBeenCalledTimes(1);expect(check).toHaveBeenCalledTimes(1);
});
test('unverified accounts do not see workspace enrollment',async()=>{
 useAuth.mockReturnValue({status:'verify_email',user:null,refreshIdentity:jest.fn(),logout:jest.fn()});await render();expect(container.querySelector('form')).toBeNull();expect(container.textContent).toContain('Verify your email');expect(create).not.toHaveBeenCalled();
});
