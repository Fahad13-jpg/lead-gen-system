SAVEPOINT legacy_email_evidence;
DO $test$
DECLARE ident integer; x jsonb; e lead_contacts%ROWTYPE; evidence_before jsonb;
BEGIN
 FOR ident IN SELECT unnest(ARRAY[165,170,171,172]) LOOP
  SELECT * INTO e FROM lead_contacts WHERE org_id=1 AND lead_id=ident AND method='existing_record';
  ASSERT FOUND,'missing legacy benchmark fixture';
  x:=jsonb_build_object('org_id',1,'lead',jsonb_build_object('id',ident,'email',e.email),'campaign',jsonb_build_object('config',jsonb_build_object('email_verification_policy','basic')),'report',jsonb_build_object('trust',lead_trust_report(1,ident)));
  ASSERT outreach_email_eligibility(x)->>'classification'='basic_unverified','legacy evidence rejected';
  ASSERT outreach_email_eligibility(x#-'{campaign,config,email_verification_policy}')->>'allowed'='false','strict verification bypassed';
  evidence_before:=e.evidence;
  UPDATE lead_contacts SET evidence='[]' WHERE id=e.id;
  ASSERT outreach_email_eligibility(x)->>'reason'='email_published_evidence_required','label alone accepted';
  UPDATE lead_contacts SET evidence=jsonb_build_array(jsonb_build_object('email',e.email,'method','source_record','source_field','cleaned.email','staging_id',-1)) WHERE id=e.id;
  ASSERT outreach_email_eligibility(x)->>'allowed'='false','missing link accepted';
  UPDATE lead_contacts SET evidence=jsonb_build_array(jsonb_build_object('email',e.email,'method','source_record','source_field','cleaned.email','staging_id',CASE WHEN ident=165 THEN 120 ELSE 110 END)) WHERE id=e.id;
  ASSERT outreach_email_eligibility(x)->>'allowed'='false','other lead source accepted';
  UPDATE lead_contacts SET evidence=evidence_before,status='review' WHERE id=e.id;
  ASSERT outreach_email_eligibility(x)->>'allowed'='false','review bypassed';
  UPDATE lead_contacts SET status=e.status WHERE id=e.id;
 END LOOP;
 ASSERT outreach_email_eligibility('{"org_id":1,"lead":{"id":167,"email":null}}')->>'reason'='email_missing','missing email mislabelled';
END $test$;
ROLLBACK TO SAVEPOINT legacy_email_evidence;
