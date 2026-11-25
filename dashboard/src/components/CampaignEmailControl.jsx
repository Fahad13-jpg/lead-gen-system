import React,{useEffect,useRef,useState}from'react';
import{useAuth}from'../context/AuthContext';
import{saveCampaignPreferences}from'../api/client';

export default function CampaignEmailControl({campaignId,version,enabled,refresh}){
 const{user,organization}=useAuth(),key=`lg_pause_email_${user.subject}_${organization.org_id}_${campaignId}`;
 const[busy,setBusy]=useState(false),[message,setMessage]=useState(''),pending=useRef(false);
 const[uncertain,setUncertain]=useState(()=>{try{return JSON.parse(sessionStorage.getItem(key))||null;}catch{return{version};}});
 const allowed=['owner','admin'].includes(organization.role);
 useEffect(()=>{if(uncertain&&version>uncertain.version){sessionStorage.removeItem(key);setUncertain(null);setMessage(enabled===false?'Email policy is now paused.':'Campaign changed. Review its current email policy before another action.');}},[version,enabled,key,uncertain]);
 async function pause(){
  if(pending.current||uncertain||!allowed||enabled!==true)return;
  pending.current=true;setBusy(true);setMessage('');
  try{sessionStorage.setItem(key,JSON.stringify({version}));setUncertain({version});}catch{setMessage('Enable session storage before pausing email.');pending.current=false;setBusy(false);return;}
  try{await saveCampaignPreferences({campaign_id:Number(campaignId),expected_version:version,preferences:{pause_email:true}});sessionStorage.removeItem(key);setUncertain(null);setMessage('Email policy paused. Refresh to see the new campaign version.');refresh();}
  catch(e){if([400,401,403,409].includes(e.response?.status)){sessionStorage.removeItem(key);setUncertain(null);setMessage('Pause was rejected. Refresh the campaign and check your access.');refresh();}else setMessage('Pause result uncertain. Refresh to check the saved policy; the request has not been retried.');}
  finally{pending.current=false;setBusy(false);}
 }
 return <section className="pr-plan"><div className="pr-body"><h2>Email sending</h2><p className="pr-note">Email sending is {enabled===true?'on':enabled===false?'paused':'not set up'}. Messages still need your approval.</p><p className="pr-note">Pausing stops new emails. Emails already sent cannot be recalled. Reply checks continue separately.</p>{message&&<p role="status" className="pr-note">{message}</p>}{uncertain?<button className="live-secondary" onClick={refresh} disabled={busy}>Check email status</button>:<button className="live-secondary" onClick={pause} disabled={busy||!allowed||enabled!==true}>{busy?'Pausing…':'Pause emails'}</button>}{!allowed&&<p className="pr-note">Only owners and admins can pause campaign email.</p>}</div></section>;
}
