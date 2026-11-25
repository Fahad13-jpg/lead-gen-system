import {activitySummary} from './activitySummary';
test('acceptance, missing receipts and manual actions cannot claim delivery',()=>{
 expect(activitySummary({dispatch_state:'provider_accepted'}).title).toBe('Sent or accepted by provider');expect(activitySummary({}).title).toBe('Awaiting a confirmed outcome');expect(activitySummary({channel:'linkedin',status:'sent'}).title).toBe('Manual activity recorded');
});
test('review and opt-out remain visible even when a send or reply is recorded',()=>{
 const r=activitySummary({dispatch_state:'uncertain',sent_at:'saved',replied_at:'saved'});expect(r.review).toBe(true);expect(r.reply).toBe(true);expect(r.title).toBe('Result needs review');expect(activitySummary({call_result:{outcome:'opt_out'},status:'awaiting_final_cost'}).title).toBe('Opt-out recorded');expect(activitySummary({delivery_status:'failed'}).review).toBe(true);
});
