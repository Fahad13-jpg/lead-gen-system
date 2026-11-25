-- Enrollment identity comes from verified Firebase tokens, never an email/domain match.
BEGIN;
CREATE TABLE workspace_enrollments(
 subject text PRIMARY KEY CHECK(subject ~ '^[a-f0-9]{64}$'),
 org_id integer NOT NULL UNIQUE REFERENCES organizations(id),
 request_id uuid NOT NULL UNIQUE,
 requested_name text NOT NULL CHECK(length(requested_name) BETWEEN 2 AND 100),
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON workspace_enrollments FROM PUBLIC;
COMMIT;
