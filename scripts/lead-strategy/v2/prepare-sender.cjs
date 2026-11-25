'use strict';
// Offline only: node prepare-sender.cjs input.json output.json
const fs=require('fs'),path=require('path'),policy=require('./sender-policy.cjs');
try{
 const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('INPUT_AND_OUTPUT_REQUIRED');
 const draft=policy.draft(JSON.parse(fs.readFileSync(input,'utf8')));
 const target=path.resolve(output),root=process.cwd()+path.sep;
 if(!target.startsWith(root))throw Error('OUTPUT_MUST_BE_IN_WORKSPACE');
 fs.writeFileSync(target,JSON.stringify(draft,null,2)+'\n',{flag:'wx'});
 console.log('Disabled sender draft created locally. No credentials verified, database writes, imports or sending.');
}catch(e){console.error(['INPUT_AND_OUTPUT_REQUIRED','OUTPUT_MUST_BE_IN_WORKSPACE','ORGANIZATION_REQUIRED','UNSUPPORTED_SETUP_FIELD'].includes(e.message)||/^[a-z_,]+$/.test(e.message)?e.message:'SENDER_DRAFT_FAILED');process.exitCode=1;}
