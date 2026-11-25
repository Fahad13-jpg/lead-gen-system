'use strict';
const fs=require('node:fs'),{localPool}=require('../dashboard/start-local-auth.cjs');
async function main(){const p=localPool();try{
 const contacts=(await p.query(`SELECT status,relevance_status,count(*)::integer AS count FROM lead_contacts WHERE org_id=1 GROUP BY status,relevance_status ORDER BY status,relevance_status`)).rows;
 const leads=(await p.query(`SELECT c.id,c.company_name,c.category,c.city,c.website,nullif(trim(c.email),'') IS NOT NULL AS has_email,c.email_verification_status FROM cleaned_leads c WHERE c.org_id=1 AND (nullif(trim(c.email),'') IS NOT NULL OR c.id IN (167,445,446,447,449)) ORDER BY c.id LIMIT 30`)).rows;
 const tasks=(await p.query(`SELECT lead_id,kind,status,attempts,next_attempt,completed_at,last_error FROM contact_tasks WHERE org_id=1 AND lead_id IN (167,445,446,447,449) ORDER BY lead_id,kind`)).rows;
 const controls=(await p.query(`SELECT discovery_enabled,verification_enabled,monthly_requests,provider_pause FROM contact_controls WHERE id`)).rows;
 const cached=(await p.query(`SELECT website,checked_at,expires_at,result->>'status' AS status,CASE WHEN jsonb_typeof(result->'candidates')='array' THEN jsonb_array_length(result->'candidates') ELSE 0 END AS candidate_count FROM contact_discovery_cache WHERE org_id=1 ORDER BY checked_at DESC LIMIT 8`)).rows;
 const result={contacts,leads,tasks,controls,cached,read_only:true,provider_calls:0,checked_at:new Date().toISOString()};fs.writeFileSync('.local/contact-readiness-current.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await p.end();}}
main().catch(()=>{console.error('CONTACT_DIAGNOSTIC_UNCONFIRMED');process.exitCode=1;});
