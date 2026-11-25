import{campaignGuidance}from'./campaignGuidance';
const base={configured_channels:['sms'],current_version:2,total:1};
const plan={campaign_version:2,state:'ai_completed',version:'strategy_v2',integrity_matches:true,expired:false,validation_errors:[],blocking_reasons:[]};
test('older or unconfirmed drafts cannot imply approval readiness',()=>{
 expect(campaignGuidance({...base,plans:[{...plan,campaign_version:1}]}).step).toBe('prepare');expect(campaignGuidance({...base,plans:[{...plan,expired:undefined}]}).step).toBe('review');expect(campaignGuidance({...base,plans:[{...plan,blocking_reasons:['review']}]}).step).toBe('prepare');
});
test('matching current approvals recommend reviewing channel controls without claiming sending readiness',()=>{
 const r=campaignGuidance({...base,plans:[{...plan,approval_action:'approve',approval_hash_matches:true}]});expect(r.step).toBe('launch');expect(r.text).toContain('before starting');expect(campaignGuidance({...base,plans:[plan]}).step).toBe('review');
});
test('pagination and missing channel configuration stay explicit',()=>{
 expect(campaignGuidance({...base,total:20,plans:[]}).step).toBe('review');expect(campaignGuidance({...base,configured_channels:undefined,plans:[]}).step).toBe('setup');expect(campaignGuidance({...base,configured_channels:['email'],plans:[plan]}).step).toBe('setup');
});
