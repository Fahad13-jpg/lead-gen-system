'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),{basic}=require('../../scripts/lead-enrichment/worker.cjs'),sheet=require('../../scripts/lead-enrichment/signals.cjs'),rt=require('../../scripts/lead-strategy/runtime.cjs');
const fixtures=require('./fixtures/benchmark-signals.json');
const checked={source:'maps_listing',status:'checked',source_url:'https://www.google.com/maps/place/example',observed_at:new Date().toISOString(),website_result:'none_found'};
const html='<html><meta name="viewport" content="width=device-width"><body>'+('Useful factual business information. '.repeat(40))+'</body></html>';
const lead={org_id:1,website:'https://example.org/',company_name:'Example',category:'Dental clinic'};
const good=(body=html)=>async u=>({url:u,status:200,headers:{'content-type':'text/html'},body,truncated:false});
const trust=presence=>({website_presence:presence,freshness:{website_current:true},conflicts:[]});
const verdict=b=>rt.qualify(b.signals,'website_presence',['Approved website benefit'],trust(b.pages.some(p=>p.usable_html)?'present':['none_found','social_only'].includes(b.signals.web_presence.state)?b.signals.web_presence.state:'unknown'));
(async()=>{
 const results=[];
 for(const f of fixtures){const b=await basic({lead:f.lead,source_checks:f.source_checks},async u=>{const p=f.snapshots.find(p=>p.request_url===u);if(!p)throw Object.assign(Error(),{code:'fixture_missing'});return p.response});const v=verdict(b);assert.equal(v.fit,f.expected_fit,'benchmark '+f.lead.id);if(f.lead.id===167)assert(b.signals.site_quality_flags.placeholder_text.observed);results.push({id:f.lead.id,expected:f.expected_fit,actual:v.fit,signals:b.signals,pages:b.pages});}
 const cases=[
  ['no website no checks',{...lead,website:null},[],good(),'unclear'],
  ['explicit maps absence',{...lead,website:null},[checked],good(),'strong'],
  ['unknown listing result',{...lead,website:null},[{...checked,website_result:'unknown'}],good(),'unclear'],
  ['failed fetch',lead,[],async()=>{throw Object.assign(Error(),{code:'ETIMEDOUT'})},'unclear'],
  ['blocked fetch',lead,[],async u=>({...await good()(u),status:403}),'unclear'],
  ['JS shell',lead,[],good('<html><div id="root"></div><script src="app.js"></script></html>'),'unclear'],
  ['template',lead,[],good(html+'<p>Lorem ipsum dolor sit amet</p>'),'strong'],
  ['functional no paths',lead,[],good(html),'moderate'],
  ['strong with form',lead,[],good(html+'<form><input name="email"><textarea name="message"></textarea></form>'),'weak'],
  ['cross domain redirect',lead,[],async()=>{throw Object.assign(Error(),{code:'blocked_target'})},'unclear'],
  ['truncated',lead,[],async u=>({...await good()(u),truncated:true}),'unclear'],
  ['non HTML',lead,[],async u=>({...await good()(u),headers:{'content-type':'application/json'}}),'unclear'],
  ['facebook only',{...lead,website:null},[{...checked,website_result:'unknown',facebook:'https://facebook.com/example'}],good(),'unclear'],
  ['facebook URL as website',{...lead,website:'https://facebook.com/example'},[],async()=>{throw Error('Must not crawl social as company website')},'strong'],
  ['stale checks',{...lead,website:null},[{...checked,observed_at:'2020-01-01T00:00:00Z'}],good(),'unclear'],
  ['failed fetch despite absence check',lead,[checked],async()=>{throw Object.assign(Error(),{code:'ECONNRESET'})},'unclear'],
  ['old copyright',lead,[],good(html+'<footer>Copyright 2001</footer>'),'unclear'],
  ['phone route',lead,[],good(html+'<a href="tel:+15551234567">Call</a>'),'unclear'],
  ['mixed source results',{...lead,website:null},[checked,{...checked,source:'yellow_pages',website_result:'present'}],good(),'unclear'],
  ['future check',{...lead,website:null},[{...checked,observed_at:'2099-01-01T00:00:00Z'}],good(),'unclear']
 ];
 for(const [name,l,checks,fetchPage,expected] of cases){const b=await basic({lead:l,source_checks:checks},fetchPage);assert.equal(verdict(b).fit,expected,name);if(b.pages.length)for(const p of b.pages)for(const key of ['status','final_url','content_type','html_bytes','text_bytes','truncated','error_class'])assert(key in p,name+':'+key);results.push({name,expected,actual:verdict(b).fit});}
 const absent=verdict(await basic({lead:{...lead,website:null},source_checks:[checked]},good()));assert(rt.validateAbsence(absent.absence_wording,absent));assert(!rt.validateAbsence("You don't have a website",absent));assert(!rt.validateAbsence("I couldn't find a website for you on Yellow Pages. Is there one?",absent));assert(!rt.validateAbsence("I couldn't find a website for you on Google Maps. Is there one?",{}));
 const b=await basic({lead},good(html));assert.equal(rt.qualify(b.signals,'generic',[],trust('present')).fit,'unclear');assert.equal(rt.qualify(b.signals,'website_presence',[],{...trust('present'),freshness:{website_current:false}}).fit,'unclear');assert.equal(rt.qualify(b.signals,'website_presence',[],{...trust('present'),conflicts:['identity']} ).fit,'unclear');
 const mixed=await basic({lead},async u=>u===lead.website?{...await good(html+'<a href="/contact">Contact</a>')(u)}:{...await good()(u),status:500});assert.equal(verdict(mixed).fit,'unclear');
 assert(sheet.inspect('<p>Lorem ipsum</p>','http://example.org').flags.no_https);
 fs.mkdirSync('documentation/local-signal-qualifier',{recursive:true});fs.writeFileSync('documentation/local-signal-qualifier/offline-results.json',JSON.stringify(results,null,2));console.log('PASS: 5 historical benchmarks, 20 golden synthetic cases, partial failure, diagnostics, stale/conflict gates and scoped absence wording. No network or model calls.');
})().catch(e=>{console.error(e);process.exitCode=1});

