-- Add only bounded US Yelp admission. Does not enqueue or start provider work.
BEGIN;
DO $migration$
DECLARE definition text;
 needle text := 'p->>''source'' NOT IN (''google_maps'',''yellow_pages'',''facebook_pages'')';
 marker text := '-- Every operation needing both locks';
BEGIN
 SELECT pg_get_functiondef('gathering_enqueue_v3(jsonb)'::regprocedure) INTO definition;
 IF strpos(definition,'''yelp''')=0 THEN
  IF strpos(definition,needle)=0 OR strpos(definition,marker)=0 THEN
   RAISE EXCEPTION 'Unexpected gathering admission definition';
  END IF;
  definition:=replace(definition,needle,'p->>''source'' NOT IN (''google_maps'',''yellow_pages'',''facebook_pages'',''yelp'')');
  definition:=replace(definition,marker,E'IF p->>''source''=''yelp'' AND (target>50 OR candidates>150 OR budget>0.5 OR p->>''country_code'' IS DISTINCT FROM ''US'') THEN RAISE EXCEPTION ''Yelp source scope exceeded''; END IF;\n '||marker);
  EXECUTE definition;
 END IF;
END $migration$;
COMMIT;
