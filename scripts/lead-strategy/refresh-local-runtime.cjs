'use strict';
// Local file edit only. Does not import, activate, deploy or connect to a database.
const fs=require('fs'),assert=require('assert/strict'),rt=require('./runtime.cjs');
const file='workflows/06C_outreach_strategy_generator.json',workflow=JSON.parse(fs.readFileSync(file)),before=structuredClone(workflow);
let changed=0;for(const node of workflow.nodes){const code=node.parameters?.jsCode;if(!code?.startsWith('const rt=(function strategyRuntime(){'))continue;const boundary=code.indexOf('})();');assert(boundary>=0,'Missing runtime boundary');node.parameters.jsCode='const rt=('+rt.strategyRuntime.toString()+')();'+code.slice(boundary+5);changed++;}
assert.equal(changed,9);assert.deepEqual(workflow.connections,before.connections);
for(const old of before.nodes){const current=workflow.nodes.find(n=>n.id===old.id);if(old.type.endsWith('.stickyNote'))assert.deepEqual(current,old);else{const a=structuredClone(old),b=structuredClone(current);delete a.parameters.jsCode;delete b.parameters.jsCode;assert.deepEqual(a,b);}}
fs.writeFileSync(file,JSON.stringify(workflow,null,2)+'\n');console.log('Refreshed nine existing Code-node runtime copies; graph, settings, notes and other parameters preserved.');
