'use strict';
const assert=require('node:assert/strict');
const rt=require('../../scripts/lead-contacts/runtime.cjs');
const {resolveContacts}=require('../../scripts/lead-contacts/worker.cjs');
const protect=(value,key=71)=>key.toString(16).padStart(2,'0')+[...value].map(c=>(c.charCodeAt(0)^key).toString(16).padStart(2,'0')).join('');
const page='https://clinic.org/contact';
const extract=s=>rt.extract(s,page);
async function main(){
 for(const html of [
  '<span data-cfemail="'+protect('reception@clinic.org')+'">protected</span>',
  '<a href="/cdn-cgi/l/email-protection#'+protect('reception@clinic.org')+'">email</a>',
  'reception [at] clinic [dot] org',
  'reception (at) clinic.org',
  'reception+bookings [at] clinic (dot) org'
 ]){const rows=extract(html);assert.equal(rows.length,1);assert.equal(rows[0].method,'published_website');assert.equal(rows[0].source_url,page);assert.equal(rt.qualify(rows[0],{website:page}).relevance_status,'eligible');}
 for(const html of ['contact at clinic dot org','reception [at] localhost','reception [at] -clinic [dot] org','<span data-cfemail="abc">bad</span>','<span data-cfemail="'+protect('not-an-email')+'">bad</span>'])assert.equal(extract(html).length,0);
 assert.equal(extract('a'.repeat(65)+' [at] clinic.org').length,0,'must not extract a suffix of a too-long local part');
 const started=Date.now();assert.equal(extract('a'.repeat(600000)+' no address').length,0);assert(Date.now()-started<2000,'long non-email text must remain bounded');
 assert.equal(extract('<b data-cfemail="'+protect('reception@clinic.org')+'">reception@clinic.org</b>').length,1);
 const vendor=extract('Website by <span data-cfemail="'+protect('info@agency.org')+'"></span>');
 assert.equal(rt.qualify(vendor[0],{website:page}).relevance_status,'excluded');
 const result=await resolveContacts({website:page,record:{company_name:'Clinic',invalid_emails:['reception@clinic.org']}},{crawl:async()=>({status:'found',candidates:extract('reception [at] clinic [dot] org'),pages_attempted:1})});
 assert.equal(result.relevant_candidate_count,0);assert.equal(result.candidates.length,0);
 console.log('PASS published obfuscation: 5 formats, malformed/prose rejection, dedup, domain review, invalid-email exclusion');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
