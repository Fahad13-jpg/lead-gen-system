'use strict';
// .js is required: react-scripts treats .cjs source imports as static assets.
// Browser contract validation, never a substitute for server token verification.
function sessionFromResponse(payload, email) {
  if (!payload || payload.identity_verified !== true || payload.email_verified !== true ||
      !/^[a-f0-9]{64}$/.test(payload.subject || '') || !Array.isArray(payload.organizations)) throw Error('INVALID_SESSION');
  const seen = new Set();
  const organizations = payload.organizations.map(org => {
    if (!org || !Number.isSafeInteger(org.org_id) || org.org_id < 1 || org.active !== true ||
      !['owner', 'admin', 'member'].includes(org.role) || typeof org.name !== 'string' ||
      !org.name.trim() || org.name.length > 200 || seen.has(org.org_id)) throw Error('INVALID_MEMBERSHIP');
    seen.add(org.org_id);
    return { org_id: org.org_id, name: org.name, role: org.role, active: true, ...(org.package&&['free','plus'].includes(org.package.name)&&Number.isSafeInteger(org.package.revision)?{package:{name:org.package.name,revision:org.package.revision,features:{...org.package.features}}}:{}) };
  });
  return { subject: payload.subject, email, organizations };
}
function selectOrganization(session, orgId) {
  const org = session?.organizations.find(o => o.org_id === orgId);
  if (!org) throw Error('MEMBERSHIP_REQUIRED');
  return org;
}
module.exports = { sessionFromResponse, selectOrganization };
