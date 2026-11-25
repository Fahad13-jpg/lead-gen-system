'use strict';
// Private service contract; no listening socket, route, new table or database writes.
const crypto = require('node:crypto');
function identityService({ projectId, verifyIdToken, loadMemberships, now = () => Math.floor(Date.now() / 1000) }) {
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId || '') || typeof verifyIdToken !== 'function' || typeof loadMemberships !== 'function') throw Error('IDENTITY_NOT_CONFIGURED');
  async function session(token) {
    if (typeof token !== 'string' || !token || token.length > 16384 || /\s/.test(token)) throw Error('AUTHENTICATION_REQUIRED');
    // Production adapter must call Firebase Admin verifyIdToken(token, true), including revocation checking.
    let claims;
    try { claims = await verifyIdToken(token, true); } catch { throw Error('AUTHENTICATION_FAILED'); }
    const clock = now(), issuer = `https://securetoken.google.com/${projectId}`;
    if (!claims || claims.iss !== issuer || claims.aud !== projectId || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128 ||
        /[\p{Cc}\p{Cf}]/u.test(claims.sub) || claims.uid !== claims.sub || claims.email_verified !== true ||
        !Number.isInteger(claims.exp) || claims.exp <= clock || !Number.isInteger(claims.iat) || claims.iat > clock ||
        claims.exp <= claims.iat || claims.exp - claims.iat > 3600 || !Number.isInteger(claims.auth_time) || claims.auth_time > clock) throw Error('AUTHENTICATION_FAILED');
    const subject = crypto.createHash('sha256').update(issuer + '\0' + claims.sub).digest('hex');
    // Matches existing org_sender_memberships subjects. No auto-join by email or domain.
    const rows = await loadMemberships(subject);
    if (!Array.isArray(rows)) throw Error('MEMBERSHIPS_UNAVAILABLE');
    const seen = new Set(), organizations = [];
    for (const row of rows) {
      if (!row || row.active !== true || row.organization_active !== true) continue;
      if (!Number.isSafeInteger(row.org_id) || row.org_id < 1 || !['owner', 'admin', 'member'].includes(row.role) ||
          typeof row.name !== 'string' || !row.name.trim() || row.name.length > 200 || seen.has(row.org_id) || row.subject !== subject) throw Error('INVALID_MEMBERSHIP');
      seen.add(row.org_id);
      organizations.push({ org_id: row.org_id, name: row.name, role: row.role, active: true, ...(row.package?{package:require('./package-access.cjs').snapshot(row.package)}:{}) });
    }
    return { identity_verified: true, email_verified: true, subject, organizations };
  }
  return { session, async principal(token, orgId) {
    if (!Number.isSafeInteger(orgId) || orgId < 1) throw Error('INVALID_ORG');
    const result = await session(token), org = result.organizations.find(o => o.org_id === orgId);
    if (!org) throw Error('MEMBERSHIP_REQUIRED');
    return { ...org, subject: result.subject };
  } };
}
module.exports = { identityService };
