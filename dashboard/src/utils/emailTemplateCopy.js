export const EMAIL_OPT_OUT_LINE='Reply STOP to opt out.';
export const DEFAULT_SENDER_LINE='{{sender_name}} | {{sender_company}}';

export function completeEmailCopy(value,signature){
 let body=typeof value==='string'?value.trimEnd():'';
 const sender=typeof signature==='string'&&signature.trim()&&!/[\r\n]/.test(signature)
  ?signature.trim():DEFAULT_SENDER_LINE;
 const lines=body.split(/\r?\n/).map(line=>sender!==DEFAULT_SENDER_LINE&&line.trim()===DEFAULT_SENDER_LINE?sender:line);
 while(lines.length&&lines.at(-1).trim()===EMAIL_OPT_OUT_LINE)lines.pop();
 body=lines.join('\n').trimEnd();
 if(!body.split(/\r?\n/).some(line=>line.trim()===sender))body+=(body?'\n\n':'')+sender;
 return body+'\n'+EMAIL_OPT_OUT_LINE;
}

export function emailCopyLengthError(value,signature){
 return completeEmailCopy(value,signature).length>1200?'Keep each email under 1,200 characters. The sender line and opt-out line are added automatically.':'';
}
