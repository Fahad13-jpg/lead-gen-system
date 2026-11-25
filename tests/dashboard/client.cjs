'use strict';
// Execute the real browser client interceptors with an offline Axios double.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dashboard=path.resolve('dashboard');
const babel=require(require.resolve('@babel/core',{paths:[dashboard]}));
const plugin=require.resolve('@babel/plugin-transform-modules-commonjs',{paths:[dashboard]});
const source=babel.transformSync(fs.readFileSync(path.join(dashboard,'src/api/client.js'),'utf8'),{babelrc:false,configFile:false,plugins:[plugin]}).code;
function setup(){
  const hooks={},module={exports:{}};
  const instance={interceptors:{request:{use:fn=>{hooks.request=fn;}},response:{use:fn=>{hooks.response=fn;}}}};
  const axios={create:config=>{assert.equal(config.baseURL,'/dashboard-api');return instance;}};
  vm.runInNewContext(source,{module,exports:module.exports,require:name=>{assert.equal(name,'axios');return axios;}},{filename:'dashboard-client.js'});
  return {api:module.exports,hooks};
}
test('no organization context means no outbound request',async()=>{
  const {hooks}=setup();await assert.rejects(hooks.request({headers:{},method:'get'}),/ORGANIZATION_ACCESS_REQUIRED/);
});
test('caller cannot override selected org or authorization header',async()=>{
  const {api,hooks}=setup();api.configureAccess({org_id:7,getToken:async()=> 'fixture-token'});
  const request=await hooks.request({headers:{Authorization:'forged'},params:{org_id:99},data:{org_id:99},method:'post'});
  assert.equal(request.params,undefined);assert.equal(request.data.org_id,7);assert.equal(request.headers.Authorization,'Bearer fixture-token');
});
test('logout during token refresh cancels request',async()=>{
  const {api,hooks}=setup();let release;
  api.configureAccess({org_id:7,getToken:()=>new Promise(resolve=>{release=resolve;})});
  const pending=hooks.request({headers:{},method:'get'});api.configureAccess(null);release('fixture-token');
  await assert.rejects(pending,/ACCESS_CHANGED/);
});
test('switching org during token refresh cancels request',async()=>{
  const {api,hooks}=setup();let release;
  api.configureAccess({org_id:7,getToken:()=>new Promise(resolve=>{release=resolve;})});
  const pending=hooks.request({headers:{},method:'get'});
  api.configureAccess({org_id:8,getToken:async()=> 'other-fixture-token'});release('fixture-token');
  await assert.rejects(pending,/ACCESS_CHANGED/);
});
test('late data from previous organization is discarded',async()=>{
  const {api,hooks}=setup();api.configureAccess({org_id:7,getToken:async()=> 'fixture-token'});
  const request=await hooks.request({headers:{},method:'get'});
  api.configureAccess({org_id:8,getToken:async()=> 'other-fixture-token'});
  assert.throws(()=>hooks.response({config:request,data:{private:'old-organization'}}),/ACCESS_CHANGED/);
});
test('refresh failure cannot turn into an anonymous request',async()=>{
  const {api,hooks}=setup();api.configureAccess({org_id:7,getToken:async()=>{throw Error('expired-session');}});
  await assert.rejects(hooks.request({headers:{},method:'get'}),/expired-session/);
});
