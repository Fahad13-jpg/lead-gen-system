export function activitySummary(a){
 const review=['uncertain','reconciliation_required','needs_review','awaiting_final_cost'].some(v=>[a.status,a.dispatch_state,a.delivery_status].includes(v));
 const reply=!!a.replied_at;
 const result=(tone,title,text,needsReview=false)=>({tone,title,text,reply,review:needsReview});
 if(a.call_result?.outcome==='opt_out'||a.status==='opt_out')return result('stopped','Opt-out recorded','Do not contact this recipient again. Review the recorded stop before any further action.',review);
 if(review)return result('review','Result needs review','The outcome or final cost is not confirmed. Check the existing activity before sending or calling again.',true);
 if(a.bounced_at||['bounced','failed','undelivered'].includes(a.delivery_status)||a.status==='bounced')return result('review','Delivery needs attention','A bounce or delivery failure was recorded. Check the recipient and sender before considering another attempt.',true);
 if(reply)return result('reply','Reply recorded','Review the conversation in the connected inbox before deciding how to follow up.');
 if(['linkedin','messenger'].includes(a.channel))return result('neutral','Manual activity recorded','This is a saved manual action. It does not establish provider delivery or a reply.');
 if(a.channel==='call')return result('neutral','Call activity recorded','Review the saved call outcome below. A callback request or pending booking is not a confirmed appointment.');
 if(a.delivery_status==='delivered')return result('delivered','Delivery recorded','A delivery event is recorded. It does not establish that the recipient read the message.');
 if(a.dispatch_state==='provider_accepted'||a.sent_at||a.status==='sent')return result('neutral','Sent or accepted by provider','Delivery and a reply are not confirmed by this send record. Wait for recorded updates before deciding what to do next.');
 return result('neutral','Awaiting a confirmed outcome','Review the recorded details below. Missing delivery or reply events remain unknown.');
}
