'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const{publicOrigin,databaseOptions,internalOrigin}=require('../../scripts/dashboard/runtime-config.cjs');
test('internal workflow destinations allow only fixed loopback or private service origins',()=>{
 assert.equal(internalOrigin('http://n8n:5678'),'http://n8n:5678');
 for(const value of ['http://evil.example:5678','http://n8n:5678/path','http://n8n:5678/','http://user:pass@n8n:5678','http://127.0.0.1:22'])assert.throws(()=>internalOrigin(value),/INTERNAL_ORIGIN_INVALID/);
});
test('production origin is explicit HTTPS with no path, credentials or wildcard',()=>{
 assert.equal(publicOrigin(undefined),null);assert.equal(publicOrigin('https://app.example.com'),'https://app.example.com');
 for(const value of ['http://app.example.com','https://app.example.com/','https://app.example.com/path','https://user:pass@app.example.com','https://*.example.com','https://localhost'])assert.throws(()=>publicOrigin(value),/ORIGIN_INVALID/);
});
test('database configuration is complete and reads the password from a secret file',()=>{
 assert.equal(databaseOptions({}),null);
 const base={DATABASE_HOST:'postgres',DATABASE_NAME:'lead_db',DATABASE_USER:'fixture',DATABASE_PASSWORD_FILE:'/run/secrets/db-password',DATABASE_TLS:'off'};
 const result=databaseOptions(base,file=>{assert.equal(file,base.DATABASE_PASSWORD_FILE);return'FAKE_PASSWORD\n';});assert.equal(result.password,'FAKE_PASSWORD');assert.equal(result.port,5432);assert.equal(result.ssl,false);
 for(const env of [{DATABASE_HOST:'postgres'},{...base,DATABASE_PORT:'5432;bad'},{...base,DATABASE_TLS:'verify-full'},{...base,DATABASE_TLS:'insecure'}])assert.throws(()=>databaseOptions(env,()=>assert.fail('must validate first')),/CONFIGURATION_REQUIRED/);
 const ssl=databaseOptions({...base,DATABASE_TLS:'verify-full',DATABASE_CA_FILE:'/ca'},file=>file==='/ca'?'FAKE_CA':'FAKE_PASSWORD').ssl;assert.equal(ssl.rejectUnauthorized,true);assert.equal(ssl.ca,'FAKE_CA');
});

test('only explicit local-container mode accepts the existing Compose database password',()=>{
 const env={DASHBOARD_RUNTIME:'local-container',DATABASE_HOST:'postgres',DATABASE_NAME:'lead_db',DATABASE_USER:'fixture',DATABASE_PASSWORD:'FAKE_LOCAL_VALUE',DATABASE_TLS:'off'};
 assert.equal(databaseOptions(env,()=>assert.fail('must not copy/read a password file')).password,'FAKE_LOCAL_VALUE');
 assert.throws(()=>databaseOptions({...env,DASHBOARD_RUNTIME:'container'}),/CONFIGURATION_REQUIRED/);
});
