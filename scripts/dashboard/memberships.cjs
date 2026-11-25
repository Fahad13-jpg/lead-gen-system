'use strict';
// Column names confirmed read-only against lead_db on 2026-11-07.
function membershipLoader(pool) {
  return async subject => {
    if (!/^[a-f0-9]{64}$/.test(subject || '')) throw Error('INVALID_SUBJECT');
    const escaped = subject.replace(/'/g, "''");
    const result = await pool.query(`SELECT coalesce(jsonb_agg(jsonb_build_object(
      'org_id',m.org_id,'subject',m.subject,'role',m.role,'active',m.active,
      'name',o.org_name,'package',organization_package_snapshot(o.id),'organization_active',o.status='active')),'[]'::jsonb) AS memberships
      FROM org_sender_memberships m JOIN organizations o ON o.id=m.org_id
      WHERE m.subject='${escaped}' AND m.active AND o.status='active'`);
    if (!Array.isArray(result.rows?.[0]?.memberships)) throw Error('MEMBERSHIPS_UNAVAILABLE');
    return result.rows[0].memberships;
  };
}
module.exports={membershipLoader};
