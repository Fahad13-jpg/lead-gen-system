'use strict';
const assert=require('node:assert/strict'),rt=require('../../scripts/lead-enrichment/runtime.cjs'),{basic}=require('../../scripts/lead-enrichment/worker.cjs');
(async()=>{
 const now=Date.now(),date=new Date(now).toISOString(),company='https://www.linkedin.com/company/clinic-one',person='https://www.linkedin.com/in/alex-owner';
 const lead={id:1,org_id:1,company_name:'Clinic One',category:'Dental clinic',city:'Islamabad',website:'https://clinic.example',phone:'+92515550100'};
 const input=rt.normalizeLinkedIn({org_id:1,lead_id:1,profiles:[{profile_url:company,name:'Clinic One',website:lead.website,observed_at:date},{profile_url:person,name:'Alex',role:'CEO',company_name:'Clinic One',company_profile:company,observed_at:date,posts:[{url:'https://www.linkedin.com/posts/alex-opening-activity-123',author_profile:person,published_at:date,text:'Opening our new clinic in Islamabad.'}]}]});
 let result=rt.research({lead,basic:{status:'complete'},linkedin:input},now);assert.equal(result.linkedin.profiles.length,2);assert.equal(result.personalization.length,1);assert.equal(result.personalization[0].author_kind,'person');assert.equal(result.personalization[0].usage,'draft_only');assert.equal(result.readiness.campaign,'configuration_needed');
 const wrong=structuredClone(input);wrong.profiles[1].company_profile='https://www.linkedin.com/company/other';assert.equal(rt.research({lead,linkedin:wrong},now).personalization.length,0);
 const old=structuredClone(input);old.profiles[1].posts[0].published_at=new Date(now-91*86400000).toISOString();assert.equal(rt.research({lead,linkedin:old},now).personalization.length,0);
 assert.throws(()=>rt.normalizeLinkedIn({...input,org_id:0}));assert.throws(()=>rt.normalizeLinkedIn({...input,profiles:[{profile_url:'https://linkedin.com.evil.test/in/person',observed_at:date}]}));
 const author=structuredClone(input);author.profiles[1].posts[0].author_profile=company;assert.throws(()=>rt.normalizeLinkedIn(author));
 const campaign=rt.normalizeCampaign({org_id:1,lead_id:1,config:{offer:'Dental website and booking',target_terms:['dental'],locations:['Islamabad']}}).config;
 result=rt.research({lead,campaign,basic:{observations:{booking_link:'not_observed'}}});assert(result.campaign_fit.industry_match);assert.equal(result.opportunities[0].type,'hypothesis');
 const page=async u=>({url:u,status:200,headers:{'content-type':'text/html'},body:'<link href="/contact-styles.css"><meta name="description" content="Dental services"><h2>Dental implants</h2><a href="/appointments">Book</a><script src="/wp-content/app.js"></script>'});
 const b=await basic({lead},page);assert.equal(b.observations.booking_link,'observed');assert.equal(b.observations.contact_form,'not_observed');assert.equal(b.business.timezone,null);assert.equal(b.services.length,1);assert(b.technologies.includes('WordPress'));assert(b.pages.length<=3);assert(b.pages.every(p=>!p.url.endsWith('.css')));
 const missing=await basic({lead:{...lead,website:null}});assert.equal(missing.observations.contact_form,'unknown');assert.equal(missing.status,'partial');
 const blocked=await basic({lead},async()=>{throw Object.assign(Error('blocked'),{code:'blocked_target'});});assert.equal(blocked.status,'partial');assert.equal(blocked.observations.booking_link,'unknown');
 // n8n's Code sandbox may not expose URL; pure runtime must still validate intake.
 const vm=require('vm');const sandbox=vm.runInNewContext('('+rt.enrichmentRuntime.toString()+')()');assert.equal(sandbox.linkedin(company),company);
 console.log('PASS: evidence identity, author attribution, recency, campaign fit, website observations, missing data, bounded crawling and n8n sandbox compatibility');
})().catch(e=>{console.error(e);process.exitCode=1;});
