'use strict';

const issueText = {
  no_usable_contact: 'No email, phone or website was found. This business stays out of your leads.',
  business_name_missing: 'The business name is missing. This business stays out of your leads.',
  country_unknown: 'The country could not be confirmed. This business stays out of your leads.',
  contact_discovery_needed: 'Contact details still need checking. This business stays out of your leads.',
  website_format_invalid: 'The website address could not be read. This business stays out of your leads.',
  historical_org_mismatch: 'This older record belongs to a different workspace. This business stays out of your leads.'
};
const assessmentText = {
  website_check_failed: 'The website could not be checked. Saved lead information is still available.',
  provider_failed: 'The business check did not finish. Saved lead information is still available.',
  timeout: 'The business check took too long. Saved lead information is still available.'
};

function id(value, name) {
  if (!/^[1-9][0-9]{0,18}$/.test(String(value || ''))) throw Error('INVALID_FILTER');
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw Error('INVALID_FILTER');
  return n;
}

function reason(codes, status) {
  const first = Array.isArray(codes) ? codes.find(code => issueText[code]) : null;
  return issueText[first] || (status === 'failed'
    ? 'This business could not be organized safely. It stays out of your leads.'
    : 'This business needs a quick review before it can be added to your leads.');
}

function service({ identity, pool, transaction }) {
  return {
    async list(token, params) {
      if (Object.keys(params).some(key => !['org_id', 'job_id'].includes(key))) throw Error('INVALID_FILTER');
      const org = id(params.org_id, 'org_id');
      const job = id(params.job_id, 'job_id');
      await identity.principal(token, org);
      const rows = (await pool.query(`
        SELECT s.id AS staging_id, s.job_id, left(s.company_name, 240) AS company_name,
          left(s.category, 160) AS category, left(s.city, 120) AS city,
          left(s.state, 120) AS state, left(s.country, 120) AS country,
          left(s.source, 80) AS source, s.source_record_id, s.cleaning_status,
          coalesce((SELECT h.proposal->'issues'
            FROM cleaning_history h
            WHERE h.org_id=s.org_id AND h.staging_id=s.id
            ORDER BY h.id DESC LIMIT 1), '[]'::jsonb) AS issue_codes,
          left(coalesce(s.cleaning_error, ''), 120) AS cleaning_error
        FROM staging_leads s
        WHERE s.org_id=$1 AND s.job_id=$2
          AND s.cleaning_status IN ('review','failed')
          AND NOT EXISTS (
            SELECT 1 FROM cleaning_review_decisions d
            WHERE d.org_id=s.org_id AND d.staging_id=s.id
          )
        ORDER BY s.id
        LIMIT 100`, [org, job])).rows;
      return {
        job_id: job,
        reviews: rows.map(row => {
          const codes = Array.isArray(row.issue_codes) ? row.issue_codes.filter(v => typeof v === 'string').slice(0, 10) : [];
          return { ...row, issue_codes: codes, reason: reason(codes, row.cleaning_status) };
        }),
        observed_at: new Date().toISOString()
      };
    },
    async assessments(token, params) {
      if (Object.keys(params).some(key => !['org_id', 'job_id'].includes(key))) throw Error('INVALID_FILTER');
      const org = id(params.org_id, 'org_id');
      const job = id(params.job_id, 'job_id');
      await identity.principal(token, org);
      const rows = (await pool.query(`
        SELECT DISTINCT ON (t.lead_id)
          t.lead_id, left(c.company_name, 240) AS company_name,
          left(c.category, 160) AS category, left(c.city, 120) AS city,
          left(c.state, 120) AS state, left(t.error, 160) AS error,
          t.finished_at
        FROM enrichment_tasks t
        JOIN cleaned_leads c ON c.org_id=t.org_id AND c.id=t.lead_id
        JOIN cleaning_links l ON l.org_id=c.org_id AND l.cleaned_id=c.id
        JOIN staging_leads s ON s.org_id=l.org_id AND s.id=l.staging_id
        WHERE t.org_id=$1 AND s.job_id=$2 AND t.kind='basic' AND t.status='failed'
        ORDER BY t.lead_id, t.id DESC
        LIMIT 100`, [org, job])).rows;
      return {
        job_id: job,
        reviews: rows.map(row => {
          const code = typeof row.error === 'string' ? row.error.trim().toLowerCase() : '';
          return { ...row, reason: assessmentText[code] || 'The business check could not be completed. Saved lead information is still available.' };
        }),
        observed_at: new Date().toISOString()
      };
    },
    async skip(token, body) {
      if (Object.keys(body).some(key => !['org_id', 'job_id', 'staging_id'].includes(key))) throw Error('INVALID_FILTER');
      const org = id(body.org_id, 'org_id');
      const job = id(body.job_id, 'job_id');
      const staging = id(body.staging_id, 'staging_id');
      const principal = await identity.principal(token, org);
      if (!['owner', 'admin'].includes(principal.role)) throw Error('ROLE_REQUIRED');
      if (typeof transaction !== 'function') throw Error('DATA_UNAVAILABLE');
      const row = await transaction(async client => (await client.query(
        'SELECT cleaning_review_skip($1,$2,$3,$4) AS result',
        [org, job, staging, String(principal.subject)]
      )).rows[0]?.result);
      if (!row || row.saved !== true) throw Error(row?.code || 'REVIEW_NOT_SAVED');
      return { saved: true, replayed: row.replayed === true, action: 'skip', staging_id: staging };
    }
  };
}

module.exports = { service, issueText };
