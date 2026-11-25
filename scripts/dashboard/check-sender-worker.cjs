'use strict';
// Operator read-only inventory. Never prints credential references or values.
const{localPool}=require('./start-local-auth.cjs');
(async()=>{const pool=localPool();try{
 const r=await pool.query(`SELECT w.id,w.name,w.active,n->>'type' AS node_type,n->'parameters'->>'operation' AS operation
 FROM workflow_entity w CROSS JOIN LATERAL jsonb_array_elements(w.nodes::jsonb)n
 WHERE n->>'type' ILIKE '%managedsender%' ORDER BY w.name`);
 console.log(JSON.stringify({workers:r.rows,workflows_changed:false}));
}finally{await pool.end();}})().catch(()=>{console.error('SENDER_WORKER_INVENTORY_FAILED');process.exitCode=1;});
