'use strict';
// Offline check of saved npm audit reports. This never runs package updates.
const fs=require('node:fs'),path=require('node:path');
function inspect(file,now=Date.now()){
 const stat=fs.statSync(file);if(now-stat.mtimeMs>86400000||stat.mtimeMs>now+60000)throw Error('AUDIT_REPORT_STALE');
 const report=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
 const counts=report.metadata?.vulnerabilities;
 if(report.error||!counts||!['low','moderate','high','critical','total'].every(k=>Number.isSafeInteger(counts[k])&&counts[k]>=0))throw Error('AUDIT_REPORT_INVALID');
 return{report:path.basename(file),counts,blocked:counts.high>0||counts.critical>0};
}
if(require.main===module){try{const files=process.argv.slice(2);if(!files.length)throw Error('AUDIT_REPORTS_REQUIRED');const results=files.map(f=>inspect(f));console.log(JSON.stringify({status:results.some(r=>r.blocked)?'review_required':'no_high_or_critical_reported',results},null,2));process.exitCode=results.some(r=>r.blocked)?1:0;}catch{console.error('DEPENDENCY_REVIEW_INCOMPLETE');process.exitCode=2;}}
module.exports={inspect};
