'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const meta=require('../../scripts/dashboard/page-metadata.cjs'),{createServer}=require('../../scripts/dashboard/http.cjs');
const html='<!doctype html><html><head><title>Old title</title><meta name="description" content="old"><meta name="robots" content="noindex"></head><body><div id="root"></div></body></html>';
function request(server,url,headers={},method='GET'){return new Promise(resolve=>{const r={headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(status,h){this.status=status;Object.assign(this.headers,h);this.headersSent=true;},end(body){resolve({status:this.status,headers:this.headers,body:body===undefined?'':String(body)});}};server.emit('request',{url,method,headers:{host:'localhost:3002',accept:'text/html',...headers}},r);});}
test('prelaunch indexing and analytics stay off without a verified public origin',()=>{
 const cfg=meta.config({PUBLIC_SITE_INDEXING_ENABLED:'true',PUBLIC_ANALYTICS_ENABLED:'true',GA4_MEASUREMENT_ID:'G-TEST123456'});assert.equal(cfg.indexing,false);assert.equal(cfg.ga4MeasurementId,'');assert.equal(meta.robots(cfg),'User-agent: *\nDisallow: /\n');assert.throws(()=>meta.sitemap(cfg),/PUBLIC_SITE_NOT_INDEXABLE/);
});
test('sitemap contains public routes only, and robots permits seeing private noindex responses',()=>{
 const cfg=meta.config({DASHBOARD_PUBLIC_ORIGIN:'https://app.example.test',PUBLIC_SITE_INDEXING_ENABLED:'true'}),xml=meta.sitemap(cfg);assert(xml.includes('https://app.example.test/privacy'));assert.equal((xml.match(/<url>/g)||[]).length,5);for(const route of ['/login','/dashboard','/leads','/campaigns','/settings'])assert(!xml.includes(route));assert(meta.robots(cfg).includes('Sitemap: https://app.example.test/sitemap.xml'));assert(!meta.robots(cfg).includes('Disallow: /dashboard\n'));
});
test('server metadata is escaped, unique and does not contain lead identifiers',()=>{
 const cfg=meta.config({DASHBOARD_PUBLIC_ORIGIN:'https://app.example.test',PUBLIC_SITE_INDEXING_ENABLED:'true',GOOGLE_SITE_VERIFICATION:'verified_token_123',BING_SITE_VERIFICATION:'ABCDEF0123456789'}),publicHtml=meta.render(html,'/privacy',cfg),privateHtml=meta.render(html,'/leads/12345',cfg);
 assert.equal((publicHtml.match(/<title>/g)||[]).length,1);assert.equal((publicHtml.match(/name="description"/g)||[]).length,1);assert(publicHtml.includes('Privacy notice | Leadmorrow'));assert(publicHtml.includes('https://app.example.test/brand/social-preview.png'));assert(publicHtml.includes('google-site-verification'));assert(privateHtml.includes('noindex, nofollow'));assert(!privateHtml.includes('/leads/12345'));assert(!privateHtml.includes('rel="canonical"'));
 assert.throws(()=>meta.config({GA4_MEASUREMENT_ID:'<script>'}),/ANALYTICS_CONFIGURATION_INVALID/);
});
test('every fixed route has its own title and new private route titles stay generic',()=>{
 const titles=meta.site.pages.map(p=>meta.getPage(p.path).title);assert.equal(titles.length,new Set(titles).size);assert.equal(meta.getPage('/does-not-exist').found,false);assert(meta.getPage('/campaigns/7/preferences').title.startsWith('Campaign preferences'));assert.equal(meta.getPage('/campaigns/7').indexable,false);
});
test('HTTP public pages, missing pages, assets and HEAD use the right statuses and crawler headers',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'public-site-'));
 try{await fs.writeFile(path.join(root,'index.html'),html);const server=createServer({buildRoot:root,siteConfig:meta.config({DASHBOARD_PUBLIC_ORIGIN:'https://app.example.test',PUBLIC_SITE_INDEXING_ENABLED:'true'})});
 for(const url of ['/privacy','/faq','/contact']){const r=await request(server,url);assert.equal(r.status,200);assert.equal(r.headers['X-Robots-Tag'],'index, follow');}
 const missing=await request(server,'/missing-page');assert.equal(missing.status,404);assert(missing.body.includes('Page not found'));assert.equal(missing.headers['X-Robots-Tag'],'noindex, nofollow');
 const asset=await request(server,'/static/missing.js');assert.equal(asset.status,404);assert.equal(asset.headers['Content-Type'],'application/json');
 const head=await request(server,'/missing-page',{},'HEAD');assert.equal(head.status,404);assert.equal(head.body,'');
 const privatePage=await request(server,'/leads/17');assert.equal(privatePage.status,200);assert.equal(privatePage.headers['X-Robots-Tag'],'noindex, nofollow');
 assert.equal((await request(server,'/robots.txt')).status,200);assert.equal((await request(server,'/sitemap.xml')).status,200);assert.equal((await request(server,'/robot.txt')).headers.Location,'/robots.txt');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('missing app assets show a safe 503 recovery page and never expose the underlying failure',async()=>{
 const r=await request(createServer({buildRoot:'.local/no-app-fixture'}),'/');assert.equal(r.status,503);assert(r.body.includes('temporarily unavailable'));assert(!r.body.includes('ENOENT'));assert.equal(r.headers['Retry-After'],'30');
});


test('public response guards and hashed caching do not cache changing manifests',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'http-guards-'));
 try{
  await fs.mkdir(path.join(root,'static','js'),{recursive:true});
  for(const [name,content] of [['index.html',html],['static/js/main.1234abcd.js','void 0;'],['static/js/runtime.js','void 0;'],['asset-manifest.json','{}']])await fs.writeFile(path.join(root,name),content);
  const s=createServer({buildRoot:root});
  const doc=await request(s,'/faq');assert.equal(doc.headers['X-Frame-Options'],'DENY');assert(doc.headers['Content-Security-Policy'].includes("frame-ancestors 'none'"));assert(doc.headers['Content-Security-Policy'].includes("base-uri 'self'"));assert.equal(doc.headers['Cache-Control'],'no-store');
  const asset=await request(s,'/static/js/main.1234abcd.js');assert.equal(asset.headers['Cache-Control'],'public, max-age=31536000, immutable');assert.equal(asset.headers['Content-Length'],7);
  assert.equal((await request(s,'/static/js/runtime.js')).headers['Cache-Control'],'public, max-age=3600');assert.equal((await request(s,'/asset-manifest.json')).headers['Cache-Control'],'no-cache');
  const head=await request(s,'/static/js/main.1234abcd.js',{},'HEAD');assert.equal(head.body,'');assert.equal(head.headers['Content-Length'],7);
  const post=await request(s,'/faq',{},'POST');assert.equal(post.status,405);assert.equal(post.headers.Allow,'GET, HEAD');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
