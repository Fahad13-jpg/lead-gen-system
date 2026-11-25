import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { firebaseConfigured, observeIdentity, signOutIdentity, reloadIdentity } from '../auth/firebase';
import sessionContract from '../auth/session';
import { configureAccess, fetchMembershipSession, createWorkspace, getWorkspaceCreation } from '../api/client';

const AuthContext = createContext(null);
const { sessionFromResponse, selectOrganization } = sessionContract;
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: firebaseConfigured ? 'loading' : 'not_configured', user: null, organization: null });
  const identity = useRef(null), revision = useRef(0), lastState=useRef(state);
  lastState.current=state;
  useEffect(() => {
    try { localStorage.removeItem('lg_user'); } catch { /* Storage restrictions do not grant access. */ }
    const stop = observeIdentity(async current => {
      const version = ++revision.current,previous=lastState.current;
      const background=!!current?.uid&&current.uid===identity.current?.uid&&previous.status==='ready'&&!!previous.organization;
      identity.current = current;
      if(!background)configureAccess(null);
      if (!current) { setState({ status: 'signed_out', user: null, organization: null }); return; }
      if (!current.emailVerified) { configureAccess(null);setState({ status: 'verify_email', user: null, organization: null,verificationEmail:current.email||null }); return; }
      if(!background)setState({ status: 'loading', user: null, organization: null });
      try {
        const result = sessionFromResponse(await fetchMembershipSession(await current.getIdToken()), current.email);
        if (version !== revision.current) return;
        const organization = background ? result.organizations.find(o=>o.org_id===previous.organization.org_id)||null : result.organizations.length === 1 ? result.organizations[0] : null;
        if(!organization)configureAccess(null);
        else if(!background)configureAccess({ org_id: organization.org_id, getToken: () => current.getIdToken() });
        setState({ status: organization ? 'ready' : result.organizations.length ? 'choose_org' : 'no_membership', user: result, organization });
      } catch {
        if (version === revision.current) { configureAccess(null);setState({ status: 'access_unavailable', user: null, organization: null }); }
      }
    }, () => { ++revision.current; configureAccess(null); setState({ status: 'access_unavailable', user: null, organization: null }); });
    return () => { ++revision.current; stop(); configureAccess(null); };
  }, []);
  const chooseOrganization = orgId => {
    const organization = selectOrganization(state.user, orgId);
    if (!identity.current) throw Error('SIGN_IN_REQUIRED');
    const current = identity.current;
    configureAccess({ org_id: organization.org_id, getToken: () => current.getIdToken() });
    setState(s => ({ ...s, status: 'ready', organization }));
  };
  async function workspaceAction(payload,checkOnly=false){
    const current=identity.current,version=revision.current;
    if(!current||!current.emailVerified||state.status!=='no_membership')throw Error('SIGN_IN_REQUIRED');
    const token=await current.getIdToken();
    const receipt=checkOnly?await getWorkspaceCreation(token,payload.request_id):await createWorkspace(token,payload);
    if(version!==revision.current||identity.current!==current)throw Error('ACCESS_CHANGED');
    if(receipt.saved===false&&checkOnly)return receipt;
    if(receipt.saved!==true||!Number.isSafeInteger(receipt.organization?.org_id)||receipt.organization.org_id<1||receipt.provider_credits_granted!==false||receipt.ai_requests_granted!==0||receipt.sending_enabled!==false)throw Error('WORKSPACE_CREATION_UNCONFIRMED');
    const result=sessionFromResponse(await fetchMembershipSession(await current.getIdToken()),current.email);
    if(version!==revision.current||identity.current!==current)throw Error('ACCESS_CHANGED');
    const organization=selectOrganization(result,receipt.organization.org_id);
    configureAccess({org_id:organization.org_id,getToken:()=>current.getIdToken()});
    setState({status:'ready',user:result,organization});return receipt;
  }
  const logout = async () => {
    ++revision.current; configureAccess(null); identity.current = null;
    setState({ status: 'signed_out', user: null, organization: null });
    await signOutIdentity();
  };
  return <AuthContext.Provider value={{ ...state, chooseOrganization, logout, refreshIdentity: reloadIdentity, createOrganization:payload=>workspaceAction(payload), checkOrganizationCreation:payload=>workspaceAction(payload,true) }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);

// Public design-review identity only: no observer, token or API access is configured.
export function DesignReviewIdentity({children}){return <AuthContext.Provider value={{status:'signed_out',user:null,organization:null}}>{children}</AuthContext.Provider>;}
