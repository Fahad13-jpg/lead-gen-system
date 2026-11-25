export function campaignGuidance(data){
 if(!Array.isArray(data.configured_channels))return{step:'setup',title:'Check your campaign settings',text:'Open campaign settings and check how you want to contact leads.'};
 if(data.configured_channels.includes('email')&&!data.sender_connection_id)return{step:'setup',title:'Choose your email account',text:'Select the account you want to use for this campaign.'};
 const plans=data.plans||[],current=plans.filter(p=>p.campaign_version===data.current_version);
 const usable=current.filter(p=>['ai_completed','template_completed','template_fallback'].includes(p.state)&&p.version==='strategy_v2'&&p.integrity_matches===true&&p.expired===false&&Array.isArray(p.validation_errors)&&!p.validation_errors.length&&Array.isArray(p.blocking_reasons)&&!p.blocking_reasons.length);
 const approved=usable.filter(p=>p.approval_action==='approve'&&p.approval_hash_matches===true);
 if(approved.length)return{step:'launch',title:'Choose what to send',text:`${approved.length} ${approved.length===1?'message is':'messages are'} approved. Check the lead and account before sending.`};
 if(usable.length)return{step:'review',title:'Read your messages',text:`${usable.length} ${usable.length===1?'message is':'messages are'} ready for review. Read them before approving.`};
 if(current.some(p=>['ai_completed','template_completed','template_fallback'].includes(p.state)&&p.expired!==true&&(p.expired!==false||p.integrity_matches===undefined||p.version===undefined)))return{step:'review',title:'Check your saved messages',text:'Some message checks are incomplete. Open the messages to see what needs attention.'};
 if(Number.isInteger(data.total)&&data.total===plans.length)return{step:'prepare',title:'Write a new message',text:plans.length?'Your saved messages cannot be used now. Choose a lead and write a new one.':'Choose a lead and write its first message.'};
 return{step:'review',title:'Check your messages',text:'Check the other pages for a message you can use.'};
}
