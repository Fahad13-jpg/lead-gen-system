'use strict';
// Embedded in the n8n Code node; deliberately independent of Node globals.
function normalize(raw) {
  const issues=[];
  const text=(v,max=255)=>typeof v==='string'||typeof v==='number' ? String(v).normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)||null : null;
  const field=(v,max)=>{const s=text(v,max);return s&& !/^(n\/?a|unknown|not available|none|null|coming soon|test|lorem ipsum|--?|tbd)$/i.test(s)?s:null;};
  const key=v=>field(v,1000)?.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()||null;
  const source=raw.raw_data&&typeof raw.raw_data==='object'?raw.raw_data:{};
  const countries={pk:'PK',pakistan:'PK',us:'US',usa:'US','united states':'US',gb:'GB',uk:'GB','united kingdom':'GB',ca:'CA',canada:'CA',in:'IN',india:'IN',ae:'AE','united arab emirates':'AE'};
  const countryText=field(raw.country)||field(source.countryCode)||field(raw.search_country);
  const country=countries[countryText?.toLowerCase()]||(/^[a-z]{2}$/i.test(countryText||'')?countryText.toUpperCase():null);
  if(!country)issues.push('country_unknown');
  const emailInput=field(raw.email);
  let email=emailInput?.replace(/^mailto:/i,'').trim()||null;
  if(email){const at=email.lastIndexOf('@');email=email.slice(0,at).toLowerCase()+'@'+email.slice(at+1).toLowerCase();if(email.length>254||! /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email)||email.split('@')[0].includes('..')||email.split('@')[1].includes('..')||email.startsWith('.')){issues.push('email_format_invalid');email=null;}}
  const domain=email?.split('@')[1];
  const disposable=['tempmail.com','mailinator.com','guerrillamail.com','10minutemail.com','throwaway.email','yopmail.com'].some(d=>domain===d||domain?.endsWith('.'+d));
  const emailType=!email?'unknown':disposable?'disposable':/^(info|contact|sales|support|admin|hello|office|team|help|enquiries|inquiries)$/.test(email.split('@')[0])?'role_based':'individual_or_other';
  if(disposable)issues.push('disposable_email');
  let phone=field(raw.phone,100),extension=null;
  if(phone){const ext=phone.match(/(?:ext\.?|x|#)\s*(\d{1,8})$/i);if(ext){extension=ext[1];phone=phone.slice(0,ext.index);}phone=phone.replace(/[\s().-]/g,'');if(phone.startsWith('00'))phone='+'+phone.slice(2);
    if(!phone.startsWith('+')){
      if(country==='PK'&&/^0\d{9,10}$/.test(phone))phone='+92'+phone.slice(1);
      else if(country==='PK'&&/^92\d{9,10}$/.test(phone))phone='+'+phone;
      else if(['US','CA'].includes(country)&&/^\d{10}$/.test(phone))phone='+1'+phone;
      else if(['US','CA'].includes(country)&&/^1\d{10}$/.test(phone))phone='+'+phone;
      else {issues.push('phone_country_or_format_uncertain');phone=null;}
    }
    if(phone&&!/^\+[1-9]\d{7,14}$/.test(phone)){issues.push('phone_format_invalid');phone=null;}
  }
  const websiteInput=field(raw.website,2000);
  let website=null;
  if(websiteInput){let u=websiteInput;if(!/^[a-z][a-z0-9+.-]*:/i.test(u))u='https://'+u;
    const m=u.match(/^(https?):\/\/([a-z0-9.-]+)(?::(\d{1,5}))?([^\s]*)$/i);
    if(m&&/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(m[2])&&!m[2].includes('..')&&!m[2].endsWith('.local')&&(!m[3]||Number(m[3])<=65535)){
      website=m[1].toLowerCase()+'://'+m[2].toLowerCase()+(m[3]?':'+m[3]:'')+(m[4].split('#')[0]||'');
      if(website.length>255){issues.push('website_too_long');website=null;}
    }else issues.push('website_format_invalid');
  }
  const number=(v,min,max)=>{if(v===null||v===undefined||v===''||typeof v==='boolean')return null;const n=Number(String(v).replace(/,/g,''));return Number.isFinite(n)&&n>=min&&n<=max?n:null;};
  const company_name=field(raw.company_name),address=field(raw.address,1000),category=field(raw.category,100);
  const latitude=number(source.location?.lat??source.coordinates?.latitude,-90,90),longitude=number(source.location?.lng??source.coordinates?.longitude,-180,180);
  const review_count=number(source.reviewsCount??source.reviewCount,0,2147483647);
  const facebookPage=raw.source==='facebook_pages'&&/^https:\/\/www\.facebook\.com\/[A-Za-z0-9._/-]+\/$/.test(source.facebook_page_url||'');
  const outcome=!company_name?'review':email&&!disposable||phone?'cleaned':website||facebookPage?'needs_discovery':'review';
  if(facebookPage&&!email&&!phone&&!website)issues.push('facebook_page_only_contact_unavailable');
  if(!company_name)issues.push('business_name_missing');if(!email&&!phone)issues.push(website?'contact_discovery_needed':'no_usable_contact');
  const score=(company_name?15:0)+(email?20:0)+(phone?20:0)+(website?15:0)+(address?15:0)+(country?5:0)+(category?10:0);
  return {staging_id:raw.id,org_id:raw.org_id,lease_token:raw.cleaning_lease,rule_version:'cleaning-v1',outcome,issues,
    fields:{company_name,normalized_name:key(company_name),email,email_type:emailType,phone,website,address,city:field(raw.city,100),state:field(raw.state,100),zip_code:field(raw.zip,20),country,category,latitude,longitude,rating:number(source.totalScore??source.rating,0,5),review_count:review_count===null?null:Math.floor(review_count),data_quality_score:score},
    readiness:{email:email?(disposable?'blocked_disposable':'needs_verification'):'missing',phone:phone?'format_accepted':'missing_or_uncertain',website:website?'format_accepted':'missing_or_invalid'},phone_extension:extension};
}
module.exports={normalize};
