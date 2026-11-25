import React,{useEffect,useRef,useState} from 'react';
import {useLocation,Link} from 'react-router-dom';
import metadata from '../routeMetadata';
import {siteConfiguration} from './PageMetadata';
const preference='lm_public_analytics_choice';
function saved(){try{return localStorage.getItem(preference)||null;}catch{return 'denied';}}
export default function PublicAnalytics(){
 const {pathname}=useLocation(),cfg=siteConfiguration(),id=cfg.ga4MeasurementId||'',page=metadata.getPage(pathname);
 const [choice,setChoice]=useState(saved),[open,setOpen]=useState(false),last=useRef('');
 const eligible=page.found&&page.indexable&&!!cfg.publicOrigin&&/^G-[A-Z0-9]{6,20}$/.test(id);
 useEffect(()=>{
  if(!id)return;
  const allowed=eligible&&choice==='granted';window['ga-disable-'+id]=!allowed;
  if(!allowed){last.current='';return;}
  if(!document.getElementById('public-ga-tag')){
   window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};
   window.gtag('js',new Date());window.gtag('config',id,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,page_location:cfg.publicOrigin+pathname,page_referrer:''});
   const script=document.createElement('script');script.id='public-ga-tag';script.async=true;script.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(id);document.head.appendChild(script);
  }
  if(last.current!==pathname){last.current=pathname;window.gtag('event','page_view',{send_to:id,page_location:cfg.publicOrigin+pathname,page_title:page.title,page_referrer:''});}
  return()=>{window['ga-disable-'+id]=true;};
 },[id,eligible,choice,pathname,cfg.publicOrigin,page.title]);
 function choose(value){if(id&&value!=='granted')window['ga-disable-'+id]=true;try{localStorage.setItem(preference,value);}catch{}setChoice(value);setOpen(false);}
 if(!eligible)return null;
 return <aside className="public-analytics-choice" aria-label="Analytics preferences">{choice&&!open?<button className="dp-text-button" onClick={()=>setOpen(true)}>Analytics preferences · {choice==='granted'?'allowed':'off'}</button>:<><p>Optional analytics helps us understand visits to our public pages. It loads only if you agree. Read our <Link to="/privacy">privacy notice</Link>.</p><div><button className="ns-primary" onClick={()=>choose('granted')}>Allow analytics</button><button className="live-secondary" onClick={()=>choose('denied')}>Decline</button></div></>}</aside>;
}
