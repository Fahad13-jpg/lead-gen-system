'use strict';
const {getPage,site}=require('../../dashboard/src/routeMetadata.js');
const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function config(env=process.env){
 const origin=require('./runtime-config.cjs').publicOrigin(env.DASHBOARD_PUBLIC_ORIGIN);
 const indexing=env.PUBLIC_SITE_INDEXING_ENABLED==='true'&&!!origin;
 const ga=env.GA4_MEASUREMENT_ID||'';if(ga&&!/^G-[A-Z0-9]{6,20}$/.test(ga))throw Error('ANALYTICS_CONFIGURATION_INVALID');
 const verification={google:env.GOOGLE_SITE_VERIFICATION||'',bing:env.BING_SITE_VERIFICATION||''};
 for(const v of Object.values(verification))if(v&&!/^[A-Za-z0-9_-]{8,200}$/.test(v))throw Error('SITE_VERIFICATION_INVALID');
 return {origin,indexing,ga4MeasurementId:origin&&env.PUBLIC_ANALYTICS_ENABLED==='true'?ga:'',verification};
}
function render(html,pathname,cfg){
 const page=getPage(pathname),indexable=page.indexable&&cfg.indexing,robots=indexable?'index, follow':'noindex, nofollow';
 let head=`<title>${escape(page.title)}</title><meta name="description" content="${escape(page.description)}"><meta name="robots" content="${robots}">`;
 head+=`<meta property="og:type" content="website"><meta property="og:site_name" content="${escape(site.brand.name)}"><meta property="og:title" content="${escape(page.title)}"><meta property="og:description" content="${escape(page.description)}"><meta name="twitter:card" content="summary_large_image">`;
 if(cfg.origin){
  const canonical=cfg.origin+(page.indexable?page.path:'/');
  if(page.indexable)head+=`<link rel="canonical" href="${escape(canonical)}">`;
  head+=`<meta property="og:url" content="${escape(canonical)}"><meta property="og:image" content="${escape(cfg.origin+site.shareImage)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${escape(site.brand.name+' business discovery and outreach')}"><meta name="twitter:image" content="${escape(cfg.origin+site.shareImage)}">`;
  if(cfg.verification.google)head+=`<meta name="google-site-verification" content="${escape(cfg.verification.google)}">`;
  if(cfg.verification.bing)head+=`<meta name="msvalidate.01" content="${escape(cfg.verification.bing)}">`;
 }
 const runtime=JSON.stringify({publicOrigin:cfg.origin,indexing:cfg.indexing,ga4MeasurementId:cfg.ga4MeasurementId}).replace(/</g,'\\u003c');
 head+=`<script type="application/json" id="public-site-config">${runtime}</script>`;
 return html.replace(/<title>[\s\S]*?<\/title>/i,'').replace(/<meta\s+name=["'](?:description|robots)["'][^>]*>/gi,'').replace('</head>',head+'</head>');
}
function robots(cfg){if(!cfg.indexing)return 'User-agent: *\nDisallow: /\n';return 'User-agent: *\nAllow: /\nDisallow: /dashboard-api/\nDisallow: /webhook/\nDisallow: /oauth/\nDisallow: /health/\nSitemap: '+cfg.origin+'/sitemap.xml\n';}
function sitemap(cfg){if(!cfg.indexing)throw Error('PUBLIC_SITE_NOT_INDEXABLE');return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+site.pages.filter(p=>p.indexable).map(p=>'<url><loc>'+escape(cfg.origin+p.path)+'</loc></url>').join('')+'</urlset>';}
function unavailable(){return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Service unavailable</title></head><body><main><h1>The service is temporarily unavailable.</h1><p>Please try again shortly. Check the status of any pending action before submitting it again.</p><a href="/">Back to home</a></main></body></html>';}
module.exports={config,render,robots,sitemap,getPage,site,unavailable};
