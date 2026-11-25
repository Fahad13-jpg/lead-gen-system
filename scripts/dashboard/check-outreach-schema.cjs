'use strict';
const{localPool}=require('./start-local-auth.cjs');
(async()=>{const pool=localPool();try{
 const r=await pool.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='outreach_activities' ORDER BY ordinal_position");
 console.log(JSON.stringify(r.rows));
}finally{await pool.end();}})().catch(()=>{console.error('OUTREACH_SCHEMA_CHECK_FAILED');process.exitCode=1;});
