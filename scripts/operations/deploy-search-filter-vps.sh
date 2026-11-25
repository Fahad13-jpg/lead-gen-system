#!/usr/bin/env bash
set -euo pipefail
cd /opt/leadmorrow
container=leadgen-release-n8n-1
backup=/opt/leadmorrow/private-migration/search-filter-20261124
mkdir -p "$backup"
chmod 700 "$backup"
active_executions=$(docker exec leadgen-release-postgres-1 psql -U n8n_user -d lead_db -XAtc "SELECT count(*) FROM execution_entity WHERE status IN ('new','running','waiting')")
test "$active_executions" = 0 || { echo 'N8N_HAS_ACTIVE_EXECUTIONS'; exit 1; }
ids=(Tz2ITCKb2ut8J2ue CCedag31c0pmbdAL RY8gsLPbZm4R3zti fF3AIsbTVvj5I2PD)
files=(03_google_maps_scraper 03b_facebook_pages_scraper 03a_yellow_pages_scraper 03c_yelp_scraper)
for i in "${!ids[@]}"; do
  id=${ids[$i]}
  file=${files[$i]}
  docker exec -u node "$container" n8n export:workflow --id="$id" --output="/tmp/$id.before.json" >/dev/null
  docker exec -u node "$container" cat "/tmp/$id.before.json" > "$backup/$id.before.json"
  docker exec -i -u node "$container" node -e 'require("node:fs").writeFileSync(process.argv[1],require("node:fs").readFileSync(0))' "/tmp/$file.json" < "workflows/$file.json"
  docker exec -i -u node "$container" node - "/tmp/$id.before.json" "/tmp/$file.json" "/tmp/$id.updated.json" < scripts/operations/patch-search-workflow-export.cjs
done
python3 - <<'PY'
from pathlib import Path
p=Path('deployment/target.env')
lines=p.read_text().splitlines()
target='STAGING_APPROVED_WORKFLOW_IDS='
matches=[i for i,line in enumerate(lines) if line.startswith(target)]
assert len(matches)==1
ids=lines[matches[0]][len(target):].split(',')
for item in ('RY8gsLPbZm4R3zti','fF3AIsbTVvj5I2PD'):
    if item not in ids: ids.append(item)
lines[matches[0]]=target+','.join(ids)
p.write_text('\n'.join(lines)+'\n')
PY
for id in "${ids[@]}"; do
  docker exec -u node "$container" n8n import:workflow --input="/tmp/$id.updated.json" --projectId=xLW48WqYIkxblH0N >/dev/null
  docker exec -u node "$container" n8n update:workflow --id="$id" --active=true >/dev/null
done
docker compose --env-file deployment/target.env -f deployment/compose.application.yml --profile application up -d --force-recreate n8n
docker compose --env-file deployment/target.env -f deployment/compose.application.yml --profile application ps n8n
docker exec leadgen-release-postgres-1 psql -U n8n_user -d lead_db -XAtc "SELECT name,active FROM workflow_entity WHERE id IN ('Tz2ITCKb2ut8J2ue','CCedag31c0pmbdAL','RY8gsLPbZm4R3zti','fF3AIsbTVvj5I2PD') ORDER BY name"
