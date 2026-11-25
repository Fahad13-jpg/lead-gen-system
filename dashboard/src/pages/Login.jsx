import React,{useEffect,useRef,useState}from'react';
import{Navigate,Link,useSearchParams}from'react-router-dom';
import{ArrowRight,ShieldCheck,Eye,EyeOff}from'lucide-react';
import{useAuth}from'../context/AuthContext';
import{firebaseConfigured,signInGoogle,signInEmail,registerEmail,resetPassword,authErrorMessage}from'../auth/firebase';
import{validateEmailForm}from'../auth/forms';
import{legal}from'../legal';
import Brand from'../components/Brand';
import ThemeToggle from'../components/ThemeToggle';
import GoogleButton from'../components/GoogleButton';
import'./DesignPreview.css';
import'./Workspace.css';
import'./Login.css';

function PasswordField({id,label,value,onChange,visible,onToggle,autoComplete,disabled,readOnly,error,help,onCaps,refInput}){
 return <div className="ws-field auth-password-field"><label htmlFor={id}>{label}</label><span className="ws-password"><input ref={refInput} id={id} name={id} required type={visible?'text':'password'} readOnly={readOnly} autoComplete={autoComplete} autoCapitalize="none" autoCorrect="off" spellCheck={false} minLength={autoComplete==='new-password'?8:undefined} maxLength={4096} value={value} onChange={e=>onChange(e.target.value)} disabled={disabled} aria-invalid={error?true:undefined} aria-describedby={`${id}-help${error?` ${id}-error`:''}`} onKeyUp={e=>onCaps?.(e.getModifierState?.('CapsLock')===true)} onBlur={()=>onCaps?.(false)}/><button type="button" aria-label={`${visible?'Hide':'Show'} ${label.toLowerCase()}`} aria-controls={id} aria-pressed={visible} disabled={disabled} onClick={onToggle}>{visible?<EyeOff size={18} aria-hidden="true"/>:<Eye size={18} aria-hidden="true"/>}</button></span><small className="ws-password-help" id={`${id}-help`}>{help}</small>{error&&<span className="auth-field-error" id={`${id}-error`}>{error}</span>}</div>;
}
export default function Login({designReview=false}){
 const{status}=useAuth(),[params,setParams]=useSearchParams(),mode=['signup','reset'].includes(params.get('mode'))?params.get('mode'):'login';
 const[email,setEmail]=useState(designReview?'you@example.com':''),[password,setPassword]=useState(designReview?'preview-only':''),[confirmation,setConfirmation]=useState('');
 const[showPassword,setShowPassword]=useState(false),[showConfirmation,setShowConfirmation]=useState(false),[acceptedTerms,setAcceptedTerms]=useState(false),[caps,setCaps]=useState(false);
 const[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[fieldErrors,setFieldErrors]=useState({}),[verificationNotice,setVerificationNotice]=useState('');
 const lock=useRef(false),fields=useRef({});
 useEffect(()=>{setPassword(designReview?'preview-only':'');setConfirmation('');setShowPassword(false);setShowConfirmation(false);setAcceptedTerms(false);setCaps(false);setError('');setMessage('');setFieldErrors({});setVerificationNotice('');},[mode,designReview]);
 const disabled=busy||(!firebaseConfigured&&!designReview)||status==='loading';
 if(status==='ready')return <Navigate to="/dashboard" replace/>;
 if(['verify_email','choose_org','no_membership','access_unavailable'].includes(status)&&!busy)return <Navigate to="/access" replace state={verificationNotice?{verificationNotice}:undefined}/>;
 function setMode(next){if(!busy)setParams(next==='login'?{}:{mode:next});}
 function clearField(name){setFieldErrors(v=>({...v,[name]:undefined}));setError('');}
 async function run(operation){
  if(designReview){setMessage('This is a design preview. Sign-in and account creation are disabled.');return;}
  if(lock.current||disabled)return;
  lock.current=true;setBusy(true);setError('');setMessage('');
  try{await operation();}catch(e){setError(authErrorMessage(e));}
  finally{lock.current=false;setBusy(false);}
 }
 function submit(e){e.preventDefault();if(lock.current||disabled)return;if(designReview){run(()=>{});return;}
  const invalid=validateEmailForm({mode,email,password,confirmation,acceptedTerms});setFieldErrors(invalid);
  const first=Object.keys(invalid)[0];if(first){fields.current[first]?.focus();return;}
  run(async()=>{
   if(mode==='reset'){await resetPassword(email);setMessage('If a matching account exists, check your inbox and spam folder for reset instructions.');}
   else if(mode==='signup'){const result=await registerEmail(email,password,{termsAccepted:true,termsVersion:legal.version});const notice=result?.verificationEmailSent===false?'Your account was created, but the verification email could not be sent. Request another email below.':'Verification email sent. Check your inbox and spam folder.';setVerificationNotice(notice);setMessage(notice);setPassword('');setConfirmation('');setShowPassword(false);setShowConfirmation(false);}
   else await signInEmail(email,password);
  });
 }
 function google(){if(mode==='signup'&&!acceptedTerms&&!designReview){setFieldErrors(v=>({...v,terms:'Accept the Terms and acknowledge the Privacy notice first.'}));fields.current.terms?.focus();return;}run(signInGoogle);}
 const signup=mode==='signup';
 return <div className="dp-app ws-auth-page"><a className="dp-skip" href="#auth-main">Skip to account form</a><main className="ws-auth-shell">
  <header className="lm-auth-header"><Link className="ws-auth-brand" to="/" aria-label="Back to home"><Brand/></Link><ThemeToggle/></header>
  <div className="ws-auth-columns">
  <section id="auth-main" tabIndex={-1} className="ws-auth-card" aria-labelledby="auth-title"><h1 id="auth-title">{signup?'Create your account':mode==='reset'?'Reset your password':'Sign in'}</h1><p>{signup?'Create an account with email or Google. Then finish your workspace setup.':mode==='reset'?'Enter your email to request a password reset.':'Welcome back. Sign in to open your workspace.'}</p>
   {!firebaseConfigured&&!designReview&&<div className="ws-auth-notice" role="status">Sign-in is temporarily unavailable. You can still explore the dashboard preview.</div>}
   {status==='loading'&&<p className="auth-small" role="status">Checking sign-in status…</p>}
   {mode!=='reset'&&<><GoogleButton disabled={disabled||signup&&!acceptedTerms&&!designReview} onClick={google}/>{signup&&!acceptedTerms&&<p className="auth-small">Accept the Terms below to enable Google sign-up.</p>}<div className="ws-auth-divider"><span>or use email and password</span></div></>}
   <form onSubmit={submit} noValidate aria-busy={busy}>
    <div className="ws-field"><label htmlFor="auth-email">Email address</label><input ref={el=>fields.current.email=el} id="auth-email" name="email" required type="email" readOnly={designReview} autoComplete={mode==='reset'?'email':'username'} autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={254} value={email} onChange={e=>{setEmail(e.target.value);clearField('email');setMessage('');}} placeholder="you@company.com" disabled={busy} aria-invalid={fieldErrors.email?true:undefined} aria-describedby={fieldErrors.email?'auth-email-error':undefined}/>{fieldErrors.email&&<span className="auth-field-error" id="auth-email-error">{fieldErrors.email}</span>}</div>
    {mode!=='reset'&&<PasswordField id="auth-password" label="Password" value={password} onChange={v=>{setPassword(v);clearField('password');clearField('confirmation');}} visible={showPassword} onToggle={()=>setShowPassword(v=>!v)} autoComplete={signup?'new-password':'current-password'} disabled={busy} readOnly={designReview} refInput={el=>fields.current.password=el} onCaps={setCaps} error={fieldErrors.password} help={signup?'Use at least 8 characters. A long, unique password is better.':'You can paste a password or use your password manager.'}/>}
    {caps&&<p className="auth-small auth-caps" role="status">Caps Lock is on.</p>}
    {signup&&<><PasswordField id="auth-confirm-password" label="Confirm password" value={confirmation} onChange={v=>{setConfirmation(v);clearField('confirmation');}} visible={showConfirmation} onToggle={()=>setShowConfirmation(v=>!v)} autoComplete="new-password" disabled={busy} readOnly={designReview} refInput={el=>fields.current.confirmation=el} error={fieldErrors.confirmation} help="Enter the same password again."/>
    <div className="auth-consent"><input ref={el=>fields.current.terms=el} type="checkbox" id="auth-terms" name="terms" required checked={acceptedTerms} disabled={busy} onChange={e=>{setAcceptedTerms(e.target.checked);clearField('terms');}} aria-invalid={fieldErrors.terms?true:undefined} aria-describedby={`auth-terms-links${fieldErrors.terms?' auth-terms-error':''}`}/><div><label htmlFor="auth-terms">I agree to the Terms and Conditions and acknowledge the Privacy notice.</label><p id="auth-terms-links"><Link to="/terms" target="_blank" rel="noopener noreferrer">Read Terms</Link><span aria-hidden="true"> · </span><Link to="/privacy" target="_blank" rel="noopener noreferrer">Read Privacy notice</Link><span className="auth-sr-only"> (links open in a new tab)</span></p></div></div>{fieldErrors.terms&&<p className="auth-field-error" id="auth-terms-error">{fieldErrors.terms}</p>}</>}
    {mode==='login'&&<button className="dp-text-button ws-forgot" type="button" disabled={busy} onClick={()=>setMode('reset')}>Forgot password?</button>}
    {error&&<div className="ws-auth-error" role="alert">{error}</div>}{message&&<div className="ws-auth-notice" role="status">{message}</div>}
    <button className="dp-primary ws-auth-submit" type="submit" disabled={disabled||signup&&!acceptedTerms&&!designReview} aria-busy={busy}>{busy?'Please wait…':signup?'Create account':mode==='reset'?'Send reset instructions':'Sign in'}{!busy&&<ArrowRight size={17} aria-hidden="true"/>}</button>
   </form>
   <p className="ws-auth-switch">{mode==='login'?'New here? ':mode==='reset'?'Remember your password? ':'Already have an account? '}<button type="button" disabled={busy} onClick={()=>setMode(mode==='login'?'signup':'login')}>{mode==='login'?'Create an account':mode==='reset'?'Back to sign in':'Sign in'}</button></p>
   {!signup&&<p className="lm-legal-links">Read our <Link to="/terms" target="_blank" rel="noopener noreferrer">Terms</Link> and <Link to="/privacy" target="_blank" rel="noopener noreferrer">Privacy notice</Link>.</p>}
  </section><section className="ws-auth-intro"><h2>Find businesses.<br/>Start the right conversation.</h2><p>Review your leads, prepare messages and manage outreach in one workspace.</p><div className="ws-auth-principle"><ShieldCheck size={22} aria-hidden="true"/><div><strong>Your workspace, your accounts</strong><p>You control the accounts you connect, the messages you approve and when sending starts.</p></div></div><Link className="dp-text-button" to="/design-preview">Preview the dashboard <ArrowRight size={16} aria-hidden="true"/></Link></section></div><footer className="ws-auth-footer">Signing in does not start a search or send outreach. New accounts must verify their email before creating a workspace.</footer>
 </main></div>;
}
