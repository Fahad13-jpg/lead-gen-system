'use strict';

// These functions are embedded verbatim in n8n Code nodes by build.cjs.
// Keep each function self-contained: no filesystem access or package imports.
function validateRequest() {
  const b = { ...($input.first().json.body || {}) };
  if (Array.isArray(b.search_terms) && b.search_query === undefined) b.search_query = b.search_terms[0];
  if (Array.isArray(b.locations) && b.location === undefined) b.location = b.locations[0];
  const fail = (message) => ({ error: true, code: 'INVALID_REQUEST', message, http_status: 400 });
  const integer = (v) => (typeof v === 'number' || typeof v === 'string') && /^\d+$/.test(String(v)) && Number.isSafeInteger(Number(v));
  if (!integer(b.org_id) || Number(b.org_id) < 1) return fail('org_id must be a positive integer');
  if (!['google_maps', 'yellow_pages','facebook_pages','yelp'].includes(b.source)) return fail('Unsupported gathering source');
  for (const key of ['job_name', 'search_query', 'location']) {
    if (typeof b[key] !== 'string' || !b[key].trim() || b[key].length > 255 || /[\u0000-\u001f]/.test(b[key])) return fail(key + ' must contain 1–255 printable characters');
  }
  if (!integer(b.max_results) || Number(b.max_results) < 1 || Number(b.max_results) > 500) return fail('max_results must be an integer from 1 to 500');
  if(b.source==='facebook_pages'&&Number(b.max_results)>50)return fail('Facebook discovery is limited to 50 businesses per run');
  if(b.source==='yelp'&&(Number(b.max_results)>50||b.country_code!=='US'))return fail('Yelp currently requires country_code US and at most 50 businesses');
  const budget = b.max_cost_usd === undefined ? 0.5 : Number(b.max_cost_usd);
  if (typeof b.max_cost_usd === 'boolean' || !Number.isFinite(budget) || budget < 0.01 || budget > 10) return fail('max_cost_usd must be between 0.01 and 10');
  if(b.source==='facebook_pages'&&budget>0.5)return fail('Facebook discovery provider ceiling must not exceed $0.50');
  if(b.source==='yelp'&&budget>0.5)return fail('Yelp provider ceiling must not exceed $0.50');
  if (b.source === 'yellow_pages' && b.country_code !== 'US') return fail('Yellow Pages requires country_code: US and a US location');
  if (b.request_id !== undefined && (typeof b.request_id !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(b.request_id))) return fail('request_id must be 8–100 letters, digits, underscores or hyphens');
  if (b.scrape_contacts !== undefined && typeof b.scrape_contacts !== 'boolean') return fail('scrape_contacts must be boolean');
  if (b.website_filter !== undefined && !['allPlaces', 'withWebsite', 'withoutWebsite'].includes(b.website_filter)) return fail('Invalid website_filter');
  if (b.source !== 'google_maps' && b.website_filter && b.website_filter !== 'allPlaces') return fail('website_filter is supported only for Google Maps');
  if (b.billing_mode !== undefined && !['platform','byok'].includes(b.billing_mode)) return fail('billing_mode must be platform or byok');
  const customerCap=b.max_customer_cost_usd===undefined?budget:Number(b.max_customer_cost_usd);
  if(typeof b.max_customer_cost_usd==='boolean'||!Number.isFinite(customerCap)||customerCap<0||customerCap>100) return fail('max_customer_cost_usd must be between 0 and 100');
  if (b.result_mode !== undefined && !['new','matching'].includes(b.result_mode)) return fail('result_mode must be new or matching');
  const candidateLimit=b.candidate_limit===undefined ? ((b.result_mode||'new')==='new'?Math.min(1500,Number(b.max_results)*3):Number(b.max_results)) : Number(b.candidate_limit);
  if (!integer(b.candidate_limit===undefined?candidateLimit:b.candidate_limit) || candidateLimit<Number(b.max_results) || candidateLimit>1500) return fail('candidate_limit must be an integer between max_results and 1500');
  if(b.source==='facebook_pages'&&candidateLimit>150)return fail('Facebook discovery is limited to 150 source records');
  if(b.source==='yelp'&&candidateLimit>150)return fail('Yelp is limited to 150 source records');
  const lists = {};
  for (const [key, fallback, limit] of [['search_terms',[b.search_query],10],['locations',[b.location],10],['include_categories',[],20],['exclude_categories',[],20]]) {
    const values = b[key] === undefined ? fallback : b[key];
    if (!Array.isArray(values) || values.length > limit || (['locations','search_terms'].includes(key) && !values.length) || values.some(v => typeof v !== 'string' || !v.trim() || v.length > 255 || /[\u0000-\u001f]/.test(v))) return fail('Invalid ' + key);
    lists[key] = [...new Map(values.map(v => [v.trim().toLowerCase(),v.trim()])).values()];
  }
  if (lists.search_terms.length * lists.locations.length > Math.min(20,Number(b.max_results))) return fail('Search combinations must not exceed 20 or max_results');
  for (const key of ['refresh','require_contact','exclude_closed','exclude_unrelated_page_types']) if (b[key] !== undefined && typeof b[key] !== 'boolean') return fail(key + ' must be boolean');
  if (b.country_code !== undefined && !/^[A-Z]{2}$/.test(b.country_code)) return fail('country_code must be two uppercase letters');
  const reuse = b.reuse_hours === undefined ? 24 : Number(b.reuse_hours);
  if (!integer(reuse) || reuse < 0 || reuse > 168) return fail('reuse_hours must be an integer from 0 to 168');
  let center = null;
  if (b.center !== undefined || b.radius_km !== undefined) {
    center = b.center;
    if (b.source !== 'google_maps' || lists.locations.length !== 1 || !center || typeof center.latitude !== 'number' || typeof center.longitude !== 'number' || !Number.isFinite(center.latitude) || !Number.isFinite(center.longitude) || Math.abs(center.latitude)>85 || Math.abs(center.longitude)>180 || typeof b.radius_km !== 'number' || !Number.isFinite(b.radius_km) || b.radius_km<0.1 || b.radius_km>100) return fail('Radius requires one Google Maps location, valid center coordinates and radius_km from 0.1 to 100');
    if (Math.abs(center.longitude)+b.radius_km/(111*Math.cos(center.latitude*Math.PI/180))>=180) return fail('Radius areas crossing the date line are not supported');
    center = {latitude:center.latitude,longitude:center.longitude};
  }
  return { error: false, org_id: Number(b.org_id), source: b.source, job_name: b.job_name.trim(), search_query: lists.search_terms[0], location: lists.locations[0], max_results: Number(b.max_results), max_cost_usd: budget, request_id: b.request_id || 'execution_' + $execution.id, scrape_contacts: b.scrape_contacts !== false, website_filter: b.website_filter || 'allPlaces', country_code: b.country_code || null, ...lists, center, radius_km:center?b.radius_km:null, refresh:b.refresh===true, reuse_hours:reuse, require_contact:b.require_contact===true, exclude_closed:b.exclude_closed!==false, exclude_unrelated_page_types:b.source==='facebook_pages'&&b.exclude_unrelated_page_types!==false, billing_mode:b.billing_mode||'platform',result_mode:b.result_mode||'new',candidate_limit:candidateLimit,max_customer_cost_usd:customerCap };
}

function validateConnection() {
  const b = $input.first().json.body || {};
  if (!/^\d+$/.test(String(b.org_id)) || !Number.isSafeInteger(Number(b.org_id)) || Number(b.org_id) < 1 || typeof b.apify_api_key !== 'string' || !/^apify_api_[A-Za-z0-9]+$/.test(b.apify_api_key.trim())) return { error: true, http_status: 400, message: 'A positive org_id and valid-format Apify key are required' };
  return { error: false, org_id: Number(b.org_id), apify_api_key: b.apify_api_key.trim() };
}

function parseConnection() {
  const r = $input.first().json;
  const input = $('Validate Input').first(0).json;
  const valid = Number(r.statusCode) === 200 && typeof r.body?.data?.id === 'string';
  return { ...input, valid, provider_user_id:valid?r.body.data.id:null,http_status: valid ? 200 : 400, message: valid ? 'Apify account verified' : 'Apify verification failed; the existing key was not changed' };
}

function prepareActor() {
  const j = $input.first().json;
  const google = j.source === 'google_maps';
  const settings = j.request_settings || {};
  const terms=settings.search_terms||[j.search_query], locations=settings.locations||[j.location];
  const candidateLimit=j.candidate_limit||j.max_results;
  if(j.source==='facebook_pages'){
    if(!Number.isInteger(candidateLimit)||candidateLimit<1||candidateLimit>150||Number(j.max_cost_usd)>0.5)throw Error('FACEBOOK_SCOPE_EXCEEDED');
    return {...j,actor_id:'apify~facebook-search-scraper',apify_input:{categories:terms,locations,searchType:'pages-google',resultsLimit:candidateLimit}};
  }
  if(j.source==='yelp'){
    if(!Number.isInteger(candidateLimit)||candidateLimit<1||candidateLimit>150||Number(j.max_results)>50||Number(j.max_cost_usd)>0.5||settings.country_code!=='US')throw Error('YELP_SCOPE_EXCEEDED');
    return {...j,actor_id:'tri_angle~yelp-scraper',apify_input:{searchTerms:terms,locations,searchLimit:Math.ceil(candidateLimit/(terms.length*locations.length)),maxImages:0,directUrls:[]}};
  }
  const input=google ? { searchStringsArray:locations.length===1?terms:locations.flatMap(l=>terms.map(t=>t+' in '+l)), maxCrawledPlacesPerSearch:Math.ceil(candidateLimit/(terms.length*locations.length)), language:'en',scrapeContacts:settings.scrape_contacts!==false,scrapePlaceDetailPage:false,skipClosedPlaces:settings.exclude_closed!==false,website:settings.website_filter||'allPlaces' } : {searchTerms:terms,locations,maxResults:candidateLimit,includeReviews:false};
  if(google && settings.center) {
    // Circumscribed polygon avoids cutting off the requested circular boundary.
    const lat=settings.center.latitude*Math.PI/180, lon=settings.center.longitude*Math.PI/180, d=settings.radius_km/(6371*Math.cos(Math.PI/64));
    const ring=[];
    for(let i=0;i<=64;i++){const bearing=(i%64)*2*Math.PI/64;const a=Math.asin(Math.sin(lat)*Math.cos(d)+Math.cos(lat)*Math.sin(d)*Math.cos(bearing));const o=lon+Math.atan2(Math.sin(bearing)*Math.sin(d)*Math.cos(lat),Math.cos(d)-Math.sin(lat)*Math.sin(a));ring.push([o*180/Math.PI,a*180/Math.PI]);}
    input.customGeolocation={type:'Polygon',coordinates:[ring]};
  } else if(google && locations.length===1) input.locationQuery=locations[0];
  return {...j,actor_id:google?'compass~google-maps-extractor':'solidcode~yellowpages-scraper',apify_input:input};
}

function parseStart() {
  const r = $input.first().json;
  const job = $('Prepare Actor').first(0).json;
  const validId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(v);
  if (job.apify_actor_run_id!=null || job.dataset_id!=null){
    if(!validId(job.apify_actor_run_id)||!validId(job.dataset_id))throw Error('GATHERING_PROVIDER_REFERENCE_INCOMPLETE');
    return {job_id:job.id,org_id:job.org_id,run_id:job.apify_actor_run_id,dataset_id:job.dataset_id};
  }
  if(r.statusCode!==undefined&&(!Number.isInteger(r.statusCode)||r.statusCode<200||r.statusCode>=300))throw new Error('APIFY_START_RESPONSE_UNCONFIRMED');
  const d = r.body?.data;
  if (!validId(d?.id) || !validId(d?.defaultDatasetId)) throw new Error('Apify did not return a run ID and dataset ID; do not retry the paid start automatically');
  return { job_id: job.id, org_id: job.org_id, run_id: d.id, dataset_id: d.defaultDatasetId };
}

function parseStatus() {
  const r = $input.first().json;
  if(r.statusCode!==undefined&&(!Number.isInteger(r.statusCode)||r.statusCode<200||r.statusCode>=300))throw new Error('APIFY_STATUS_RESPONSE_UNCONFIRMED');
  const job = $('Prepare Actor').first(0).json;
  const run = $('Parse Run').first(0).json;
  const d = r.body?.data;
  if (!d || d.id !== run.run_id) throw new Error('Invalid Apify status response');
  const elapsed = Date.now() - new Date(job.heartbeat_at || job.started_at).getTime();
  const terminal = ['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(d.status);
  if(!terminal && elapsed>=780000) throw new Error('Provider did not terminate after abort; preserve the run for review');
  return { job_id: job.id, org_id: job.org_id, run_id: run.run_id, dataset_id: run.dataset_id, status: d.status, terminal, succeeded: d.status === 'SUCCEEDED', expired: !terminal && elapsed >= 660000, actual_cost: typeof d.usageTotalUsd === 'number' && Number.isFinite(d.usageTotalUsd) && d.usageTotalUsd >= 0 ? d.usageTotalUsd : null };
}

function transformResults() {
  const job = $('Prepare Actor').first(0).json;
  const r = $input.first().json;
  if(r.statusCode!==undefined&&(!Number.isInteger(r.statusCode)||r.statusCode<200||r.statusCode>=300))throw new Error('APIFY_DATASET_RESPONSE_UNCONFIRMED');
  if (!Array.isArray(r.body)) throw new Error('Dataset response must be an array');
  const text = (v, max = 255) => typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\u0000/g, '').trim().slice(0, max) || null : null;
  const first = (v) => Array.isArray(v) ? v[0] : v;
  const rows = [];
  const excluded = [];
  const settings = job.request_settings || {};
  const normalizeCategory=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\bcollag(?:e|es)\b|\bcolleges\b/g,'college').replace(/\bschools\b/g,'school').replace(/\bdepartments\b/g,'department').trim();
  const excludedCategory=row=>settings.exclude_categories?.some(term=>{const needle=normalizeCategory(term);return needle&&normalizeCategory([row.category,...(Array.isArray(row.raw_data?.categories)?row.raw_data.categories:[]),row.company_name].join(' ')).includes(needle);});
  const universityOnly=normalizeCategory(job.search_query||settings.search_terms?.[0]).includes('universit')&&!/\b(college|school|department|faculty|institute)\b/.test(normalizeCategory(job.search_query||''));
  const mismatchedUniversity=row=>{if(!universityOnly)return false;const name=normalizeCategory(row.company_name),category=normalizeCategory(row.category);return !/\buniversit(?:y|ies)\b/.test(name+' '+category)||/\b(college|school|department|faculty|institute)\b/.test(name+' '+category);};
  function unrequestedPageType(categories){
    if(settings.exclude_unrelated_page_types===false)return null;
    const norm=v=>String(v).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
    const cats=categories.filter(v=>typeof v==='string').map(norm);
    const queries=(Array.isArray(settings.search_terms)?settings.search_terms:[job.search_query||'']).map(v=>' '+norm(v)+' ');
    const groups=[
      {kind:'government_or_regulator',categories:['government organization','government organisation','government official','regulatory authority'],intent:['government','regulator','regulators','regulatory','council','councils','ministry','ministries','municipal','authority','authorities','public sector']},
      {kind:'association_or_nonprofit',categories:['professional association','trade association','nonprofit organization','non profit organization'],intent:['association','associations','society','societies','chamber','chambers','union','unions','nonprofit','non profit','charity','charities','foundation','foundations','ngo','ngos']},
      {kind:'creator_or_fan_page',categories:['reel creator','digital creator','video creator','content creator','gaming video creator','personal blog','fan page'],intent:['creator','creators','influencer','influencers','blogger','bloggers','vlogger','vloggers','fan page','fan pages','personal blog','video channel','video channels','content channel']}
    ];
    const group=groups.find(g=>cats.some(c=>g.categories.includes(c)));
    return group&&!queries.some(q=>group.intent.some(term=>q.includes(' '+term+' ')))?group.kind:null;
  }
  let rejected = 0;
  for (const [ordinal,original] of r.body.entries()) {
    let raw=original;
    if(job.source==='yelp'){
      const listing=typeof raw?.directUrl==='string'&&/^https:\/\/(?:www\.)?yelp\.com\/biz\/[A-Za-z0-9_%.-]+(?:[?#].*)?$/.test(raw.directUrl)?raw.directUrl.split(/[?#]/)[0]:null;
      if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.error||!text(raw.name)||!listing){rejected++;excluded.push({ordinal,reason:'invalid_yelp_business',raw_data:raw});continue;}
      const a=raw.address&&typeof raw.address==='object'?raw.address:{};
      // Retain published fields and the Yelp listing as provenance, never as the
      // business website. No emails, geography or delivery readiness are inferred.
      raw={...raw,id:raw.bizId||listing,url:listing,rating:raw.aggregatedRating,address:{...a,street:[a.addressLine1,a.addressLine2,a.addressLine3].filter(v=>typeof v==='string'&&v.trim()).join(', '),state:a.regionCode},observed_at:new Date().toISOString()};
      if(typeof raw.website==='string'&&/^https?:\/\/(?:[^/]+\.)?yelp\.com(?:[/:?#]|$)/i.test(raw.website))raw.website=null;
    }
    const reasons=[];
    if(job.source==='facebook_pages'){
      if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.error||raw.searchType&&!['pages','pages-google'].includes(raw.searchType)){
        rejected++;excluded.push({ordinal,reason:'invalid_facebook_page',raw_data:raw});continue;
      }
      const candidate=text(raw.pageUrl||raw.url||raw.facebookUrl,1000),match=/^https:\/\/(?:www\.|m\.|web\.)?facebook\.com\/((?!search(?:[/?#]|$)|groups(?:[/?#]|$)|posts(?:[/?#]|$)|reels?(?:[/?#]|$)|watch(?:[/?#]|$)|login(?:[/?#]|$)|messages(?:[/?#]|$)|photo(?:[/?#]|$)|events(?:[/?#]|$)|marketplace(?:[/?#]|$))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+){0,2})\/?(?:[?#].*)?$/i.exec(candidate||'');
      const pageId=text(raw.pageId||raw.facebookId||raw.id,100),pageUrl=match?'https://www.facebook.com/'+match[1].replace(/\/+$/,'')+'/':/^\d+$/.test(pageId||'')?'https://www.facebook.com/'+pageId+'/':null;
      const name=text(raw.pageName||raw.title||raw.name);
      if(!pageUrl||!name){rejected++;excluded.push({ordinal,reason:'missing_facebook_page_identity',raw_data:raw});continue;}
      const external=[raw.website,...(Array.isArray(raw.websites)?raw.websites:[])].filter(v=>typeof v==='string').map(v=>{
        const candidate=/^https?:\/\//i.test(v.trim())?v.trim():'https://'+v.trim();
        const parts=/^(https?):\/\/([a-z0-9][a-z0-9.-]*\.[a-z0-9-]+(?::\d{1,5})?)(\/[^?#\s\\]*)?(?:[?#].*)?$/i.exec(candidate);
        if(!parts||/(?:^|\.)(?:facebook\.com|instagram\.com|m\.me)(?::\d+)?$/i.test(parts[2]))return null;
        if(/(?:^|\.)maps\.google\.[a-z.]+$/i.test(parts[2])||/(?:^|\.)maps\.app\.goo\.gl$/i.test(parts[2])||/(?:^|\.)google\.[a-z.]+$/i.test(parts[2])&&/^\/maps(?:\/|$)/i.test(parts[3]||'')||/^(?:www\.)?goo\.gl$/i.test(parts[2])&&/^\/maps(?:\/|$)/i.test(parts[3]||''))return null;
        return parts[1].toLowerCase()+'://'+parts[2].toLowerCase()+(parts[3]||'').replace(/\/+$/,'');
      }).find(Boolean);
      const messenger=typeof raw.messenger==='string'&&/^https:\/\/(?:m\.me\/[A-Za-z0-9._-]+|(?:www\.)?facebook\.com\/messages\/t\/[A-Za-z0-9._-]+)\/?$/.test(raw.messenger)?raw.messenger:null;
      const phone=text(raw.phone||first(raw.phones),50),email=text(raw.email||first(raw.emails))?.toLowerCase()||null;
      const address=typeof raw.address==='string'?text(raw.address,1000):null;
      const row={ordinal,company_name:text(raw.title||raw.name||raw.pageName),email,phone,website:external||null,address,city:text(raw.city,100),state:text(raw.state,100),zip:text(raw.postalCode,20),country:text(raw.countryCode,2),category:text(raw.category||first((Array.isArray(raw.categories)?raw.categories:[]).filter(v=>typeof v==='string'&&v.toLowerCase()!=='page')),100),source_record_id:pageId||pageUrl,raw_data:{...raw,facebook_page_url:pageUrl,messenger_url:messenger,messenger_availability:messenger?'observed_link':'unknown',automatic_messaging_eligible:false,location_verified:false,observed_at:new Date().toISOString()}};
      if(settings.exclude_closed!==false&&(raw.isClosed===true||raw.permanentlyClosed===true))reasons.push('closed');
      const cats=[row.category,...(Array.isArray(raw.categories)?raw.categories:[])].filter(v=>typeof v==='string').join(' ').toLowerCase();
      const unrelated=unrequestedPageType([row.category,...(Array.isArray(raw.categories)?raw.categories:[])]);
      row.raw_data.category_filter={version:'facebook_page_type_v1',excluded_type:unrelated,automatic_filter_enabled:settings.exclude_unrelated_page_types!==false,semantic_fit_verified:false};
      if(unrelated)reasons.push('unrequested_page_type:'+unrelated);
      if(settings.include_categories?.length&&!settings.include_categories.some(c=>cats.includes(c.toLowerCase())))reasons.push('category_not_included');
      if(excludedCategory(row))reasons.push('category_excluded');
      if(mismatchedUniversity(row))reasons.push('business_type_mismatch');
      if(settings.require_contact&&!phone&&!email&&!external)reasons.push('missing_contact');
      if(settings.country_code&&row.country&&row.country.toUpperCase()!==settings.country_code)reasons.push('outside_country');
      if(rows.length>=(job.candidate_limit||job.max_results))reasons.push('candidate_limit');
      if(reasons.length){rejected++;excluded.push({...row,reason:reasons.join(',')});}else rows.push(row);
      continue;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.error || !text(raw.title || raw.name)) { rejected++; excluded.push({ordinal,reason:'invalid_record',raw_data:raw}); continue; }
    const addr = typeof raw.address === 'object' && raw.address ? raw.address : {};
    let website = text(raw.website);
    // n8n 1.111's Code sandbox does not expose the browser URL global.
    // Normalize only ordinary HTTP(S) business URLs; do not silently discard all sites.
    if (website) {
      const candidate = /^https?:\/\//i.test(website) ? website : 'https://' + website;
      const parts = /^(https?):\/\/([a-z0-9][a-z0-9.-]*\.[a-z0-9-]+(?::\d{1,5})?)(\/[^?#\s\\]*)?(?:[?#].*)?$/i.exec(candidate);
      website = parts ? parts[1].toLowerCase() + '://' + parts[2].toLowerCase() + (parts[3] || '').replace(/\/+$/, '') : null;
    }
    const email = text(raw.email || first(raw.emails) || raw.contactEmail)?.toLowerCase() || null;
    const phone = text(raw.phone || raw.phoneNumber || first(raw.phones), 50);
    const row={ordinal, company_name: text(raw.title || raw.name), email, phone, website, address: text(addr.street || (typeof raw.address === 'string' ? raw.address : null), 1000), city: text(raw.city || addr.city, 100), state: text(raw.state || addr.state, 100), zip: text(raw.postalCode || addr.postalCode, 20), country: text(raw.countryCode || addr.country || (job.source === 'yellow_pages' ? 'US' : null), 100), category: text(raw.categoryName || raw.primaryCategory || first(raw.categories), 100), source_record_id: text(raw.placeId || raw.cid || raw.id || raw.url, 500), raw_data: raw };
    if(settings.exclude_closed!==false && (raw.permanentlyClosed===true || raw.temporarilyClosed===true || raw.isClosed===true)) reasons.push('closed');
    if(settings.require_contact && !phone && !email && !website) reasons.push('missing_contact');
    const cats=[row.category,...(Array.isArray(raw.categories)?raw.categories:[])].filter(v=>typeof v==='string').join(' ').toLowerCase();
    if(settings.include_categories?.length && !settings.include_categories.some(c=>cats.includes(c.toLowerCase()))) reasons.push('category_not_included');
    if(excludedCategory(row)) reasons.push('category_excluded');
    if(mismatchedUniversity(row)) reasons.push('business_type_mismatch');
    if(settings.country_code && row.country && row.country.toUpperCase()!==settings.country_code) reasons.push('outside_country');
    if(settings.website_filter==='withWebsite'&&!website || settings.website_filter==='withoutWebsite'&&website) reasons.push('website_filter');
    if(settings.center){
      const lat=raw.location?.lat??raw.latitude,lon=raw.location?.lng??raw.longitude;
      if(typeof lat!=='number'||typeof lon!=='number'||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180) reasons.push('missing_coordinates');
      else{const rad=Math.PI/180;const a=Math.sin((lat-settings.center.latitude)*rad/2)**2+Math.cos(lat*rad)*Math.cos(settings.center.latitude*rad)*Math.sin((lon-settings.center.longitude)*rad/2)**2;row.distance_km=6371*2*Math.asin(Math.sqrt(Math.min(1,a)));if(row.distance_km>settings.radius_km) reasons.push('outside_radius');}
    }
    // Database matching applies the NEW-business target after deduplication.
    if(rows.length>=(job.candidate_limit||job.max_results)) reasons.push('candidate_limit');
    if(reasons.length){rejected++;excluded.push({...row,reason:reasons.join(',')});}else rows.push(row);
  }
  return { job_id: job.id, org_id: job.org_id, rows, excluded, rejected, fetched: r.body.length };
}

function previewRequest(){
  const p=$input.first().json;
  return {success:true,preview:true,org_id:p.org_id,source:p.source,search_terms:p.search_terms,locations:p.locations,combinations:p.locations.flatMap(location=>p.search_terms.map(term=>({term,location}))),center:p.center,radius_km:p.radius_km,max_results:p.max_results,max_cost_usd:p.max_cost_usd,billing_mode:p.billing_mode,result_mode:p.result_mode,candidate_limit:p.candidate_limit,filters:{include_categories:p.include_categories,exclude_categories:p.exclude_categories,require_contact:p.require_contact,exclude_closed:p.exclude_closed,exclude_unrelated_page_types:p.exclude_unrelated_page_types,website_filter:p.website_filter},reuse_hours:p.refresh||p.result_mode==='new'?0:p.reuse_hours,location_resolution:p.center?'explicit_coordinates':'provider_resolves_named_locations',budget_note:'One bounded provider run. Existing businesses do not count toward a new-business target. Area and spending are never automatically expanded; a shortfall is reported explicitly.'};
}

function formatFailure() {
  const job = $('Prepare Actor').first(0).json;
  const input = $input.first().json;
  // Do not copy arbitrary HTTP error strings, URLs or response bodies into the DB.
  let run = null;
  try { run = $('Parse Status').first(0).json; } catch {}
  return { job_id: job.id, org_id: job.org_id, code: run?.status && ['FAILED','ABORTED','TIMED-OUT'].includes(run.status) ? 'APIFY_' + run.status : run?.expired ? 'LOCAL_TIMEOUT' : 'GATHERING_STEP_FAILED', actual_cost: run?.actual_cost ?? null, detail: 'Inspect the n8n execution for details; a paid actor start must not be retried without checking Apify.', execution_id: String($execution.id) };
}

function currentWorkerState(){
 const saved=$input.first().json,run=$('Parse Status').first(0).json;
 if(!saved||saved.id===undefined||String(saved.id)!==String(run.job_id))throw new Error('GATHERING_OWNERSHIP_LOST');
 return {...run,...saved};
}
function validateSavedRun(){
 const saved=$input.first().json,job=$('Prepare Actor').first(0).json;
 if(!saved||saved.id===undefined||String(saved.id)!==String(job.id))throw new Error('GATHERING_OWNERSHIP_LOST');
 return saved;
}
module.exports = { validateRequest, validateConnection, parseConnection, prepareActor, parseStart, parseStatus, transformResults, formatFailure, previewRequest,currentWorkerState,validateSavedRun };
