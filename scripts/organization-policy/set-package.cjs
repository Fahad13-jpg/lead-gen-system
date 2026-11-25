'use strict';
// Trusted local operator utility. No customer-accessible assignment endpoint or payment action.
const {localPool}=require('../dashboard/start-local-auth.cjs');
async function main(){
 const args=process.argv.slice(2),p={};for(let i=0;i<args.length;i+=2){if(!/^--(org|package|reason|expected-revision)$/.test(args[i])||p[args[i]]!==undefined||args[i+1]===undefined)throw Error('INVALID_ARGUMENTS');p[args[i]]=args[i+1];}
 const org=Number(p['--org']),revision=Number(p['--expected-revision']);
 if(!Number.isSafeInteger(org)||org<1||!['free','plus'].includes(p['--package'])||!Number.isSafeInteger(revision)||revision<0||!p['--reason']?.trim()||p['--reason'].length>500)throw Error('Use --org ID --package free|plus --expected-revision N --reason TEXT');
 const db=localPool({registryWrite:true});try{await db.query('BEGIN');
  if(!(await db.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[org])).rows.length)throw Error('ORGANIZATION_NOT_FOUND');
  const current=(await db.query('SELECT package,revision FROM organization_packages WHERE org_id=$1',[org])).rows[0];
  if((current?.revision||0)!==revision)throw Error('PACKAGE_REVISION_CHANGED');
  if(current?.package!==p['--package'])await db.query(`INSERT INTO organization_packages(org_id,package,changed_by,reason) VALUES($1,$2,'local_operator',$3) ON CONFLICT(org_id) DO UPDATE SET package=excluded.package,changed_by=excluded.changed_by,reason=excluded.reason`,[org,p['--package'],p['--reason'].trim()]);
  const result=(await db.query('SELECT organization_package_snapshot($1) AS package',[org])).rows[0].package;
  await db.query('COMMIT');console.log(JSON.stringify({org_id:org,package:result,credits_granted:0,sending_started:false,fresh_paid_content_approval_required:result.name==='plus'}));
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{await db.end();}
}
if(require.main===module)main().catch(e=>{console.error(['ORGANIZATION_NOT_FOUND','PACKAGE_REVISION_CHANGED'].includes(e.message)?e.message:'PACKAGE_ASSIGNMENT_FAILED');process.exitCode=1;});
module.exports={main};
