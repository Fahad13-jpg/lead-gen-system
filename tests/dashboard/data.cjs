'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{dataService,filters}=require('../../scripts/dashboard/data.cjs');
test('campaign review metadata uses the current organization-scoped version after membership validation',async()=>{
 let sql;let checked=false;
 const service=dataService({identity:{principal:async(token,org)=>{assert.equal(org,7);checked=true;}},pool:{query:async value=>{assert.equal(checked,true);sql=value;return{rows:[{found:false,plans:[],campaign_name:null,configured_channels:null}]};}}});
 const result=await service.plans('fixture',{org_id:'7',campaign_id:'9'});
 assert.equal(result.found,false);
 assert.match(sql,/left\(v.config->>'name',255\)/);
 assert.match(sql,/AS configured_channels/);
 assert.match(sql,/c.id=v.campaign_id AND c.version=v.version WHERE v.org_id=7/);
 assert.match(sql,/org_id=7 AND id=9/);
 assert.ok(!sql.includes('v.config AS'));
 const denied=dataService({identity:{principal:async()=>{throw Error('MEMBERSHIP_REQUIRED');}},pool:{query:async()=>assert.fail('must not query')}});
 await assert.rejects(denied.plans('fixture',{org_id:'7',campaign_id:'9'}),/MEMBERSHIP_REQUIRED/);
});
test('campaign reads scope versions, plans and latest approvals and exclude raw configuration',async()=>{
 let sql;const service=dataService({pool:{query:async value=>{sql=value;return{rows:[{total:1,campaigns:[{id:'1',channels:['email','invalid',{secret:true}]}]}]};}},identity:{principal:async(token,org)=>assert.equal(org,7)}});
 const result=await service.campaigns('fixture',{org_id:'7',page:'2',limit:'10'});
 for(const part of ['c.org_id=7','v.org_id=c.org_id','p.org_id=7','org_id=p.org_id','p.campaign_version=c.version','OFFSET 10'])assert.ok(sql.includes(part));
 assert.deepEqual(result.campaigns[0].channels,['email']);assert.ok(!sql.includes('v.config AS'));assert.ok(!sql.includes('actor'));
 await assert.rejects(service.campaigns('fixture',{org_id:'7',user_id:'1'}),/INVALID_FILTER/);
 const denied=dataService({pool:{query:async()=>assert.fail('must not query')},identity:{principal:async()=>{throw Error('MEMBERSHIP_REQUIRED');}}});
 await assert.rejects(denied.campaigns('fixture',{org_id:'7'}),/MEMBERSHIP_REQUIRED/);
});
test('bad or deprecated tenant fields are rejected',()=>{
 for(const p of [{},{org_id:'1 OR true'},{org_id:'1',user_id:'1'},{org_id:'1',page:'-1'},{org_id:'1',limit:'101'},{org_id:'1',q:'x\0y'}])assert.throws(()=>filters(p));
});
test('settings preserve private sender visibility and project capability metadata without credentials',async()=>{
 const queries=[];const pool={query:async sql=>{queries.push(sql);return{rows:[{organization:{name:'Fixture'},connections:[],connection_total:0}]};}};
 const service=dataService({pool,identity:{principal:async()=>({role:'member',subject:"fixture'subject"})}});
 await service.settings('fixture',{org_id:'7'});assert.ok(queries[0].includes("sharing='team' OR owner_subject='fixture''subject'"));assert.ok(queries[0].includes('org_id=7'));
 for(const forbidden of ['credential_ref','inbox_credential_ref','channel_metadata','provider_user_id'])assert.ok(!queries[0].includes(forbidden));
 assert.ok(queries[0].includes("nullif(g.api_key,'') IS NOT NULL"));
 assert.ok(queries[0].includes('j.org_id=7 AND j.provider_account_id=g.id'));
 const admin=dataService({pool,identity:{principal:async()=>({role:'owner',subject:'owner-fixture'})}});await admin.settings('fixture',{org_id:'7'});assert.ok(!queries[1].includes("WHERE org_id=7 AND (sharing='team' OR"));
 await assert.rejects(service.settings('fixture',{org_id:'7',user_id:'7'}),/INVALID_FILTER/);
 const denied=dataService({pool:{query:async()=>assert.fail()},identity:{principal:async()=>{throw Error('MEMBERSHIP_REQUIRED');}}});await assert.rejects(denied.settings('fixture',{org_id:'7'}),/MEMBERSHIP_REQUIRED/);
});
test('outreach reads scope every join and exclude message/credential/error payloads',async()=>{
 let sql;const service=dataService({pool:{query:async s=>{sql=s;return{rows:[{total:0,activities:[],reply_records:0,bounce_records:0,uncertain_records:0}]};}},identity:{principal:async(token,org)=>assert.equal(org,7)}});
 await service.outreach('fixture',{org_id:'7',channel:'email',page:'2',limit:'20'});
 for(const part of ["a.org_id=7 AND a.channel='email'",'c.org_id=a.org_id','OFFSET 20'])assert.ok(sql.includes(part));
 for(const field of ['error_message','external_id','sms_sid','whatsapp_sid','engagement_score'])assert.ok(!sql.includes(field));
 await assert.rejects(service.outreach('fixture',{org_id:'7',channel:"email' OR true"}),/INVALID_FILTER/);
 const denied=dataService({pool:{query:async()=>assert.fail()},identity:{principal:async()=>{throw Error('MEMBERSHIP_REQUIRED');}}});await assert.rejects(denied.outreach('fixture',{org_id:'7'}),/MEMBERSHIP_REQUIRED/);
});
test('strategy progress lookup is read-only and organization scoped',async()=>{
 let sql;const service=dataService({pool:{query:async s=>{sql=s;return{rows:[]};}},identity:{principal:async(token,org)=>assert.equal(org,7)}});
 assert.deepEqual(await service.strategyRequest('fixture',{org_id:'7',request_id:'dash_'+'0'.repeat(32)}),{found:false});
 assert.match(sql,/j.org_id=7/);assert.match(sql,/p.org_id=j.org_id/);assert.ok(!sql.includes('j.error'));assert.ok(!sql.includes('body'));
});
test('membership denial precedes lead and job database access',async()=>{
 let queried=false;const service=dataService({pool:{query:async()=>{queried=true;}},identity:{principal:async()=>{throw Error('MEMBERSHIP_REQUIRED');}}});
 for(const method of ['leads','jobs','overview'])await assert.rejects(service[method]('fixture',{org_id:'7'}),/MEMBERSHIP_REQUIRED/);
 assert.equal(queried,false);
});
test('overview rejects unsupported periods and tenant fields before querying',async()=>{
 const service=dataService({pool:{query:async()=>{throw Error('MUST_NOT_QUERY');}},identity:{principal:async()=>{throw Error('MUST_NOT_AUTH');}}});
 for(const params of [{org_id:'7',days:'8'},{org_id:'7',days:'91'},{org_id:'7',user_id:'1'},{}])await assert.rejects(service.overview('fixture',params),/INVALID_/);
});
test('overview scopes totals, bounds activity dates and excludes sensitive fields',async()=>{
 let sql;const row={counts:{cleaned_leads:3,email_found:2,assessed_leads:1,searches:4,active_searches:0,review_searches:1},search_activity:[],recent_jobs:[],database_timezone:'UTC'};
 const service=dataService({pool:{query:async value=>{sql=value;return{rows:[row]};}},identity:{principal:async(token,org)=>assert.equal(org,7)}});
 const result=await service.overview('fixture',{org_id:'7',days:'7'});
 assert.equal(result.days,7);assert.deepEqual(result.counts,row.counts);
 assert.ok(sql.includes('created_at>=CURRENT_DATE-6 AND created_at<CURRENT_DATE+1'));
 assert.ok(sql.includes('p.org_id=c.org_id'));assert.equal((sql.match(/org_id=7/g)||[]).length,8);
 assert.ok(!/raw_data|api_key|request_settings|error_message/.test(sql));
});
test('leads quote search strings and scope joins and pagination',async()=>{
 let sql;const service=dataService({pool:{query:async value=>{sql=value;return{rows:[{total:0,leads:[]}]};}},identity:{principal:async(token,org)=>{assert.equal(org,7);}}});
 const result=await service.leads('fixture',{org_id:'7',q:"Dentist's % office",page:'2',limit:'25',contact:'email_missing'});
 assert.match(sql,/Dentist''s % office/);assert.match(sql,/c.org_id=7/);assert.match(sql,/p.org_id=c.org_id/);assert.match(sql,/OFFSET 25/);assert.equal(result.total,0);
 assert.ok(!/raw_data|api_key|request_settings/.test(sql));
});
test('jobs scope each pipeline join and expose stored counts without inferred percentages',async()=>{
 let sql;const service=dataService({pool:{query:async value=>{sql=value;return{rows:[{total:0,jobs:[]}]};}},identity:{principal:async()=>{}}});
 await service.jobs('fixture',{org_id:'7'});
 for(const piece of ['WHERE org_id=7','s.org_id=7','l.org_id=s.org_id','c.org_id=l.org_id','p.org_id=c.org_id'])assert.ok(sql.includes(piece));
 for(const piece of ['t.org_id=c.org_id',"t.kind='basic'",'basic_current_count','basic_pending_count','basic_processing_count','basic_failed_count',"interval '30 days'",'enrichment_fingerprint(p.org_id,p.lead_id'])assert.ok(sql.includes(piece));
 for(const piece of ["j.result_mode IN ('new','matching')",'r.org_id=7 AND r.job_id=j.id','existing_match_count','target_shortfall',"j.status IN ('completed','failed','cancelled')",'ELSE NULL'])assert.ok(sql.includes(piece));
 assert.ok(!/error_message|apify_api_key|request_settings/.test(sql));
});
test('uncertain search lookup is read-only, tenant-scoped and validates the reference',async()=>{
 let sql;const service=dataService({pool:{query:async value=>{sql=value;return{rows:[]};}},identity:{principal:async(token,org)=>assert.equal(org,7)}});
 const r=await service.searchRequest('fixture',{org_id:'7',request_id:'dash_'+'a'.repeat(32)});
 assert.equal(r.found,false);assert.match(sql,/WHERE org_id=7 AND request_id=/);assert.match(sql,/^SELECT id AS job_id,status/);
 await assert.rejects(service.searchRequest('fixture',{org_id:'7',request_id:"x' OR true"}),/INVALID_FILTER/);
});
test('lead detail denies membership before data and scopes both the report and profile join',async()=>{
 let sql,calls=0;const pool={query:async value=>{calls++;sql=value;return{rows:[]};}};
 const denied=dataService({pool,identity:{principal:async()=>{throw Error('MEMBERSHIP_REQUIRED');}}});
 await assert.rejects(denied.leadDetail('fixture',{org_id:'7',lead_id:'167'}),/MEMBERSHIP_REQUIRED/);assert.equal(calls,0);
 const service=dataService({pool,identity:{principal:async()=>{}}});const r=await service.leadDetail('fixture',{org_id:'7',lead_id:'167'});
 assert.equal(r.found,false);assert.match(sql,/c.org_id=7 AND c.id=167/);assert.match(sql,/p.org_id=c.org_id/);assert.match(sql,/enrichment_report\(c.org_id,c.id\)/);
 await assert.rejects(service.leadDetail('fixture',{org_id:'7',lead_id:'1 OR true'}),/INVALID_FILTER/);
 await assert.rejects(service.leadDetail('fixture',{org_id:'7',lead_id:'1',user_id:'7'}),/INVALID_FILTER/);
});
