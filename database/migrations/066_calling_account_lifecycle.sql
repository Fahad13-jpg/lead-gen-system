-- Paused campaign binding and versioned credential lifecycle. No transport enablement.
BEGIN;
ALTER TABLE calling_accounts ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE calling_accounts DROP CONSTRAINT calling_accounts_state_check;
ALTER TABLE calling_accounts ALTER COLUMN key_fingerprint DROP NOT NULL;
ALTER TABLE calling_accounts ALTER COLUMN secrets DROP NOT NULL;
ALTER TABLE calling_accounts ADD CONSTRAINT calling_accounts_state_check CHECK(state IN('pending_setup','disconnected'));
ALTER TABLE calling_accounts ADD CONSTRAINT calling_accounts_secret_state_check CHECK(
 (state='pending_setup' AND key_fingerprint IS NOT NULL AND secrets IS NOT NULL)
 OR (state='disconnected' AND key_fingerprint IS NULL AND secrets IS NULL));
CREATE TABLE calling_account_changes(
 org_id integer NOT NULL REFERENCES organizations(id),
 request_id uuid NOT NULL,
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,request_id)
);
REVOKE ALL ON calling_account_changes FROM PUBLIC;
COMMIT;
