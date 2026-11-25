import{searchRequests,combinedPreview,submitCombined}from'./searchSources';
const request={source:'maps_facebook',request_id:'dash_'+'a'.repeat(32),max_results:5,max_cost_usd:.51,max_customer_cost_usd:.31,billing_mode:'platform',website_filter:'withoutWebsite'};
const children=()=>searchRequests(request).map((request,i)=>({request,preview_token:'token'+i,candidate_limit:request.max_results*3,billing:{can_submit:true,maximum_customer_charge_usd:.2,wallet_available_usd:1}}));
test('combined budgets and targets are split, never multiplied; Facebook limits and independent request IDs hold',()=>{
 const rows=searchRequests(request);expect(rows.map(r=>r.max_results)).toEqual([3,2]);expect(rows.map(r=>r.max_cost_usd)).toEqual([.26,.25]);expect(rows.map(r=>r.max_customer_cost_usd)).toEqual([.16,.15]);expect(new Set(rows.map(r=>r.request_id)).size).toBe(2);expect(rows.every(r=>/^dash_[a-f0-9]{32}$/.test(r.request_id)&&r.website_filter==='allPlaces')).toBe(true);
 expect(searchRequests({...request,max_results:100,max_cost_usd:1})[1].max_results).toBe(50);
 expect(()=>searchRequests({...request,max_cost_usd:.01})).toThrow();expect(()=>searchRequests({...request,max_results:101})).toThrow();
});
test('aggregate platform credit shortfall blocks confirmation although individual previews pass',()=>{
 const rows=children();rows.forEach(r=>r.billing.wallet_available_usd=.3);expect(combinedPreview(request,rows).billing).toMatchObject({can_submit:false,reason:'INSUFFICIENT_PLATFORM_CREDITS'});
 expect(combinedPreview({...request,billing_mode:'byok'},rows).billing.can_submit).toBe(true);
});
test('uncertain first admission preserves its ID and never starts the second source',async()=>{
 const saved=[],submit=jest.fn().mockRejectedValue(Error('timeout'));
 const r=await submitCombined({children:children()},{save:v=>saved.push(JSON.parse(JSON.stringify(v))),submit});
 expect(submit).toHaveBeenCalledTimes(1);expect(saved[1].children[0].state).toBe('unconfirmed');expect(r.children.map(c=>c.state)).toEqual(['unconfirmed','not_started']);
});
test('partial admission preserves the first saved job when the second is rejected',async()=>{
 const submit=jest.fn().mockResolvedValueOnce({job_id:12,status:'queued'}).mockRejectedValueOnce({response:{status:409}});
 const r=await submitCombined({children:children()},{save:()=>{},submit});
 expect(r.children[0]).toMatchObject({state:'accepted',job_id:12});expect(r.children[1].state).toBe('rejected');expect(submit).toHaveBeenCalledTimes(2);
});
test('a persistence failure before an admission prevents any paid submission',async()=>{
 const submit=jest.fn();let saves=0;await expect(submitCombined({children:children()},{save:()=>{if(++saves===2)throw Error('storage unavailable');},submit})).rejects.toThrow();expect(submit).not.toHaveBeenCalled();
});
