'use strict';
// Schedule cadence never overrides the recipient-local campaign/plan windows.
function within(now,zone,windows){
 if(typeof now!=='string'||!Number.isFinite(Date.parse(now))||typeof zone!=='string'||!Array.isArray(windows)||!windows.length)return false;
 let p;
 try{p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).map(x=>[x.type,x.value]));}catch{return false;}
 const seconds=Number(p.hour)*3600+Number(p.minute)*60+Number(p.second);
 const parse=v=>typeof v==='string'&&/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(v)?Number(v.slice(0,2))*3600+Number(v.slice(3))*60:null;
 // Reject malformed or overnight configuration. Split overnight windows explicitly.
 if(windows.some(w=>!w||!Array.isArray(w.days)||!w.days.length||w.days.some(d=>!['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].includes(d))||parse(w.start)===null||parse(w.end)===null||parse(w.start)>=parse(w.end)))return false;
 // Require enough room for the full 60-second call before closing time.
 return windows.some(w=>w.days.includes(p.weekday)&&seconds>=parse(w.start)&&seconds+60<=parse(w.end));
}
function eligible(x){return x?.recipient_timezone_verified===true&&within(x.now,x.recipient_timezone,x.campaign_windows)&&within(x.now,x.recipient_timezone,x.plan_windows);}
module.exports={within,eligible};
