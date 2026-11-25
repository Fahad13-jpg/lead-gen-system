-- Add hash-bound Facebook source observations only to Messenger campaigns.
-- Existing campaign contexts and fingerprints remain unchanged.
BEGIN;
DO $$
DECLARE d text;
BEGIN
 IF to_regprocedure('strategy_context_pre062(integer,bigint,integer)') IS NOT NULL THEN RAISE EXCEPTION 'Migration 062 already installed'; END IF;
 d:=pg_get_functiondef('strategy_context(integer,bigint,integer)'::regprocedure);
 EXECUTE replace(d,'FUNCTION public.strategy_context(','FUNCTION public.strategy_context_pre062(');
END $$;
REVOKE ALL ON FUNCTION strategy_context_pre062(integer,bigint,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION strategy_context_pre062(integer,bigint,integer) TO n8n_user;
CREATE OR REPLACE FUNCTION strategy_context(p_org integer,p_campaign bigint,p_lead integer) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE result jsonb;pages jsonb;
BEGIN
 result:=strategy_context_pre062(p_org,p_campaign,p_lead);
 IF result IS NULL OR NOT coalesce(result#>'{campaign,config,channels}' ? 'messenger',false) THEN RETURN result;END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) INTO pages FROM (
  SELECT s.raw_data->>'facebook_page_url' AS page_url,s.raw_data->>'observed_at' AS observed_at
  FROM cleaning_links l JOIN staging_leads s ON s.org_id=l.org_id AND s.id=l.staging_id
  WHERE l.org_id=p_org AND l.cleaned_id=p_lead AND s.source='facebook_pages'
  ORDER BY s.id DESC LIMIT 10
 )p;
 result:=(result-'fingerprint')||jsonb_build_object('facebook_pages',pages);
 RETURN result||jsonb_build_object('fingerprint',md5(result::text));
END $$;
COMMIT;
