import React,{act} from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from './AuthContext';
import { fetchMembershipSession, configureAccess, createWorkspace } from '../api/client';

let mockIdentityListener;
jest.mock('../auth/firebase', () => ({
  firebaseConfigured: true,
  observeIdentity: callback => { mockIdentityListener = callback; return () => {}; },
  signOutIdentity: jest.fn(), reloadIdentity: jest.fn(),
}));
jest.mock('../api/client', () => ({ fetchMembershipSession: jest.fn(), configureAccess: jest.fn(), createWorkspace:jest.fn(),getWorkspaceCreation:jest.fn() }));
const fixtureIdentity = { emailVerified: true, email: 'fixture@example.test', getIdToken: async () => 'fixture-token' };
const fixtureSession = { identity_verified: true, email_verified: true, subject: 'a'.repeat(64), organizations: [] };
let latest;
function Probe() {
  const state = useAuth();
  latest=state;
  return <div>{state.status}:{state.organization?.org_id || ''}</div>;
}
let container, root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<AuthProvider><Probe /></AuthProvider>));
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
test('a valid signed-in response with no memberships reaches no_membership', async () => {
  fetchMembershipSession.mockResolvedValue(fixtureSession);
  await act(async () => { await mockIdentityListener(fixtureIdentity); });
  expect(container.textContent).toBe('no_membership:');
  expect(fetchMembershipSession).toHaveBeenCalledWith('fixture-token');
  expect(configureAccess.mock.calls.some(([value]) => value !== null)).toBe(false);
});
test('a valid single membership reaches ready with the verified organization', async () => {
  fetchMembershipSession.mockResolvedValue({ ...fixtureSession, organizations: [{org_id:7,name:'Fixture organization',role:'owner',active:true}] });
  await act(async () => { await mockIdentityListener(fixtureIdentity); });
  expect(container.textContent).toBe('ready:7');
  expect(configureAccess).toHaveBeenLastCalledWith(expect.objectContaining({org_id:7,getToken:expect.any(Function)}));
});
test('malformed session data fails closed', async () => {
  fetchMembershipSession.mockResolvedValue({ id: 1 });
  await act(async () => { await mockIdentityListener(fixtureIdentity); });
  expect(container.textContent).toBe('access_unavailable:');
});
test('sign-out prevents an older membership response restoring access', async () => {
  let release;
  fetchMembershipSession.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  await act(async () => {
    const pending = mockIdentityListener(fixtureIdentity);
    await Promise.resolve();
    await mockIdentityListener(null);
    release(fixtureSession);
    await pending;
  });
  expect(container.textContent).toBe('signed_out:');
});
test('workspace creation becomes ready only after membership is loaded from the server',async()=>{
 fetchMembershipSession.mockResolvedValue(fixtureSession);await act(async()=>mockIdentityListener(fixtureIdentity));
 createWorkspace.mockResolvedValue({saved:true,organization:{org_id:7},provider_credits_granted:false,ai_requests_granted:0,sending_enabled:false});fetchMembershipSession.mockResolvedValue({...fixtureSession,organizations:[{org_id:7,name:'New workspace',role:'owner',active:true}]});
 await act(async()=>latest.createOrganization({name:'New workspace'}));expect(container.textContent).toBe('ready:7');expect(configureAccess).toHaveBeenLastCalledWith(expect.objectContaining({org_id:7}));
});
test('sign-out during workspace creation cannot restore organization access',async()=>{
 fetchMembershipSession.mockResolvedValue(fixtureSession);await act(async()=>mockIdentityListener(fixtureIdentity));let finish;createWorkspace.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 let pending;await act(async()=>{pending=latest.createOrganization({name:'New workspace'});await Promise.resolve();});await act(async()=>mockIdentityListener(null));finish({saved:true,organization:{org_id:7},provider_credits_granted:false,ai_requests_granted:0,sending_enabled:false});await expect(pending).rejects.toThrow('ACCESS_CHANGED');expect(container.textContent).toBe('signed_out:');
});

test('same-user token refresh keeps the workspace visible and does not invalidate in-flight access',async()=>{const person={...fixtureIdentity,uid:'same-user'};fetchMembershipSession.mockResolvedValue({...fixtureSession,organizations:[{org_id:7,name:'Workspace',role:'owner',active:true}]});await act(async()=>mockIdentityListener(person));const before=configureAccess.mock.calls.length;let finish;fetchMembershipSession.mockImplementationOnce(()=>new Promise(resolve=>finish=resolve));let pending;await act(async()=>{pending=mockIdentityListener(person);await Promise.resolve();});expect(container.textContent).toBe('ready:7');expect(configureAccess.mock.calls.length).toBe(before);await act(async()=>{finish({...fixtureSession,organizations:[{org_id:7,name:'Workspace',role:'owner',active:true}]});await pending;});expect(container.textContent).toBe('ready:7');expect(configureAccess.mock.calls.length).toBe(before);});
test('background membership failure clears access and a removed workspace is not silently replaced',async()=>{const person={...fixtureIdentity,uid:'same-user'};fetchMembershipSession.mockResolvedValue({...fixtureSession,organizations:[{org_id:7,name:'Workspace',role:'owner',active:true}]});await act(async()=>mockIdentityListener(person));fetchMembershipSession.mockResolvedValueOnce({...fixtureSession,organizations:[{org_id:8,name:'Other',role:'member',active:true}]});await act(async()=>mockIdentityListener(person));expect(container.textContent).toBe('choose_org:');expect(configureAccess).toHaveBeenLastCalledWith(null);fetchMembershipSession.mockResolvedValue({...fixtureSession,organizations:[{org_id:7,name:'Workspace',role:'owner',active:true}]});await act(async()=>mockIdentityListener(person));fetchMembershipSession.mockRejectedValueOnce(Error('revoked'));await act(async()=>mockIdentityListener(person));expect(container.textContent).toBe('access_unavailable:');expect(configureAccess).toHaveBeenLastCalledWith(null);});
