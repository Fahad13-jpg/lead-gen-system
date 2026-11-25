BEGIN;
CREATE TABLE IF NOT EXISTS lead_import_batches (
 id bigserial PRIMARY KEY, org_id integer NOT NULL REFERENCES organizations(id),
 request_id text NOT NULL CHECK(request_id ~ '^csv_[a-f0-9]{32}$'), content_hash text NOT NULL,
 filename text NOT NULL, provided_stage text NOT NULL CHECK(provided_stage IN ('raw','cleaned','enriched')),
 created_by text NOT NULL, input_count integer NOT NULL, accepted_count integer NOT NULL,
 skipped_count integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,request_id), UNIQUE(org_id,id)
);
CREATE TABLE IF NOT EXISTS lead_import_rows (
 org_id integer NOT NULL, batch_id bigint NOT NULL, row_number integer NOT NULL,
 staging_id integer NOT NULL REFERENCES staging_leads(id),
 PRIMARY KEY(batch_id,row_number), UNIQUE(staging_id),
 FOREIGN KEY(org_id,batch_id) REFERENCES lead_import_batches(org_id,id)
);
CREATE INDEX IF NOT EXISTS lead_import_batches_org ON lead_import_batches(org_id,id DESC);
CREATE INDEX IF NOT EXISTS lead_import_rows_org ON lead_import_rows(org_id,batch_id,staging_id);
REVOKE ALL ON lead_import_batches,lead_import_rows FROM PUBLIC;
COMMIT;
