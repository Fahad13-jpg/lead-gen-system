const labels={google_maps:'Google Maps',facebook_pages:'Facebook',yellow_pages:'Yellow Pages',yelp:'Yelp',maps_facebook:'Google Maps and Facebook',
 queued:'Queued',pending:'Waiting',running:'In progress',completed:'Complete',failed:'Needs attention',needs_review:'Needs attention',cancelled:'Cancelled',
 disabled:'Paused',disconnected:'Disconnected',pending_check:'Check pending',ready:'Ready',provider_accepted:'Accepted by provider',
 ai_completed:'Draft ready',template_completed:'Draft ready',ai_failed:'Draft needs review',template_failed:'Draft needs review',
 email:'Email',sms:'Text message',call:'Phone call',linkedin:'LinkedIn',whatsapp:'WhatsApp',messenger:'Messenger',
 scheduled:'Scheduled',paused:'Paused',draft:'Draft',awaiting_approval:'Awaiting approval',needs_attention:'Needs attention',
 reconciliation_required:'Result needs checking',awaiting_final_cost:'Cost needs checking',uncertain:'Result needs checking',
 sent:'Sent',delivered:'Delivered',replied:'Replied',opt_out:'Opted out',stopped:'Stopped',active:'Active',owner:'Owner',admin:'Admin',member:'Member'};
export function uiLabel(value,fallback='Not recorded'){if(value===null||value===undefined||value==='')return fallback;return labels[value]||String(value).replace(/[_-]+/g,' ').replace(/^./,s=>s.toUpperCase());}
export function money(value){return typeof value==='number'&&Number.isFinite(value)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:4}).format(value):'Not confirmed';}
