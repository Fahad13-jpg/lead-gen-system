'use strict';
const {deliveryReport}=require('../lead-strategy/v2/gmail-replies.cjs');
function addresses(value){return (value?.value||[]).map(v=>String(v.address||'').toLowerCase());}
async function parse(source,simpleParser){
 if(!Buffer.isBuffer(source)||source.length>1048576)throw Error('MIME_LIMIT');
 const m=await simpleParser(source,{keepDeliveryStatus:true,skipHtmlToText:true,skipTextToHtml:true,skipImageLinks:true});
 const from=addresses(m.from),to=addresses(m.to);
 const parts=(m.attachments||[]).filter(a=>['message/delivery-status','message/rfc822','text/rfc822-headers'].includes(a.contentType)).map(a=>({mimeType:a.contentType,body:{data:a.content.toString('base64url')}}));
 return {message_id:m.messageId,from:from.length===1?from[0]:null,to,in_reply_to:m.inReplyTo,
 references:Array.isArray(m.references)?m.references:typeof m.references==='string'?[m.references]:[],text:m.text||'',
 received_at:m.date?.toISOString(),auto_submitted:m.headers.get('auto-submitted'),
 delivery_payload:{mimeType:m.headers.get('content-type')?.value,parts}};
}
function bounce(activity,incoming){
 const payload=incoming.delivery_payload;
 if(!payload?.parts?.some(p=>p.mimeType==='message/delivery-status'))return null;
 return deliveryReport({payload:{headers:[{name:'Message-ID',value:activity.message_id}]}},{payload},activity.recipient);
}
module.exports={parse,bounce};
