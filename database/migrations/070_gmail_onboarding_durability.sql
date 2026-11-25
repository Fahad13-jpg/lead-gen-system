-- OAuth state is encrypted outside PostgreSQL. Claimed operations never expire
-- into retryable operations. This migration does not authorize sending.
BEGIN;
CREATE TABLE gmail_oauth_sessions (
 state_hash text PRIMARY KEY CHECK(state_hash ~ '^[a-f0-9]{64}$'),
 org_id integer NOT NULL REFERENCES organizations(id),
 subject text NOT NULL CHECK(subject ~ '^[a-f0-9]{64}$'),
 client_id text NOT NULL,
 redirect_uri text NOT NULL,
 reconnect_id text,
 phase text NOT NULL CHECK(phase IN('issued','callback','denied','claimed','completed','retired')),
 payload jsonb,
 receipt jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',
 CHECK(payload IS NULL OR jsonb_typeof(payload)='object'),
 CHECK(receipt IS NULL OR jsonb_typeof(receipt)='object')
);
CREATE UNIQUE INDEX gmail_oauth_active_reconnect ON gmail_oauth_sessions(org_id,reconnect_id)
 WHERE reconnect_id IS NOT NULL AND phase IN('issued','callback','claimed');
CREATE TABLE gmail_enrollment_journal (
 credential_ref varchar(36) PRIMARY KEY,
 org_id integer NOT NULL REFERENCES organizations(id),
 owner_subject text NOT NULL CHECK(owner_subject ~ '^[a-f0-9]{64}$'),
 connection_id text NOT NULL,
 email text NOT NULL,
 oauth_state_hash text UNIQUE CHECK(oauth_state_hash IS NULL OR oauth_state_hash ~ '^[a-f0-9]{64}$'),
 phase text NOT NULL CHECK(phase IN('provisioned','registered','checked','quarantined')),
 version integer,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',
 UNIQUE(org_id,connection_id)
);
REVOKE ALL ON gmail_oauth_sessions,gmail_enrollment_journal FROM PUBLIC;
COMMIT;
