-- One customer device/SIM per organization. No device or sending is enabled by installation.
BEGIN;
CREATE TABLE sms_connections(
 org_id integer PRIMARY KEY REFERENCES organizations(id),version integer NOT NULL DEFAULT 1,
 device_id text NOT NULL UNIQUE CHECK(length(device_id) BETWEEN 1 AND 120),
 sender_phone text NOT NULL UNIQUE CHECK(sender_phone ~ '^\+[1-9][0-9]{7,14}$'),sim_number integer NOT NULL CHECK(sim_number BETWEEN 1 AND 2),
 secrets jsonb NOT NULL CHECK(jsonb_typeof(secrets)='object'),
 state text NOT NULL DEFAULT 'paused' CHECK(state IN('paused','ready','needs_review')),
 daily_limit integer NOT NULL DEFAULT 20 CHECK(daily_limit BETWEEN 1 AND 100),
 daily_segment_limit integer NOT NULL DEFAULT 40 CHECK(daily_segment_limit BETWEEN 1 AND 200),
 slot jsonb NOT NULL,callback_id text NOT NULL UNIQUE,checked_at timestamptz,heartbeat_at timestamptz,
 callback_verified_at timestamptz,last_attempt_at timestamptz,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE sms_dispatches(
 id bigserial PRIMARY KEY,org_id integer NOT NULL REFERENCES sms_connections(org_id),plan_id bigint NOT NULL,
 lead_id integer NOT NULL,connection_version integer NOT NULL,content_hash text NOT NULL,
 recipient text NOT NULL CHECK(recipient ~ '^\+[1-9][0-9]{7,14}$'),message text NOT NULL CHECK(length(message) BETWEEN 1 AND 306),segments integer NOT NULL CHECK(segments BETWEEN 1 AND 2),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','reserved','submitting','accepted','sent','delivered','failed','cancelled','uncertain','replied','opt_out')),
 activity_id integer UNIQUE REFERENCES outreach_activities(id),client_id text NOT NULL UNIQUE,
 release_subject text NOT NULL,consent_ref text NOT NULL,consent_expires_at timestamptz NOT NULL,
 released_at timestamptz NOT NULL DEFAULT now(),attempted_at timestamptz,lease_until timestamptz,
 valid_until timestamptz,provider_state text,delivery_updates integer NOT NULL DEFAULT 0,
 reconcile_attempts integer NOT NULL DEFAULT 0,next_reconcile_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(org_id,plan_id) REFERENCES strategy_plans(org_id,id),UNIQUE(org_id,plan_id));
CREATE UNIQUE INDEX sms_one_live_recipient ON sms_dispatches(org_id,recipient)
 WHERE state<>'cancelled';
CREATE INDEX sms_work_queue ON sms_dispatches(state,released_at);
CREATE TABLE sms_stops(org_id integer NOT NULL REFERENCES organizations(id),recipient text NOT NULL,kind text NOT NULL CHECK(kind IN('reply','opt_out')),recorded_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(org_id,recipient));
CREATE TABLE sms_events(org_id integer NOT NULL REFERENCES organizations(id),event_id text NOT NULL,kind text NOT NULL,dispatch_id bigint REFERENCES sms_dispatches(id),reply_text text CHECK(length(reply_text)<=2000),recorded_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(org_id,event_id));
REVOKE ALL ON sms_connections,sms_dispatches,sms_stops,sms_events FROM PUBLIC;
COMMIT;
