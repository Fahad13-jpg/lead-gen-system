-- Customer-owned Retell onboarding only. No dispatch, wallet or campaign authority.
BEGIN;
CREATE TABLE calling_accounts(
 org_id integer PRIMARY KEY REFERENCES organizations(id),
 request_id uuid NOT NULL UNIQUE,
 key_fingerprint text NOT NULL UNIQUE CHECK(key_fingerprint ~ '^[a-f0-9]{64}$'),
 agent_id text NOT NULL UNIQUE CHECK(agent_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 agent_version integer NOT NULL CHECK(agent_version>=0),
 from_number text UNIQUE CHECK(from_number ~ '^\+1[0-9]{10}$'),
 secrets jsonb NOT NULL CHECK(jsonb_typeof(secrets)='object'),
 state text NOT NULL DEFAULT 'pending_setup' CHECK(state='pending_setup'),
 checked_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON calling_accounts FROM PUBLIC;
COMMIT;
