# Workflow conventions and approved exceptions

Updated 8 November 2026. Preserve org scope, leases, approval hashes, budget gates,
sticky notes and working node connections. These three exceptions were explicitly
approved by the user after the stage-one audit identified conflicts with earlier
conventions:

1. **Existing parameterized workflow SQL remains supported.** Do not rewrite tested
   queryReplacement bindings just for formatting. Existing raw executeQuery paths
   continue to escape every interpolated string with `.replace(/'/g,"''")`.
2. **Shared business phone numbers remain supported.** Do not restore blanket
   org+phone/org+website uniqueness that merges or rejects legitimate branches.
   Retain current source identity indexes and serialized identity matching/cleaning
   decisions. Any change to identity matching needs explicit review and branch tests.
3. **Never blindly retry paid Apify starts.** Preserve saved run identities and
   ambiguous-start reconciliation. The blanket HTTP retry convention is not an
   instruction to repeat a potentially accepted paid POST. Read-only requests can
   use bounded retry; mutating requests need their actual idempotency/pre-send rule.

Other conventions remain: Code nodes explicitly set mode; handle legitimate zero
rows deliberately; acknowledge long-running admissions before slow work; retain
safe tenant-bound error outcomes. Do not globally flip neverError/error routing
without testing the consumers. Exceptions do not authorize a tenant, budget or
approval bypass, a model call, provider spending, workflow activation or sending.
