-- Function source for migration 016; no table writes. Stored-payload observations only.
CREATE OR REPLACE FUNCTION enrichment_stamp_source(p_source text,p_raw jsonb,p_website text)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE src text:=CASE WHEN p_source='google_maps' THEN 'maps_listing' ELSE p_source END;
 url text; observed text:=p_raw->>'scrapedAt';valid_time boolean:=false; valid_url boolean:=false;
 maps boolean:=false; yellow boolean:=false; website text;social boolean:=false;
 result text:='unknown';reason text:='insufficient_detail_or_unverified_source';
BEGIN
 url:=CASE WHEN src='maps_listing' THEN p_raw->>'url' WHEN src='yellow_pages' THEN coalesce(nullif(p_raw->>'profileUrl',''),p_raw->>'sourceUrl') END;
 BEGIN valid_time:=observed IS NOT NULL AND observed::timestamptz IS NOT NULL; EXCEPTION WHEN others THEN valid_time:=false; END;
 valid_url:=coalesce(CASE WHEN src='maps_listing' THEN url ~* '^https?://([a-z0-9-]+\.)*google\.[a-z.]+(/|$)' WHEN src='yellow_pages' THEN url ~* '^https?://([a-z0-9-]+\.)*yellowpages\.com(/|$)' ELSE false END,false);
 website:=CASE WHEN jsonb_typeof(p_raw->'website')='string' THEN trim(p_raw->>'website') END;
 maps:=coalesce(src='maps_listing' AND valid_url AND valid_time AND jsonb_typeof(p_raw->'placeId')='string' AND length(p_raw->>'placeId')>0
 AND jsonb_typeof(p_raw->'title')='string' AND length(p_raw->>'title')>0 AND jsonb_typeof(p_raw->'address')='string' AND length(p_raw->>'address')>0
 AND jsonb_typeof(p_raw->'categoryName')='string' AND CASE WHEN jsonb_typeof(p_raw->'openingHours')='array' THEN jsonb_array_length(p_raw->'openingHours')>0 ELSE false END
 AND jsonb_typeof(p_raw->'reviewsCount')='number' AND (p_raw->>'reviewsCount') ~ '^\d+$'
 AND jsonb_typeof(p_raw->'permanentlyClosed')='boolean' AND jsonb_typeof(p_raw->'temporarilyClosed')='boolean',false);
 yellow:=coalesce(src='yellow_pages' AND valid_url AND valid_time AND jsonb_typeof(p_raw->'name')='string' AND length(p_raw->>'name')>0
 AND nullif(p_raw->'yellowPagesId','null'::jsonb) IS NOT NULL AND nullif(p_raw->'address','null'::jsonb) IS NOT NULL AND nullif(p_raw->'hours','null'::jsonb) IS NOT NULL
 AND p_raw ? 'description' AND jsonb_typeof(p_raw->'paymentMethods')='array',false);
 social:=coalesce(website ~* '^https?://([a-z0-9-]+\.)*(facebook|instagram)\.com(/|$)',false);
 IF src<>'yelp' AND valid_url AND valid_time AND website ~* '^https?://[^ /]+(/|$)' THEN result:=CASE WHEN social THEN 'social_only' ELSE 'present' END;reason:=CASE WHEN social THEN 'social_profile_in_website_field' ELSE 'explicit_website' END;
 ELSIF maps AND (NOT p_raw ? 'website' OR p_raw->'website'='null'::jsonb OR website='') AND coalesce(p_website,'')='' THEN result:='none_found';reason:='maps_detail_record_no_website_listed';
 ELSIF yellow AND coalesce(website,'')='' THEN reason:='yellow_pages_absence_semantics_UNVERIFIED';END IF;
 RETURN jsonb_build_object('stamp_version','source_website_check_v1','source',src,'status',CASE WHEN url IS NOT NULL AND valid_time THEN 'checked' ELSE 'unknown' END,
 'source_url',url,'observed_at',observed,'website_result',result,'reason',reason,'detail_level',maps OR yellow,
 'website_field',CASE WHEN NOT p_raw ? 'website' THEN 'missing' WHEN p_raw->'website'='null'::jsonb THEN 'null' WHEN website='' THEN 'empty' ELSE 'present' END,
 'social_profiles',CASE WHEN social THEN jsonb_build_array(website) ELSE '[]'::jsonb END,
 'rating',coalesce(nullif(p_raw->'totalScore','null'::jsonb),p_raw->'rating','null'::jsonb),'reviews',coalesce(nullif(p_raw->'reviewsCount','null'::jsonb),p_raw->'reviewCount','null'::jsonb),
 'limitations',jsonb_build_array('Stored source record only; live listing and provider omission semantics remain UNVERIFIED.','none_found means no website listed in the checked record, not no website anywhere.'));
END $$;
REVOKE ALL ON FUNCTION enrichment_stamp_source(text,jsonb,text) FROM PUBLIC;
