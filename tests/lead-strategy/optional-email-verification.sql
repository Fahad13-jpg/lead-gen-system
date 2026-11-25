-- Runs inside the existing scratch harness transaction; fixture data rolls back.
SAVEPOINT optional_email_policy;
DO $test$
DECLARE x jsonb; base jsonb; proof jsonb; outcome jsonb; value jsonb; s text;
BEGIN
 UPDATE cleaned_leads SET email='scratch-basic@gmail.com',email_verification_status=NULL WHERE org_id=1 AND id=167;
 proof:='[{"email":"scratch-basic@gmail.com","method":"published_website","source_url":"https://fixture.example/contact"}]';
 INSERT INTO lead_contacts(org_id,lead_id,email,method,evidence,status,relevance_status,created_at)
 VALUES(1,167,'scratch-basic@gmail.com','published_website',proof,'pending','eligible',now())
 ON CONFLICT(org_id,lead_id,email) DO UPDATE SET evidence=excluded.evidence,status='pending',relevance_status='eligible',method='published_website',created_at=now(),verification=NULL;
 base:='{"org_id":1,"lead":{"id":167,"email":"scratch-basic@gmail.com"},"campaign":{"config":{"email_verification_policy":"basic"}},"report":{"trust":{"conflicts":[],"fields":{"emails":[]}}}}';
 outcome:=outreach_email_eligibility(base);
 ASSERT outcome->>'allowed'='true' AND outcome->>'classification'='basic_unverified' AND outcome->>'deliverability'='unknown','basic published contact denied';
 ASSERT outcome->>'dns_checked'='false','basic must not claim DNS verification';
 ASSERT outreach_email_eligibility(base#-'{campaign,config,email_verification_policy}')->>'reason'='email_not_freshly_verified','default weakened';
 ASSERT outreach_email_eligibility(jsonb_set(base,'{campaign,config,email_verification_policy}','"skip"'))->>'allowed'='false','unknown policy';
 ASSERT outreach_email_eligibility(jsonb_set(base,'{org_id}','999999'))->>'allowed'='false','tenant mismatch';
 ASSERT outreach_email_eligibility(jsonb_set(base,'{lead,email}','"other@gmail.com"'))->>'allowed'='false','recipient changed';
 x:=jsonb_set(base,'{report,trust,fields,emails}','[{"value":"scratch-basic@gmail.com","status":"provider_verified"}]');
 ASSERT outreach_email_eligibility(x#-'{campaign,config,email_verification_policy}')->>'classification'='provider_verified','strict verified path';
 FOREACH s IN ARRAY ARRAY['invalid','risky','review'] LOOP
  UPDATE lead_contacts SET status=s WHERE org_id=1 AND lead_id=167 AND email='scratch-basic@gmail.com';
  ASSERT outreach_email_eligibility(base)->>'allowed'='false','bad status basic bypass';
  ASSERT outreach_email_eligibility(x)->>'allowed'='false','bad status verified bypass';
 END LOOP;
 UPDATE lead_contacts SET status='pending',relevance_status='excluded' WHERE org_id=1 AND lead_id=167 AND email='scratch-basic@gmail.com';
 ASSERT outreach_email_eligibility(base)->>'allowed'='false','excluded relevance';
 UPDATE lead_contacts SET relevance_status='eligible',created_at=now()-interval '31 days' WHERE org_id=1 AND lead_id=167 AND email='scratch-basic@gmail.com';
 ASSERT outreach_email_eligibility(base)->>'allowed'='false','old source record';
 UPDATE lead_contacts SET created_at=now() WHERE org_id=1 AND lead_id=167 AND email='scratch-basic@gmail.com';
 FOR value IN SELECT v FROM (VALUES ('null'::jsonb),('"bad"'::jsonb),('{}'::jsonb),('[]'::jsonb)) malformed(v) LOOP
  UPDATE lead_contacts SET evidence=value WHERE org_id=1 AND lead_id=167 AND email='scratch-basic@gmail.com';
  ASSERT outreach_email_eligibility(base)->>'allowed'='false','malformed source evidence';
  ASSERT outreach_email_eligibility(jsonb_set(base,'{report,trust,conflicts}',value))->>'allowed'='false','malformed or missing evidence';
 END LOOP;
 UPDATE lead_contacts SET evidence=proof WHERE org_id=1 AND lead_id=167 AND email='scratch-basic@gmail.com';
 ASSERT outreach_email_eligibility(jsonb_set(base,'{report,trust,conflicts}','["identity_conflict"]'))->>'allowed'='false','business conflict';
 UPDATE lead_contacts SET verification='{"mx":false}' WHERE org_id=1 AND lead_id=167 AND email='scratch-basic@gmail.com';
 ASSERT outreach_email_eligibility(base)->>'allowed'='false','known bad MX';
 UPDATE lead_contacts SET verification=NULL WHERE org_id=1 AND lead_id=167 AND email='scratch-basic@gmail.com';
 FOREACH s IN ARRAY ARRAY['bad..dots@gmail.com','bad@gmail','noreply@gmail.com','bad@example.org','bad@-domain.com','bad@domain-.com','bad' || chr(10) || '@gmail.com'] LOOP
  UPDATE cleaned_leads SET email=s WHERE org_id=1 AND id=167;
  ASSERT outreach_email_eligibility(jsonb_set(base,'{lead,email}',to_jsonb(s)))->>'allowed'='false','bad format or non-contact address';
 END LOOP;
 ASSERT outreach_email_eligibility('null')->>'allowed'='false','null input';
 ASSERT outreach_email_eligibility('{"org_id":"oops"}')->>'allowed'='false','malformed ID';
END $test$;
ROLLBACK TO SAVEPOINT optional_email_policy;
