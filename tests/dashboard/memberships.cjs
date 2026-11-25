'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{membershipLoader}=require('../../scripts/dashboard/memberships.cjs');
test('membership query is read-only and scoped to exact verified subject',async()=>{
  let sql;const load=membershipLoader({query:async q=>{sql=q;return{rows:[{memberships:[]}]};}});
  assert.deepEqual(await load('a'.repeat(64)),[]);assert.match(sql,/SELECT coalesce/);assert.match(sql,/o\.org_name/);
  assert.ok(sql.includes("m.subject='"+'a'.repeat(64)+"'"));assert.ok(!/INSERT|UPDATE|DELETE|CREATE|ALTER|GRANT/.test(sql));
});
test('malformed subject never reaches the database',async()=>{
  let called=false;const load=membershipLoader({query:async()=>{called=true;}});
  await assert.rejects(load("x' OR true --"),/INVALID_SUBJECT/);assert.equal(called,false);
});
