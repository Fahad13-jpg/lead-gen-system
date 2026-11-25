-- Allow the restricted gateway role to lock a strategy plan during approval
-- without granting permission to change the saved plan.
BEGIN;

ALTER TABLE public.strategy_plans
 ADD COLUMN IF NOT EXISTS gateway_lock_guard boolean NOT NULL DEFAULT false;

DO $$ BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid='public.strategy_plans'::regclass
    AND conname='strategy_plans_gateway_lock_guard_immutable'
 ) THEN
  ALTER TABLE public.strategy_plans
   ADD CONSTRAINT strategy_plans_gateway_lock_guard_immutable
   CHECK (gateway_lock_guard IS FALSE);
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='lead_dashboard') THEN
  EXECUTE 'GRANT UPDATE (gateway_lock_guard) ON public.strategy_plans TO lead_dashboard';
 END IF;
END $$;

COMMENT ON COLUMN public.strategy_plans.gateway_lock_guard IS
 'Immutable placeholder allowing the restricted gateway role to lock a saved plan';

COMMIT;
