'use strict';
const {localPool}=require('./start-local-auth.cjs');
(async()=>{const p=localPool();try{
 const columns=await p.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('cleaned_leads','enriched_leads','staging_leads','scraping_jobs','gathering_results') ORDER BY table_name,ordinal_position");
 console.log(JSON.stringify(columns.rows));
}finally{await p.end();}})().catch(()=>{console.error('SCHEMA_READ_FAILED');process.exitCode=1;});
