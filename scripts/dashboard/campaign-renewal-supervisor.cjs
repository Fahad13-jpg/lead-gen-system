'use strict';
// One bounded pass per minute in the existing gateway; disabled means no timer or I/O.
function supervisor({enabled=false,run,onResult=()=>{},onError=()=>{},setTimer=setInterval,clearTimer=clearInterval}){
 let timer,inflight=null,state=enabled?'waiting':'disabled';
 const stop=()=>{if(timer!==undefined){clearTimer(timer);timer=undefined;}state='stopped';return inflight||Promise.resolve();};
 async function tick(){
  if(!enabled||inflight||!['waiting','running'].includes(state))return;
  state='running';
  inflight=Promise.resolve().then(run).then(result=>{
   const uncertain=result?.state!=='tick_complete'||!Array.isArray(result.states)||result.states.some(s=>!['idle','complete','authority_changed','publication_denied'].includes(s));
   if(state!=='stopped')state=uncertain?'suspended':'waiting';
   if(uncertain&&timer!==undefined){clearTimer(timer);timer=undefined;}
   onResult({state,campaigns:result?.campaigns||0,issued:result?.issued||0,states:result?.states||[]});
  }).catch(()=>{if(state!=='stopped')state='suspended';if(timer!==undefined){clearTimer(timer);timer=undefined;}onError('CAMPAIGN_RENEWAL_RECONCILIATION_REQUIRED');}).finally(()=>{inflight=null;});
  return inflight;
 }
 if(enabled)timer=setTimer(()=>{void tick();},60000);
 return{stop,tick,status:()=>state,ready:()=>enabled&&['waiting','running'].includes(state)};
}
module.exports={supervisor};
