'use strict';
const fs=require('fs'),assert=require('assert/strict'),dir='documentation/hardening-review-20261012/';
const all=fs.readFileSync(dir+'connectivity-control.jsonl','utf8').trim().split('\n').map(JSON.parse),rows=all.filter(r=>r.type==='request');assert.equal(rows.length,700);
const groups={};for(const r of rows){const key=r.container+':'+r.client+':'+(r.ipv4?'ipv4':'default');(groups[key]??=[]).push(r);}
const summary={metadata:all.filter(r=>r.type==='ready'),groups:{},window_definition:'Consecutive failed sampled requests in one group; duration first failure start to next successful sample start. Not proof of continuous outage between samples.'};
const host=rows.filter(r=>r.container==='windows_host');
for(const [key,group]of Object.entries(groups)){assert.equal(group.length,100);assert.equal(new Set(group.map(r=>r.round)).size,100);const failed=group.filter(r=>r.status!==200),windows=[];let open;
 for(const r of group){if(r.status!==200){if(!open)open={start:r.at,first_round:r.round,count:0};open.count++;open.last_failure_end=r.end_at;}else if(open){open.recovered_at=r.at;windows.push(open);open=null}}if(open)windows.push({...open,right_censored:true});
 for(const w of windows){w.duration_ms=Date.parse(w.recovered_at||w.last_failure_end)-Date.parse(w.start);const samples=host.filter(r=>Date.parse(r.at)>=Date.parse(w.start)&&Date.parse(r.at)<=Date.parse(w.recovered_at||w.last_failure_end));w.host_samples=samples.length;w.host_errors=samples.filter(r=>r.status!==200).length;}
 const classes={};for(const r of failed)for(const code of new Set(r.errors.map(e=>e.code)))classes[code]=(classes[code]||0)+1;
 const times=group.map(r=>r.elapsed_ms).sort((a,b)=>a-b);summary.groups[key]={success:100-failed.length,total:100,errors:classes,p50_ms:(times[49]+times[50])/2,max_ms:times[99],windows,observed_families:[...new Set(group.map(r=>r.family).filter(Boolean))]};
}
fs.writeFileSync(dir+'connectivity-control-summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary.groups,null,2));
