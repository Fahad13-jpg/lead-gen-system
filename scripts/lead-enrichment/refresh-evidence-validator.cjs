'use strict';
// Patch only the validator's embedded function; preserve nodes, notes and connections.
const fs=require('node:fs'),path=require('node:path');
const {validate}=require('./ai-research.cjs');
const file=path.resolve(__dirname,'../../workflows/06B_ai_deep_research.json');
const workflow=JSON.parse(fs.readFileSync(file,'utf8'));
const node=workflow.nodes.find(n=>n.name==='Validate AI Evidence');
if(!node || node.parameters.mode!=='runOnceForEachItem')throw Error('Unexpected validator node');
const code=node.parameters.jsCode,start=code.indexOf('const validate='),end=code.indexOf(';const response=',start);
if(start<0||end<0)throw Error('Validator boundaries not found');
node.parameters.jsCode=code.slice(0,start)+'const validate='+validate.toString()+code.slice(end);
new Function(node.parameters.jsCode);
fs.writeFileSync(file,JSON.stringify(workflow,null,2)+'\n');
console.log('Updated embedded evidence validator only; graph and sticky notes preserved.');
