export const sourceNames={google_maps:'Google Maps',facebook_pages:'Facebook',yellow_pages:'Yellow Pages',yelp:'Yelp',maps_facebook:'Google Maps + Facebook'};

// A combined search reuses two independently admitted jobs; it never doubles
// the displayed target or ceilings and never retries a submission.
export function searchRequests(payload){
 if(payload.source!=='maps_facebook')return[payload];
 const cents=Math.floor(Number(payload.max_cost_usd)*100+1e-8),customer=Math.floor(Number(payload.max_customer_cost_usd)*100+1e-8);
 if(!Number.isInteger(payload.max_results)||payload.max_results<2||payload.max_results>100||!Number.isFinite(cents)||cents<2||cents>100||!Number.isFinite(customer)||customer<0)throw Error('INVALID_COMBINED_SEARCH');
 return ['google_maps','facebook_pages'].map((source,i)=>({...payload,source,
  request_id:payload.request_id.slice(0,-2)+(i?'02':'01'),
  max_results:i?Math.floor(payload.max_results/2):Math.ceil(payload.max_results/2),
  max_cost_usd:(i?Math.floor(cents/2):Math.ceil(cents/2))/100,
  max_customer_cost_usd:(i?Math.floor(customer/2):Math.ceil(customer/2))/100,
  website_filter:'allPlaces'}));
}

export function combinedPreview(request,children){
 const charge=children.reduce((sum,p)=>sum+(p.billing.maximum_customer_charge_usd||0),0);
 const available=children.map(p=>p.billing.wallet_available_usd).filter(Number.isFinite);
 const walletEnough=request.billing_mode==='byok'||!available.length||Math.round(charge*100)<=Math.floor(Math.min(...available)*100);
 const capEnough=request.billing_mode==='byok'||Math.round(charge*100)<=Math.floor(Number(request.max_customer_cost_usd)*100+1e-8);
 return{request,children,candidate_limit:children.reduce((sum,p)=>sum+p.candidate_limit,0),billing:{
  can_submit:walletEnough&&capEnough&&children.every(p=>p.billing.can_submit),
  maximum_customer_charge_usd:charge,
  reason:!walletEnough?'INSUFFICIENT_PLATFORM_CREDITS':!capEnough?'PRICE_CONFIRMATION_REQUIRED':children.find(p=>!p.billing.can_submit)?.billing.reason}};
}

export const uncertainChild=c=>c.state==='unconfirmed';
export const definiteRejection=e=>[400,401,403,409].includes(e.response?.status);

export async function submitCombined(preview,{save,submit}){
 let batch={state:'batch',children:preview.children.map(p=>({source:p.request.source,request_id:p.request.request_id,state:'not_started'}))};
 save(batch);
 for(let i=0;i<batch.children.length;i++){
  batch={...batch,children:batch.children.map((c,j)=>j===i?{...c,state:'unconfirmed'}:c)};
  // Persist BEFORE submission. A storage failure stops before the next POST.
  save(batch);
  let result,failed;
  try{result=await submit(preview.children[i].preview_token);}catch(e){failed=e;}
  batch={...batch,children:batch.children.map((c,j)=>j!==i?c:failed?{...c,state:definiteRejection(failed)?'rejected':'unconfirmed'}:{...c,...result,state:'accepted'})};
  save(batch);
  if(failed)break;
 }
 return batch;
}
