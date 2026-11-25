'use strict';
// Read-only export of public business evidence for the three-lead research canary.
const fs=require('node:fs');
const {Client}=require(require.resolve('pg',{paths:['/usr/local/lib/node_modules/n8n']}));
(async()=>{const db=new Client({host:process.env.DB_POSTGRESDB_HOST,user:process.env.DB_POSTGRESDB_USER,password:process.env.DB_POSTGRESDB_PASSWORD,database:'lead_db'});await db.connect();try{
 const rows=(await db.query(`SELECT jsonb_build_object('lead',jsonb_build_object('id',c.id,'org_id',c.org_id,'company_name',c.company_name,'website',c.website,'category',c.category,'city',c.city),'basic',p.basic,'linkedin',li.evidence) AS task
 FROM enrichment_profiles p JOIN cleaned_leads c ON c.id=p.lead_id AND c.org_id=p.org_id
 LEFT JOIN enrichment_linkedin li ON li.org_id=c.org_id AND li.lead_id=c.id
 WHERE c.id=ANY($1) AND EXISTS(SELECT 1 FROM cleaning_links l WHERE l.cleaned_id=c.id AND l.org_id=c.org_id AND contact_eligible(c.org_id,c.id,l.staging_id)) ORDER BY c.id`,[[159,162,165]])).rows.map(r=>r.task);
 if(rows.length!==3)throw Error('Expected three eligible businesses');
 fs.writeFileSync('/tmp/enrichment-real-canary.json',JSON.stringify(rows),{mode:0o600});console.log(JSON.stringify({exported:rows.map(t=>({id:t.lead.id,name:t.lead.company_name}))}));
}finally{await db.end();}})().catch(()=>{console.error('Business evidence export failed');process.exitCode=1;});
