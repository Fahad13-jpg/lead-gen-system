'use strict';
const assert=require('assert/strict'),rt=require('../../scripts/lead-strategy/runtime.cjs'),sheet=require('../../scripts/lead-enrichment/signals.cjs');
const now='2026-10-12T00:00:00Z',trust={evaluated_at:now,assessment_status:'assessed',website_presence:'unknown',freshness:{website_current:true},conflicts:[]};
assert.equal(rt.qualify(null,'website_presence',[],{}).fit,'not_assessed');
assert.equal(rt.qualify(null,'website_presence',[],{}).next_action,'queue_basic');
assert.equal(rt.qualify(null,'website_presence',[],trust).fit,'unclear');
const result={observed_at:now,business:{website:null},pages:[],evidence:[]};
const check={source:'maps_listing',status:'checked',source_url:'https://google.com/maps/example',website_result:'none_found',observed_at:'2026-08-13T00:00:00Z'};
const signals=sheet.build(result,[check]);assert.equal(signals.web_presence.checks.length,1,'old provenance retained');assert(signals.web_presence.reason_codes.includes('recheck_needed'));
for(const [days,expected]of [[30,'unclear'],[90,'strong'],[180,'strong']]){const q=rt.qualify(signals,{key:'website_presence',source_check_max_age_days:days},[],trust);assert.equal(q.fit,expected);assert.equal(q.reason_codes.includes('recheck_needed'),days===30);if(days>30)assert(q.absence_wording.includes('Google Maps'));}
for(const days of [0,-1,1.5,366,Infinity])assert.throws(()=>rt.qualify(signals,{key:'website_presence',source_check_max_age_days:days},[],trust),/INVALID_SOURCE_CHECK_WINDOW/);
const social=sheet.build({...result,business:{website:'https://facebook.com/example'},evidence:[{type:'social',value:'https://facebook.com/example',source_url:'https://facebook.com/example',observed_at:now}]});
assert.equal(social.web_presence.state,'social_only');assert.equal(rt.qualify(social,'website_presence',[],{...trust,website_presence:'social_only'}).fit,'strong');assert.equal(rt.qualify(social,'website_presence',[],trust).fit,'unclear');assert.equal(rt.qualify(social,'website_presence',[],{...trust,website_presence:'social_only',freshness:{website_current:false}}).fit,'unclear');
console.log('PASS: not_assessed/failed-assessed distinction; retained old checks; 30/90/180 windows; canonical social-only trust; invalid windows.');
