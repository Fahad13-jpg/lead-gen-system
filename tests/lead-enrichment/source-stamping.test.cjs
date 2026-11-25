'use strict';
const assert=require('assert/strict'),{stamp}=require('../../scripts/lead-enrichment/source-checks.cjs'),{basic}=require('../../scripts/lead-enrichment/worker.cjs'),rt=require('../../scripts/lead-strategy/runtime.cjs');
const rows=require('./fixtures/source-stamping-stored.json');
for(const r of rows)assert.equal(stamp(r).website_result,r.expected,'stored staging '+r.staging_id);
for(const id of [445,446,447]){const s=stamp(rows.find(r=>r.lead_id===id));assert.equal(s.website_result,'none_found');assert.equal(s.detail_level,true);assert.equal(s.website_field,'missing');}
const full=structuredClone(rows.find(r=>r.lead_id===445));
for(const value of [null,'']){const r=structuredClone(full);r.raw_data.website=value;assert.equal(stamp(r).website_result,'none_found');}
for(const key of ['placeId','openingHours','scrapedAt','reviewsCount','title','address']){const r=structuredClone(full);delete r.raw_data[key];assert.equal(stamp(r).website_result,'unknown',key+' missing');}
const sparse={source:'google_maps',raw_data:{url:'https://google.com/maps/example',scrapedAt:new Date().toISOString(),website:null}};assert.equal(stamp(sparse).website_result,'unknown');
assert.equal(stamp({...full,website:'https://business.example/'}).website_result,'unknown');
const yp=structuredClone(rows.find(r=>r.source==='yellow_pages'));delete yp.raw_data.website;yp.website=null;assert.equal(stamp(yp).website_result,'unknown');assert.equal(stamp({...full,source:'yelp'}).website_result,'unknown');
(async()=>{for(const platform of ['facebook','instagram']){
 const site='https://'+platform+'.com/example',check=stamp({...full,website:site,raw_data:{...full.raw_data,website:site,scrapedAt:new Date().toISOString()}});
 const b=await basic({lead:{company_name:'Example',website:site},source_checks:[check]},async()=>{throw Error('No social fetch permitted')});assert.equal(b.signals.web_presence.state,'social_only');assert.equal(b.signals.social[platform].length>0,true);
 const q=rt.qualify(b.signals,'website_presence',['Approved benefit'],{website_presence:'social_only',freshness:{website_current:true},conflicts:[]});assert.equal(q.fit,'strong');assert(q.absence_wording.includes('records checked'));assert(rt.validateAbsence(q.absence_wording,q));assert(!rt.validateAbsence("You don't have a website",q));assert(!rt.validateAbsence("I found a Facebook page but couldn't find a website. Is there one?",{}));
 const unproven=structuredClone(b.signals);unproven.social={facebook:[],instagram:[]};assert.equal(rt.qualify(unproven,'website_presence',[],{website_presence:'unknown',freshness:{website_current:true}}).fit,'unclear');
 }
 console.log('PASS: 84 stored records (74 Maps, 10 Yellow Pages), benchmark omissions, sparse/null/contradictory data, Yelp unknown, social-only strong and scoped wording.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
