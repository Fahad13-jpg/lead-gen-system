import {useEffect} from 'react';
import {useLocation} from 'react-router-dom';
import metadata from '../routeMetadata';
function meta(name,value,property=false){const key=property?'property':'name';let element=document.head.querySelector(`meta[${key}="${name}"]`);if(!element){element=document.createElement('meta');element.setAttribute(key,name);document.head.appendChild(element);}element.content=value;}
export function siteConfiguration(){try{return JSON.parse(document.getElementById('public-site-config')?.textContent||'{}');}catch{return{};}}
export default function PageMetadata(){
 const {pathname,search}=useLocation();
 useEffect(()=>{
  const page={...metadata.getPage(pathname)},cfg=siteConfiguration();if(pathname==='/login'){const mode=new URLSearchParams(search).get('mode');if(mode==='signup'){page.title='Create your account | '+metadata.site.brand.name;page.description='Create an account and verify your email to set up your workspace.';}else if(mode==='reset'){page.title='Reset your password | '+metadata.site.brand.name;page.description='Request a secure password reset for your account.';}}document.title=page.title;
  meta('description',page.description);meta('robots',page.indexable&&cfg.indexing?'index, follow':'noindex, nofollow');
  meta('og:title',page.title,true);meta('og:description',page.description,true);
  let canonical=document.querySelector('link[rel="canonical"]');
  if(page.indexable&&cfg.publicOrigin){if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.appendChild(canonical);}canonical.href=cfg.publicOrigin+page.path;meta('og:url',canonical.href,true);}else{canonical?.remove();if(cfg.publicOrigin)meta('og:url',cfg.publicOrigin+'/',true);}
 },[pathname,search]);
 return null;
}
