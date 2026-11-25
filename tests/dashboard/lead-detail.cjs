'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const{detail,url}=require('../../scripts/dashboard/lead-detail.cjs');
test('detail projects only bounded public fields and strips unsafe links and query strings',()=>{
 const r=detail({id:1,company_name:'Fixture',report:{api_key:'SECRET',basic:{pages:[{url:'javascript:alert(1)',error:'SECRET'}],evidence:[{type:'technology_marker',value:'WordPress',source_url:'https://example.org/?token=SECRET'},{type:'internal_secret',value:'SECRET'}]},tasks:[{kind:'basic',status:'failed',error:'SECRET'}],research:{summary:'<script>text only</script>',ai_research:{key:'SECRET'}},trust:{fields:{emails:[{value:'a@example.org',status:'expired',verification:{key:'SECRET'}}]}}}});
 assert.equal(r.evidence.length,1);assert.equal(r.evidence[0].source_url,'https://example.org/');assert.equal(r.pages[0].url,null);assert.ok(!JSON.stringify(r).includes('SECRET'));assert.equal(r.assessment.website_presence,'unknown');assert.equal(r.assessment.website_current,null);
});
test('older and malformed reports preserve unknowns without inventing diagnostics',()=>{
 for(const basic of [null,'bad',{pages:null,evidence:'bad',services:{}}]){
  const r=detail({id:1,report:{basic}});assert.deepEqual(r.pages,[]);assert.deepEqual(r.evidence,[]);assert.deepEqual(r.services,[]);assert.equal(r.assessment.website_presence,'unknown');
 }
 const r=detail({id:1,report:{basic:{pages:[{status:200,usable_html:true}]},trust:{freshness:{website_current:false},website_presence:'present'}}});
 assert.equal(r.pages[0].text_bytes,null);assert.equal(r.assessment.website_current,false);assert.equal(r.assessment.website_presence,'present');
});
test('report absence is distinct from a missing business and links forbid executable schemes and embedded credentials',()=>{
 assert.equal(detail({id:1,report:null}).found,true);assert.equal(detail({id:1,report:null}).report_available,false);
 for(const value of ['javascript:alert(1)','data:text/html,test','https://user:pass@example.org/','not a url'])assert.equal(url(value),null);
 assert.equal(url('https://example.org/contact?tracking=1#contact'),'https://example.org/contact');
});
