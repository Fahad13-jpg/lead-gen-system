'use strict';
// One explicit operator-approved grant: this verified Firebase account, org 1 only.
// Not exposed through HTTP. Does not change organizations, senders or budgets.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {initializeApp,cert,deleteApp}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth'),{Pool}=require('pg');
const {membershipLoader}=require('./memberships.cjs');
const projectId='lead-gen-system-fad55',email='mohmmadfahad53408@gmail.com',orgId=1,orgName='Demo Company';
const q=value=>"'"+String(value).replace(/'/g,"''")+"'";
async function main(){
  const credential=JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE,'Downloads','firebase-admin.json'),'utf8'));
  if(credential.project_id!==projectId)throw Error('PROJECT_MISMATCH');
  const app=initializeApp({projectId,credential:cert(credential)},'approved-owner-enrollment');
  let pool;
  try{
    const user=await getAuth(app).getUserByEmail(email);
    if(user.email!==email||!user.emailVerified||user.disabled)throw Error('VERIFIED_ACCOUNT_REQUIRED');
    const subject=crypto.createHash('sha256').update(`https://securetoken.google.com/${projectId}`+'\0'+user.uid).digest('hex');
    const inspection=cp.spawnSync('docker',['inspect','postgres_db'],{encoding:'utf8',timeout:30000,maxBuffer:100000});
    if(inspection.status!==0)throw Error('LOCAL_DATABASE_UNAVAILABLE');
    const info=JSON.parse(inspection.stdout)[0];if(info.Name!=='/postgres_db')throw Error('LOCAL_DATABASE_MISMATCH');
    const env=Object.fromEntries(info.Config.Env.map(v=>{const i=v.indexOf('=');return[v.slice(0,i),v.slice(i+1)];}));
    const port=info.NetworkSettings.Ports['5432/tcp']?.find(p=>['127.0.0.1','0.0.0.0'].includes(p.HostIp))?.HostPort;
    if(!port||!env.POSTGRES_USER||!env.POSTGRES_PASSWORD)throw Error('DATABASE_CONFIGURATION_REQUIRED');
    pool=new Pool({host:'127.0.0.1',port:Number(port),database:'lead_db',user:env.POSTGRES_USER,password:env.POSTGRES_PASSWORD,max:1,connectionTimeoutMillis:5000,query_timeout:5000,application_name:'lead_dashboard_approved_enrollment'});
    const db=await pool.connect();
    try{
      await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='5s'");
      const org=(await db.query(`SELECT id,org_name,status FROM organizations WHERE id=${orgId} FOR UPDATE`)).rows[0];
      if(org?.org_name!==orgName||org.status!=='active')throw Error('ORGANIZATION_MISMATCH');
      const before=(await db.query(`SELECT org_id,subject,role,active FROM org_sender_memberships WHERE org_id=${orgId} AND subject=${q(subject)} FOR UPDATE`)).rows[0]||null;
      const apply=process.argv.includes('--apply');
      const record={at:new Date().toISOString(),project_id:projectId,email,org_id:orgId,org_name:orgName,subject,before,requested:{role:'owner',active:true},scope:'explicit user approval in chat; membership only'};
      if(apply){
        const dir=path.resolve(__dirname,'../../.local/dashboard-auth');fs.mkdirSync(dir,{recursive:true});
        const auditFile=path.join(dir,'approved-owner-'+Date.now()+'.json');
        fs.writeFileSync(auditFile,JSON.stringify({...record,state:'prepared'},null,2),{flag:'wx'});
        await db.query(`INSERT INTO org_sender_memberships(org_id,subject,role,active) VALUES(${orgId},${q(subject)},'owner',true)
          ON CONFLICT(org_id,subject) DO UPDATE SET role='owner',active=true
          WHERE org_sender_memberships.role IS DISTINCT FROM 'owner' OR org_sender_memberships.active IS DISTINCT FROM true`);
        const after=(await db.query(`SELECT org_id,subject,role,active FROM org_sender_memberships WHERE org_id=${orgId} AND subject=${q(subject)}`)).rows[0];
        if(after?.role!=='owner'||after.active!==true)throw Error('GRANT_CHECK_FAILED');
        await db.query('COMMIT');
        fs.writeFileSync(auditFile,JSON.stringify({...record,state:'committed',after},null,2));
        const memberships=await membershipLoader(db)(subject);
        if(!memberships.some(m=>m.org_id===orgId&&m.role==='owner'&&m.active&&m.organization_active))throw Error('MEMBERSHIP_READBACK_FAILED');
        console.log(JSON.stringify({linked:true,email,org_id:orgId,organization:orgName,role:'owner',membership_readback_verified:true,outreach_activated:false,budgets_changed:false}));
      }else{
        await db.query('ROLLBACK');console.log(JSON.stringify({prepared:true,email,org_id:orgId,organization:orgName,requested_role:'owner',current_role:before?.role||null,database_changed:false}));
      }
    }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
  }finally{if(pool)await pool.end();await deleteApp(app);}
}
if(require.main===module)main().catch(()=>{console.error('APPROVED_ENROLLMENT_UNCONFIRMED_CHECK_AUDIT_BEFORE_RETRY');process.exitCode=1;});
