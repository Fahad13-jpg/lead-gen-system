'use strict';
// Versioned source observation, not proof that a business has no website elsewhere.
function stamp(row){
 const d=row.raw_data||{},source=row.source==='google_maps'?'maps_listing':row.source;
 const source_url=source==='maps_listing'?d.url:source==='yellow_pages'?d.profileUrl||d.sourceUrl:null;
 const observed_at=d.scrapedAt||null,validTime=typeof observed_at==='string'&&Number.isFinite(Date.parse(observed_at));
 const validUrl=(value,pattern)=>{try{const u=new URL(value);return /^https?:$/.test(u.protocol)&&pattern.test(u.hostname)}catch{return false}};
 const maps=source==='maps_listing'&&validUrl(source_url,/(^|\.)google\.[a-z.]+$/i)&&typeof d.placeId==='string'&&!!d.placeId&&typeof d.title==='string'&&!!d.title&&typeof d.address==='string'&&!!d.address&&typeof d.categoryName==='string'&&Array.isArray(d.openingHours)&&d.openingHours.length>0&&Number.isInteger(d.reviewsCount)&&d.reviewsCount>=0&&typeof d.permanentlyClosed==='boolean'&&typeof d.temporarilyClosed==='boolean'&&validTime;
 const yellow=source==='yellow_pages'&&validUrl(source_url,/(^|\.)yellowpages\.com$/i)&&typeof d.name==='string'&&!!d.name&&d.yellowPagesId!=null&&d.address!=null&&d.hours!=null&&Object.hasOwn(d,'description')&&Array.isArray(d.paymentMethods)&&validTime;
 let website_result='unknown',reason='insufficient_detail_or_unverified_source';const website=typeof d.website==='string'?d.website.trim():null;
 const social=website&&validUrl(website,/(^|\.)(facebook|instagram)\.com$/i)?website:null;
 const detailed=maps||yellow;
 if(source!=='yelp'&&validUrl(source_url,source==='maps_listing'?/(^|\.)google\.[a-z.]+$/i:/(^|\.)yellowpages\.com$/i)&&validTime&&website&&validUrl(website,/./)){website_result=social?'social_only':'present';reason=social?'social_profile_in_website_field':'explicit_website';}
 else if(maps&&(d.website==null||website==='')&&!row.website){website_result='none_found';reason='maps_detail_record_no_website_listed';}
 // No stored Yellow Pages negative examples establish its omission semantics yet.
 else if(yellow&&!website)reason='yellow_pages_absence_semantics_UNVERIFIED';
 return {stamp_version:'source_website_check_v1',source,status:source_url&&validTime?'checked':'unknown',source_url:source_url||null,observed_at:observed_at||null,website_result,reason,detail_level:detailed,website_field:Object.hasOwn(d,'website')?d.website===null?'null':website===''?'empty':'present':'missing',social_profiles:social?[social]:[],rating:d.totalScore??d.rating??null,reviews:d.reviewsCount??d.reviewCount??null,limitations:['Stored source record only; live listing and provider omission semantics remain UNVERIFIED.','none_found means no website listed in the checked record, not no website anywhere.']};
}
module.exports={stamp};
