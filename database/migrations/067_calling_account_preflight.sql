-- Provider metadata checks only. Never sets account/campaign ready or allocates funds.
BEGIN;
CREATE TABLE calling_account_preflights(
 org_id integer NOT NULL REFERENCES calling_accounts(org_id),
 account_version integer NOT NULL CHECK(account_version>0),
 checked_at timestamptz NOT NULL DEFAULT now(),
 checks jsonb NOT NULL CHECK(jsonb_typeof(checks)='object'),
 provider_checks_passed boolean NOT NULL,
 template_hash text NOT NULL CHECK(template_hash ~ '^[a-f0-9]{64}$'),
 snapshot_hash text CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(org_id,account_version)
);
REVOKE ALL ON calling_account_preflights FROM PUBLIC;
COMMIT;
