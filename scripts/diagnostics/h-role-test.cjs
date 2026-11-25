'use strict';
const fs=require('fs'),cp=require('child_process'),{sql,dir}=require('./h-permissions.cjs');
const container=process.env.LEAD_SQL_CONTAINER||'lead_diag_pg_20261011',db=process.env.LEAD_SQL_DATABASE||'scratch_h_permissions_20261012',owner=process.env.LEAD_SQL_OWNER||'h_owner_20261012',reader=process.env.LEAD_SQL_READER||'h_runtime_20261012';
for(const [value,prefix,key]of [[container,'lead_016_',process.env.LEAD_SQL_CONTAINER],[db,'scratch_016_',process.env.LEAD_SQL_DATABASE],[owner,'s016_owner_',process.env.LEAD_SQL_OWNER],[reader,'s016_runtime_',process.env.LEAD_SQL_READER]])if(key&&(!value.startsWith(prefix)||!/^[a-z0-9_]+$/.test(value)))throw Error('SCRATCH_IDENTITY_REQUIRED');
function run(query){return sql(container,db,query)}
if(process.argv[2]==='setup'){
 sql(container,'scratch_lead_diag_20261011',`CREATE ROLE ${owner} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT; CREATE ROLE ${reader} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT; CREATE DATABASE ${db};`);
 const dump=fs.readFileSync('.local/scratch-diagnostics-20261011/lead_db-latest.dump');const r=cp.spawnSync('docker',['exec','-i',container,'pg_restore','-U','n8n_user','-d',db,'--no-owner','--exit-on-error'],{input:dump,maxBuffer:10e6});if(r.status!==0)throw Error('Scratch restore failed; output withheld');
}
if(['setup','owners'].includes(process.argv[2])){
 run(`ALTER DATABASE ${db} OWNER TO ${owner}; ALTER SCHEMA public OWNER TO ${owner};
 DO $x$ DECLARE r record; BEGIN
 FOR r IN SELECT c.oid::regclass AS name,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S') ORDER BY CASE WHEN c.relkind='S' THEN 1 ELSE 0 END LOOP
 EXECUTE format('ALTER %s %s OWNER TO ${owner}',CASE r.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END,r.name); END LOOP;
 FOR r IN SELECT p.oid::regprocedure AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.classid='pg_proc'::regclass AND d.deptype='e') LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO ${owner}',r.name); END LOOP; END $x$;
 GRANT USAGE ON SCHEMA public TO ${reader}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${reader}; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${reader}; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${reader};`);
 console.log('Created isolated restored database and non-superuser owner/runtime roles; production untouched.');
}
if(process.argv[2]==='apply'){
 const applied=run(`SET ROLE ${owner};`+fs.readFileSync('database/migrations/016_signal_sheet.sql','utf8'));
 const denied=run(`SET ROLE ${reader}; DO $test$ BEGIN
 BEGIN PERFORM enrichment_source_checks(1,167); RAISE EXCEPTION 'expected initial execute denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END $test$; SELECT 'PASS expected execute denial for new functions';`);
 const grants=run(`SET ROLE ${owner}; GRANT EXECUTE ON FUNCTION enrichment_stamp_source(text,jsonb,text),enrichment_source_checks(integer,integer) TO ${reader};`);
 fs.writeFileSync(dir+'/role-apply.txt',applied+'\n'+denied+'\n'+grants+'\n');console.log('016 applied as non-superuser owner; runtime execute failure reproduced and fixed with explicit grants.');
}
module.exports={run,owner,reader,db};
