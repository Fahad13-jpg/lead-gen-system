'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process');
const {scope}=require('../../scripts/dashboard/lead-scope.cjs');
// Read-only SQL fixtures: source IDs intentionally collide with unrelated business IDs.
const fixtures=`WITH staging_leads(org_id,id,job_id) AS(VALUES(1,10,8),(1,11,6),(1,12,6),(2,13,8)),cleaned_leads(org_id,id,staging_id) AS(VALUES(1,100,10),(1,101,11),(1,10,12),(2,200,13)),cleaning_links(org_id,staging_id,cleaned_id) AS(VALUES(1,10,100),(1,11,101),(2,13,200)),gathering_results(org_id,job_id,lead_id) AS(VALUES(1,8,10),(1,8,11),(2,8,13))`;
function ids(org,search){const sql=fixtures+` SELECT coalesce(json_agg(c.id ORDER BY c.id),'[]'::json) FROM cleaned_leads c WHERE c.org_id=${org}${scope({search_id:String(search)}).where(org)};`;const r=cp.spawnSync('docker',['exec','-i','postgres_db','psql','-U','n8n_user','-d','lead_db','-X','-At','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout.trim());}
assert.deepEqual(ids(1,8),[100,101]); // Includes reused source records through cleaning links.
assert.deepEqual(ids(2,8),[200]); // Does not cross organizations.
assert.deepEqual(ids(1,99),[]); // Does not fall back to all businesses.
console.log('PASS: source-ID collision, reused businesses, organization isolation and empty search');
