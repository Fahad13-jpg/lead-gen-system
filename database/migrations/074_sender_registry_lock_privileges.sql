-- Keep sender registry row locks available to the restricted gateway role
-- without granting it the ability to edit organization or membership fields.
BEGIN;

ALTER TABLE public.organizations
 ADD COLUMN IF NOT EXISTS gateway_lock_guard boolean NOT NULL DEFAULT false;
ALTER TABLE public.org_sender_memberships
 ADD COLUMN IF NOT EXISTS gateway_lock_guard boolean NOT NULL DEFAULT false;

DO $$ BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid='public.organizations'::regclass
    AND conname='organizations_gateway_lock_guard_immutable'
 ) THEN
  ALTER TABLE public.organizations
   ADD CONSTRAINT organizations_gateway_lock_guard_immutable
   CHECK (gateway_lock_guard IS FALSE);
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid='public.org_sender_memberships'::regclass
    AND conname='org_sender_memberships_gateway_lock_guard_immutable'
 ) THEN
  ALTER TABLE public.org_sender_memberships
   ADD CONSTRAINT org_sender_memberships_gateway_lock_guard_immutable
   CHECK (gateway_lock_guard IS FALSE);
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='lead_dashboard') THEN
  EXECUTE 'GRANT UPDATE (gateway_lock_guard) ON public.organizations TO lead_dashboard';
  EXECUTE 'GRANT UPDATE (gateway_lock_guard) ON public.org_sender_memberships TO lead_dashboard';
 END IF;
END $$;

COMMENT ON COLUMN public.organizations.gateway_lock_guard IS
 'Immutable placeholder allowing the restricted gateway role to take row locks';
COMMENT ON COLUMN public.org_sender_memberships.gateway_lock_guard IS
 'Immutable placeholder allowing the restricted gateway role to take row locks';

COMMIT;
