'use strict';
const fs=require('fs'),assert=require('assert/strict'),{run,owner}=require('./h-role-test.cjs'),{dir}=require('./h-permissions.cjs'),{advance}=require('../lead-enrichment/linkedin.cjs');
async function main(){const result=run(`BEGIN;SET LOCAL ROLE ${owner};UPDATE enrichment_controls SET enabled=false WHERE id;
 DO $t$ BEGIN ASSERT (SELECT count(*) FROM enrichment_claim('basic',5))=0;ASSERT (SELECT count(*) FROM enrichment_claim('research',5))=0;END $t$;
 UPDATE enrichment_controls SET enabled=true,lead_ids=ARRAY[167] WHERE id;
 DO $t$ DECLARE n integer;before_research jsonb;BEGIN
 SELECT jsonb_agg(to_jsonb(t) ORDER BY id) INTO before_research FROM enrichment_tasks t WHERE kind='research';
 SELECT count(*) INTO n FROM enrichment_claim('basic',5);ASSERT n=1,'basic-only claim failed';
 ASSERT (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM enrichment_tasks t WHERE kind='research')=before_research,'basic claim mutated research';
 END $t$;SELECT 'PASS global pause blocks basic and research; explicit basic-only claim leaves research unchanged';ROLLBACK;`);
 let externalCalls=0;const db={query:async query=>{if(query.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};if(query.includes('SELECT enabled,lead_ids'))return {rows:[{enabled:false,lead_ids:null}]};if(query.includes('pg_advisory_unlock'))return {rows:[{}]};throw Error('Unexpected query while paused')}};
 assert.deepEqual(await advance(db,async()=>{externalCalls++;throw Error('Provider forbidden')}),{paused:true});assert.equal(externalCalls,0);
 fs.writeFileSync(dir+'/pause-test-results.txt',result+'\nPASS actual LinkedIn advance with disabled-controls mock: zero provider calls.\nSQL fixtures rolled back. No workflow activation/import tested.\n');console.log(result);console.log('PASS paused LinkedIn helper: zero provider calls.');}
main().catch(e=>{console.error(e.message);process.exitCode=1});
