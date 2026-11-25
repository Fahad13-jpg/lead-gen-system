'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { identityService } = require('../../scripts/dashboard/identity.cjs');
const { sessionFromResponse, selectOrganization } = require('../../dashboard/src/auth/session.js');
const projectId = 'lead-dashboard-test', clock = 2000000000;
const issuer = `https://securetoken.google.com/${projectId}`;
const subject = crypto.createHash('sha256').update(issuer + '\0fixture-person').digest('hex');
const claims = { iss: issuer, aud: projectId, sub: 'fixture-person', uid: 'fixture-person', email_verified: true, iat: clock - 60, exp: clock + 3540, auth_time: clock - 100 };
const member = { org_id: 7, name: 'Fixture organization', role: 'owner', active: true, organization_active: true, subject };
function setup(overrides = {}, rows = [member], verify) {
  return identityService({ projectId, now: () => clock, verifyIdToken: verify || (async (token, revoked) => { assert.equal(token, 'fixture-token'); assert.equal(revoked, true); return { ...claims, ...overrides }; }), loadMemberships: async value => { assert.equal(value, subject); return rows; } });
}
test('verified identity reuses hashed subjects and server memberships', async () => {
  const result = await setup().session('fixture-token');
  assert.equal(result.subject, subject); assert.equal(result.organizations.length, 1);
  assert.equal(result.organizations[0].org_id, 7); assert.equal(result.uid, undefined);
  assert.equal(selectOrganization(sessionFromResponse(result, 'fixture@example.test'), 7).role, 'owner');
});
for (const [name, value] of Object.entries({ expired: {exp:clock}, issuer: {iss:'https://evil.test'}, audience: {aud:'other-project'}, unverified: {email_verified:false}, future: {iat:clock+1}, identity: {uid:'other'}, lifetime: {exp:clock+4000}, auth_time: {auth_time:clock+1} })) {
  test(`rejects ${name} identity`, async () => assert.rejects(setup(value).session('fixture-token'), /AUTHENTICATION_FAILED/));
}
test('revoked or invalid token never loads membership', async () => {
  let loaded = false;
  const service = identityService({projectId, verifyIdToken:async () => { throw Error('provider-detail'); }, loadMemberships:async () => { loaded=true; }});
  await assert.rejects(service.session('fixture-token'), /^Error: AUTHENTICATION_FAILED$/); assert.equal(loaded,false);
});
test('no automatic organization or access to a different organization', async () => {
  assert.deepEqual((await setup({},[]).session('fixture-token')).organizations, []);
  await assert.rejects(setup().principal('fixture-token',1), /MEMBERSHIP_REQUIRED/);
  await assert.rejects(setup().principal('fixture-token','7'), /INVALID_ORG/);
});
test('membership revocation is checked on every operation', async () => {
  let rows=[member]; const service=identityService({projectId, now:()=>clock, verifyIdToken:async()=>claims, loadMemberships:async()=>rows});
  await service.principal('fixture-token',7); rows=[];
  await assert.rejects(service.principal('fixture-token',7), /MEMBERSHIP_REQUIRED/);
});
test('inactive membership and organization are excluded', async () => {
  for (const row of [{...member,active:false},{...member,organization_active:false}]) assert.equal((await setup({},[row]).session('fixture-token')).organizations.length,0);
});
test('mismatched subjects and duplicated memberships fail closed', async () => {
  await assert.rejects(setup({},[{...member,subject:'f'.repeat(64)}]).session('fixture-token'), /INVALID_MEMBERSHIP/);
  await assert.rejects(setup({},[member,member]).session('fixture-token'), /INVALID_MEMBERSHIP/);
});
test('browser rejects legacy, missing verification and fabricated org selection', () => {
  assert.throws(()=>sessionFromResponse({id:1,email:'demo@example.test'}), /INVALID_SESSION/);
  const valid={identity_verified:true,email_verified:true,subject,organizations:[member]};
  assert.throws(()=>sessionFromResponse({...valid,identity_verified:false}), /INVALID_SESSION/);
  assert.throws(()=>sessionFromResponse({...valid,organizations:[{...member,active:false}]}), /INVALID_MEMBERSHIP/);
  assert.throws(()=>selectOrganization(sessionFromResponse(valid),1), /MEMBERSHIP_REQUIRED/);
});
