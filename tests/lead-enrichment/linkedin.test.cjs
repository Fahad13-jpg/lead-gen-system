'use strict';
const assert=require('assert/strict'),{spec,mapRows}=require('../../scripts/lead-enrichment/linkedin.cjs'),rt=require('../../scripts/lead-enrichment/runtime.cjs');
const company='https://www.linkedin.com/company/clinic',person='https://www.linkedin.com/in/owner';
assert.equal(spec('posts',person).input.maxPosts,5);assert.equal(spec('employees',company).input.maxItems,2);assert.throws(()=>spec('posts','https://evil.test/in/person'));
let evidence=mapRows({kind:'company',org_id:1,lead_id:1,actor:'fixture'},[{linkedinUrl:company,name:'Clinic',website:'clinic.example'}]);
evidence=mapRows({kind:'employees',org_id:1,lead_id:1,actor:'fixture'},[{linkedinUrl:person,firstName:'Owner',experience:[{position:'Founder',companyName:'Other',companyLinkedinUrl:'https://www.linkedin.com/company/other',endDate:{text:'Present'}},{position:'CEO',companyName:'Clinic',companyLinkedinUrl:company,endDate:{text:'Present'}}]}],evidence);
const date=new Date().toISOString();evidence=mapRows({kind:'posts',org_id:1,lead_id:1,target:person,actor:'fixture'},[{linkedinUrl:'https://www.linkedin.com/posts/owner-activity-123',content:'Opening a new clinic',author:{linkedinUrl:person+'/posts'},postedAt:{date}},{linkedinUrl:'https://www.linkedin.com/posts/wrong-activity-456',content:'Wrong author',author:{linkedinUrl:company},postedAt:{date}}],evidence);
const result=rt.research({lead:{company_name:'Clinic',website:'clinic.example'},linkedin:evidence});assert.equal(result.linkedin.profiles.length,2);assert.equal(result.personalization.length,1);assert.equal(result.personalization[0].author_profile,person);
console.log('PASS Apify payload limits, published schema mapping, current employment and post author rejection');
