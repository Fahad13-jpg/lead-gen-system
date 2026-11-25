'use strict';
const site=require('./site.json');
function getPage(pathname){
 const fixed=site.pages.find(p=>p.path===pathname);
 if(fixed)return {...fixed,title:fixed.title+' | '+site.brand.name,found:true};
 const matched=/^\/leads\/[1-9][0-9]{0,9}$/.test(pathname)?['Lead details','Review a saved business and its research evidence.']:/^\/campaigns\/[1-9][0-9]{0,18}\/preferences$/.test(pathname)?['Campaign preferences','Review the offer, channels and schedule for a campaign.']:/^\/campaigns\/[1-9][0-9]{0,18}$/.test(pathname)?['Campaign review','Review campaign evidence, messages, approvals and execution settings.']:null;
 return {path:pathname,title:(matched?matched[0]:'Page not found')+' | '+site.brand.name,description:matched?matched[1]:'This page could not be found. Return home or open your workspace.',indexable:false,found:!!matched};
}
module.exports={getPage,site};
