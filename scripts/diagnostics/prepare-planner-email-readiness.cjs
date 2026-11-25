'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),{localPool}=require('../dashboard/start-local-auth.cjs');
const names=['Prepare Strategy','Validate and Assemble Draft','Build Preview','Claim Strategy Jobs','preview Database'];
async function main(){const pool=localPool();try{
 const source=JSON.parse(fs.readFileSync('workflows/06C_outreach_strategy_generator.json'));
 const rows=(await pool.query(`SELECT id,name,active,nodes,connections,settings FROM workflow_entity WHERE nodes::text LIKE '%Claim Strategy Jobs%' AND nodes::text LIKE '%Prepare Strategy%'`)).rows;assert.equal(rows.length,1,'ONE_PLANNER_REQUIRED');const before=rows[0],candidate=structuredClone(before);
 for(const name of names){const node=candidate.nodes.find(n=>n.name===name),next=source.nodes.find(n=>n.name===name);assert(node&&next&&node.type===next.type,'PLANNER_NODE_MISMATCH');
  if(next.parameters.jsCode){assert.equal(node.parameters.mode,next.parameters.mode);node.parameters.jsCode=next.parameters.jsCode;}else node.parameters.query=next.parameters.query;
 }
 const strip=w=>{w=structuredClone(w);for(const n of w.nodes)if(names.includes(n.name)){delete n.parameters.jsCode;delete n.parameters.query;}return w;};assert.deepEqual(strip(before),strip(candidate));
 const project=(await pool.query(`SELECT "projectId" FROM shared_workflow WHERE "workflowId"='${String(before.id).replace(/'/g,"''")}' LIMIT 1`)).rows[0]?.projectId;assert(/^[A-Za-z0-9_-]{1,36}$/.test(project));
 const changed=names.filter(name=>JSON.stringify(before.nodes.find(n=>n.name===name).parameters)!==JSON.stringify(candidate.nodes.find(n=>n.name===name).parameters));const dir='.local/planner-email-readiness-'+Date.now();fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/before.json',JSON.stringify(before,null,2));fs.writeFileSync(dir+'/workflow.json',JSON.stringify(candidate,null,2));fs.writeFileSync(dir+'/manifest.json',JSON.stringify({workflow_id:before.id,project_id:project,previous_active:before.active,changed_nodes:changed},null,2));console.log(JSON.stringify({bundle:dir,changed_nodes:changed,graph_notes_credentials_settings_preserved:true,previous_active:before.active,live_changed:false}));
}finally{await pool.end();}}
main().catch(()=>{console.error('PLANNER_PREPARATION_UNCONFIRMED');process.exitCode=1;});
