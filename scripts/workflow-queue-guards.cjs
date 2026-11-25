'use strict';
// Keep zero-row claims explicit without changing workflow connections or SQL.
const pairs=[['Drain Queue','Dispatch Context'],['Claim Tasks','Validate Worker Arguments'],['Claim Cleaning Batch','Normalize Leads'],['Claim Enrichment Tasks','Validate Lease']];
const guard="// An empty claim is an idle queue, never a task.\nconst queueItems=$input.all();\nif(!queueItems.length||queueItems.every(item=>item&&item.json&&Object.keys(item.json).length===0))return [];\n";
function install(nodes){let count=0;for(const [claimName,consumerName] of pairs){const claim=nodes.find(n=>n.name===claimName),consumer=nodes.find(n=>n.name===consumerName);if(!claim||!consumer)continue;
 if(!claim.type.endsWith('.postgres')||!consumer.type.endsWith('.code')||consumer.parameters.mode!==undefined&&consumer.parameters.mode!=='runOnceForAllItems')throw Error('QUEUE_GUARD_SHAPE_CHANGED');
 consumer.parameters.mode='runOnceForAllItems';
 claim.alwaysOutputData=true;if(!consumer.parameters.jsCode.startsWith(guard))consumer.parameters.jsCode=guard+consumer.parameters.jsCode;count++;
 }return count;}
module.exports={install,guard};
