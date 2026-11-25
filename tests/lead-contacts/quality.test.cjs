const assert=require('node:assert/strict'),http=require('node:http');
const {request,discover}=require('../../scripts/lead-contacts/worker.cjs');const rt=require('../../scripts/lead-contacts/runtime.cjs');
(async()=>{const server=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html'});r.end('a '.repeat(300000)+' info@clinic.org '+'b '.repeat(800000));});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{const url='http://127.0.0.1:'+server.address().port;const result=await request(url,{maxBytes:2097152,allowPartial:true});assert(result.truncated);assert.equal(result.bytes,2097152);assert(rt.extract(result.body,url).some(x=>x.email==='info@clinic.org'));await assert.rejects(request(url),/response_too_large/);}finally{await new Promise(r=>server.close(r));}
const pages=[];const d=await discover({source_value:'https://clinic.org'},async u=>{pages.push(u);return {url:u,status:200,headers:{'content-type':'text/html'},body:u.endsWith('/contact')?'info@clinic.org':'<a href="/contact">Contact</a>',truncated:!u.endsWith('/contact')};});assert(d.partial_content);assert.equal(d.status,'found');assert(pages.some(u=>u.endsWith('/contact')));
assert.equal(rt.businessQuality({phone:'+1 (312) 555-0100'},[{type:'phone',value:'3125550100'}]).length,0);
assert(rt.businessQuality({phone:'3125550100'},[],{phone:'7735550100'}).some(f=>f.code==='conflicting_phone_numbers'));
assert(rt.businessQuality({company_name:'ALL ED ELECTRIC',category:'Plumbers'}).some(f=>f.code==='possible_category_mismatch'));
assert.equal(rt.businessQuality({company_name:'Complete Home Services',category:'Plumbers'}).length,0);
assert.equal(rt.businessQuality({company_name:'Electric and Plumbing Services',category:'Plumbers'}).length,0);
assert.equal(rt.extract('a'.repeat(600000)+' info@clinic.org','https://clinic.org').length,1);
console.log('PASS large response retention, hard cap, contact fallback, phone normalization, conflicts and conservative category flags');})().catch(e=>{console.error(e);process.exitCode=1});
