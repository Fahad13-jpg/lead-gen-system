import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import useWorkspacePackage from './useWorkspacePackage';
import {PackageSummary} from '../components/PackageAccess';
import {getWorkspacePackage} from '../api/client';
import {useAuth} from '../context/AuthContext';
jest.mock('../api/client',()=>({getWorkspacePackage:jest.fn()}));
jest.mock('../context/AuthContext',()=>({useAuth:jest.fn()}));
let root,container;
const plus={name:'plus',revision:1,features:{calling:true,sms:true}};
function Fixture(){return <PackageSummary state={useWorkspacePackage()}/>;}
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();useAuth.mockReturnValue({organization:{org_id:7}});container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
test('Check package performs a new read, confirms the same Plus result, and reports failures',async()=>{
 getWorkspacePackage.mockResolvedValueOnce(plus);await act(async()=>root.render(<Fixture/>));expect(getWorkspacePackage).toHaveBeenCalledTimes(1);
 let finish;getWorkspacePackage.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));
 await act(async()=>container.querySelector('button').click());expect(getWorkspacePackage).toHaveBeenCalledTimes(2);expect(container.querySelector('button').textContent).toBe('Checking…');expect(container.querySelector('button').disabled).toBe(true);
 await act(async()=>finish(plus));expect(container.querySelector('[role="status"]').textContent).toContain('Package checked. Your workspace has Plus access.');expect(container.textContent).toContain('Last checked');expect(container.querySelector('button').disabled).toBe(false);
 getWorkspacePackage.mockRejectedValueOnce(Error('offline'));await act(async()=>container.querySelector('button').click());expect(getWorkspacePackage).toHaveBeenCalledTimes(3);expect(container.querySelector('[role="alert"]').textContent).toContain('could not be loaded');expect(container.textContent).toContain('Access unavailable');expect(container.querySelector('button').disabled).toBe(false);
});
