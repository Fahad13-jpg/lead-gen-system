'use strict';
// Shared source inventory for generation/import helpers; these IDs name the
// installed local workflows, not provider credentials or execution authority.
const workflows=Object.freeze([
 {file:'01_connect_apify.json',id:'pqV3XLFfzbJGWxpG',name:'1 - Connect Apify'},
 {file:'02_main_orchestrator.json',id:'7jPOsS56m3qNOkrI',name:'2 - Main Orchestrator'},
 {file:'03_google_maps_scraper.json',id:'Tz2ITCKb2ut8J2ue',name:'3 - Google Maps Scraper',source:'google_maps'},
 {file:'03a_yellow_pages_scraper.json',id:'RY8gsLPbZm4R3zti',name:'3A - Yellow Pages Scraper',source:'yellow_pages'},
 {file:'03b_facebook_pages_scraper.json',id:'CCedag31c0pmbdAL',name:'3B - Facebook Pages Scraper',source:'facebook_pages'},
 {file:'03c_yelp_scraper.json',id:'fF3AIsbTVvj5I2PD',name:'3C - Yelp Scraper',source:'yelp'}
].map(Object.freeze));
module.exports={workflows};
