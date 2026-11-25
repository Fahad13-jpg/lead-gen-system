'use strict';
// Confirm that the existing key-bearing workflow does not persist execution payloads.
function connectionSafety(pool){return async()=>{
 const r=await pool.query(`SELECT count(*)::integer AS matches,bool_and(active AND settings::jsonb->>'saveDataSuccessExecution'='none'
   AND settings::jsonb->>'saveDataErrorExecution'='none' AND settings::jsonb->>'saveManualExecutions'='false'
   AND coalesce(settings::jsonb->>'saveExecutionProgress','false')='false') AS safe
   FROM workflow_entity w WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(w.nodes::jsonb) n
   WHERE n->>'type'='n8n-nodes-base.webhook' AND n->'parameters'->>'path'='connect-apify' AND n->'parameters'->>'authentication'='headerAuth')`);
 return r.rows[0]?.matches===1&&r.rows[0]?.safe===true;
};}
module.exports={connectionSafety};
