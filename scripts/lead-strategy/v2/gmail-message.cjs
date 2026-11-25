'use strict';
const {address,header}=require('./gmail-replies.cjs');
const safeId=v=>typeof v==='string'&&/^[a-f0-9]{8,64}$/i.test(v);
function encodedSubject(subject){
 const chunks=[];let current='';
 for(const char of subject){if(Buffer.byteLength(current+char,'utf8')>42){chunks.push(current);current='';}current+=char;}
 if(current)chunks.push(current);
 return chunks.map(s=>'=?UTF-8?B?'+Buffer.from(s).toString('base64')+'?=').join('\r\n ');
}
function prepare(message,sender,parent=null){
 if(!address(sender?.email)||!sender?.credential_ref||!address(message?.to_email))throw Error('INVALID_MAILBOX');
 if(typeof message.subject_line!=='string'||!message.subject_line.trim()||message.subject_line.length>200||/[\x00-\x1f\x7f]/.test(message.subject_line))throw Error('INVALID_SUBJECT');
 if(typeof message.email_body!=='string'||!message.email_body||Buffer.byteLength(message.email_body)>50000)throw Error('INVALID_BODY');
 if(!Number.isInteger(message.step)||message.step<1||message.step>10)throw Error('INVALID_STEP');
 const headers=['From: '+address(sender.email),'To: '+address(message.to_email),'Subject: '+encodedSubject(message.subject_line),
 'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64'];
 let threadId;
 if(message.step>1){
  const a=parent?.activity,m=parent?.message;
  if(!a||!m||String(a.org_id)!==String(message.org_id)||String(a.plan_id)!==String(message.plan_id)||
    a.content_hash!==message.content_hash||Number(a.step)!==message.step-1||a.state!=='provider_accepted'||
    a.credential_ref!==sender.credential_ref||address(a.sender_email)!==address(sender.email)||
    !safeId(a.external_id)||m.id!==a.external_id||!safeId(m.threadId)||m.error)throw Error('THREAD_CONTEXT_REQUIRED');
  if(address(header(m,'From'))!==address(sender.email)||address(header(m,'To'))!==address(message.to_email))throw Error('THREAD_PARTICIPANTS_MISMATCH');
  // Never silently change an approved subject or invent Re: history.
  if(header(m,'Subject')!==message.subject_line)throw Error('THREAD_SUBJECT_REAPPROVAL_REQUIRED');
  const ref=header(m,'Message-ID');
  if(!/^<[^<>\s\x00-\x1f]+>$/.test(ref)||ref.length>250)throw Error('THREAD_REFERENCE_INVALID');
  const previous=header(m,'References');
  const refs=previous?previous.match(/<[^<>\s\x00-\x1f]+>/g)||[]:[];
  if(previous&&previous.replace(/<[^<>\s\x00-\x1f]+>/g,'').trim())throw Error('THREAD_REFERENCE_INVALID');
  const chain=[...new Set([...refs,ref])];
  if(chain.length>20||chain.some(s=>s.length>250)||chain.join(' ').length>800)throw Error('THREAD_REFERENCE_TOO_LONG');
  headers.push('In-Reply-To: '+ref,'References: '+chain.join('\r\n '));threadId=m.threadId;
 }
 const body=Buffer.from(message.email_body.replace(/\r?\n/g,'\r\n'),'utf8').toString('base64').match(/.{1,76}/g).join('\r\n');
 const raw=Buffer.from(headers.join('\r\n')+'\r\n\r\n'+body+'\r\n','utf8').toString('base64url');
 return threadId?{raw,threadId}:{raw};
}
module.exports={prepare,encodedSubject};
