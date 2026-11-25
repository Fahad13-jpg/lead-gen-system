import {legal} from '../legal';
import {minimumPasswordLength,passwordPolicyMessage} from './forms';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail,
  signOut, onIdTokenChanged, setPersistence, browserSessionPersistence, validatePassword } from 'firebase/auth';

const config = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};
export const firebaseConfigured = Object.values(config).every(v => typeof v === 'string' && v.trim());
let instance;
function auth() {
  if (!firebaseConfigured) throw new Error('AUTH_NOT_CONFIGURED');
  if (!instance) {
    const app = getApps().find(a => a.name === 'lead-dashboard') || initializeApp(config, 'lead-dashboard');
    instance = getAuth(app);
  }
  return instance;
}
async function prepare() { const a = auth(); await setPersistence(a, browserSessionPersistence); return a; }
export const observeIdentity = (next, error) => firebaseConfigured ? onIdTokenChanged(auth(), next, error) : (() => {});
export const signInGoogle = async () => {
  const a = await prepare(), provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(a, provider);
};
export const signInEmail = async (email, password) => signInWithEmailAndPassword(await prepare(), email.trim(), password);
export const registerEmail = async (email, password, agreement={}) => {
  if(agreement.termsAccepted!==true||agreement.termsVersion!==legal.version)throw Object.assign(new Error('AUTH_TERMS_REQUIRED'),{code:'AUTH_TERMS_REQUIRED'});
  if(typeof password!=='string'||password.length<minimumPasswordLength||password.length>4096)throw Object.assign(new Error('AUTH_PASSWORD_LENGTH'),{code:'AUTH_PASSWORD_LENGTH'});
  const a=await prepare(),policy=await validatePassword(a,password);
  if(!policy.isValid)throw Object.assign(new Error('AUTH_PASSWORD_POLICY'),{code:'AUTH_PASSWORD_POLICY',friendlyMessage:passwordPolicyMessage(policy)});
  const result = await createUserWithEmailAndPassword(a, email.trim(), password);
  try { await sendEmailVerification(result.user); return {...result,verificationEmailSent:true}; }
  catch { return {...result,verificationEmailSent:false}; }
};
export const resetPassword = async email => {
  try { await sendPasswordResetEmail(auth(), email.trim()); }
  catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
};
export const resendVerification = async () => {
  if (!auth().currentUser) throw new Error('SIGN_IN_REQUIRED');
  await sendEmailVerification(auth().currentUser);
};
export const reloadIdentity = async () => {
  const user = auth().currentUser;
  if (user) { await user.reload(); await user.getIdToken(true); }
};
export const signOutIdentity = async () => { if (firebaseConfigured) await signOut(auth()); };
export function authErrorMessage(error) {
  if(error?.code==='AUTH_PASSWORD_POLICY')return error.friendlyMessage||'Choose a password that meets the account requirements.';
  const messages = {
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/wrong-password': 'The email or password is incorrect.',
    'auth/user-not-found': 'The email or password is incorrect.',
    'auth/invalid-login-credentials': 'The email or password is incorrect.',
    'auth/user-disabled': 'This account is unavailable. Contact support if you need help.',
    'auth/account-exists-with-different-credential': 'Try your original sign-in method or request a password reset.',
    'auth/web-storage-unsupported': 'Allow browser session storage, then try signing in again.',
    'auth/cancelled-popup-request': 'A sign-in window is already open. Finish it before trying again.',
    'auth/password-does-not-meet-requirements': 'Choose a password that meets the displayed account requirements.',
    'AUTH_TERMS_REQUIRED': 'Accept the Terms and acknowledge the Privacy notice before creating an account.',
    'AUTH_PASSWORD_LENGTH': 'Use a password with at least 8 characters and no more than 4,096.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/email-already-in-use': 'Unable to create this account. Try signing in or resetting your password.',
    'auth/weak-password': 'Use a longer, unique password that meets the account requirements.',
    'auth/too-many-requests': 'Too many attempts. Please wait before trying again.',
    'auth/popup-blocked': 'Your browser blocked Google sign-in. Allow pop-ups and try again.',
    'auth/popup-closed-by-user': 'Google sign-in was closed. You can try again.',
    'auth/network-request-failed': 'Could not reach the sign-in service. Check your connection and try again.',
    'auth/unauthorized-domain': 'This dashboard address has not been authorized in Firebase.',
    'auth/operation-not-allowed': 'This sign-in method has not been enabled in Firebase.',
    'AUTH_NOT_CONFIGURED': 'Sign-in setup is not complete yet.',
  };
  return messages[error?.code || error?.message] || 'Sign-in could not be completed. Please try again.';
}
