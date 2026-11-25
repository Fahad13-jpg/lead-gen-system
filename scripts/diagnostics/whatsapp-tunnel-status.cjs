'use strict';
const fs=require('node:fs');
const logs=['ngrok.stdout.log','ngrok.stderr.log'].map(f=>fs.readFileSync('.local/whatsapp-callback/'+f,'utf8')).join('\n');
const messages=[];for(const line of logs.split('\n')){try{const x=JSON.parse(line);if(typeof x.msg==='string'&&['starting web service','starting tunnel','tunnel session started','client session established','failed to reconnect session','failed to establish session','session closed'].includes(x.msg))messages.push(x.msg);}catch{}}
const result={url:logs.match(/https:\/\/[a-z0-9-]+\.(?:ngrok-free\.app|ngrok\.io|ngrok\.app|ngrok-free\.dev)/)?.[0]||null,auth_required:/ERR_NGROK_4018|authtoken.*required|authentication failed/i.test(logs),error_codes:[...new Set(logs.match(/ERR_NGROK_[0-9]+/g)||[])],states:messages.slice(-5)};
console.log(JSON.stringify(result));
