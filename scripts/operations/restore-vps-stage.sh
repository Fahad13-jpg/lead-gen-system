#!/usr/bin/env bash
set -euo pipefail
cd /opt/leadmorrow
BASE='n8nio/n8n@sha256:d055b7a9ea7da77fbcac60f17ba8517657648b0915a36dde818e44892a718964'
PG='postgres@sha256:98fe06b500b5eb29e45bf8c073eb0ca399790ce17b1d586448edc4203627d342'
test ! -e /opt/leadmorrow/private-migration/RESTORE_STARTED || { echo 'Restore already started. Reconcile before repeating.'; exit 1; }
mkdir -p private-migration
chmod 700 private-migration
test -z "$(docker volume ls -q --filter name='^leadmorrow_target_postgres$')" || { echo 'Target volume exists. Do not overwrite.'; exit 1; }
test -z "$(docker volume ls -q --filter name='^leadmorrow_target_n8n$')" || { echo 'Target n8n volume exists. Do not overwrite.'; exit 1; }
umask 077
touch private-migration/RESTORE_STARTED
printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 32)" > private-migration/postgres.env
docker volume create leadmorrow_target_postgres >/dev/null
docker volume create leadmorrow_target_n8n >/dev/null
docker run -d --name leadmorrow_db_restore --network none \
 --env-file /opt/leadmorrow/private-migration/postgres.env \
 -e POSTGRES_USER=n8n_user -e POSTGRES_DB=lead_db \
 -v leadmorrow_target_postgres:/var/lib/postgresql/data "$PG" >/dev/null
for attempt in $(seq 1 60); do
 if docker exec leadmorrow_db_restore pg_isready -U n8n_user -d lead_db >/dev/null 2>&1; then break; fi
 sleep 2
done
docker exec leadmorrow_db_restore pg_isready -U n8n_user -d lead_db >/dev/null
docker run --rm --user 0 --network none --entrypoint node -v /opt/leadmorrow:/work:ro -w /work "$BASE" \
 -e 'const c=require("./scripts/operations/backup-crypto.cjs");c.decrypt("deployment-backup-20261122/database.lgb",c.keyFile("deployment-backup-20261122.key"),process.stdout).catch(()=>{console.error("DECRYPT_FAILED");process.exitCode=1});' \
 | docker exec -i leadmorrow_db_restore pg_restore -U n8n_user -d lead_db --no-owner --no-acl --exit-on-error
# Preserve the original workflow activation list before changing the cloned database.
docker exec leadmorrow_db_restore psql -U n8n_user -d lead_db -Atc \
 "SELECT json_agg(json_build_object('id',id,'name',name,'active',active)) FROM workflow_entity;" \
 > private-migration/workflows-before-pause.json
docker exec leadmorrow_db_restore psql -U n8n_user -d lead_db -v ON_ERROR_STOP=1 -c \
 'UPDATE workflow_entity SET active=false WHERE active=true;'
docker run --rm --user 0 --network none --entrypoint node -v /opt/leadmorrow:/work:ro -w /work "$BASE" \
 -e 'const c=require("./scripts/operations/backup-crypto.cjs");c.decrypt("deployment-backup-20261122/n8n-runtime.lgb",c.keyFile("deployment-backup-20261122.key"),process.stdout).catch(()=>{console.error("DECRYPT_FAILED");process.exitCode=1});' \
 | docker run --rm -i --user 0 --network none --entrypoint sh -v leadmorrow_target_n8n:/restore "$BASE" \
 -c 'tar -xzf - -C /restore && chown -R 1000:1000 /restore'
docker exec leadmorrow_db_restore psql -U n8n_user -d lead_db -Atc \
 "SELECT json_build_object('organizations',(SELECT count(*) FROM organizations),'leads',(SELECT count(*) FROM cleaned_leads),'workflows',(SELECT count(*) FROM workflow_entity),'active_workflows',(SELECT count(*) FROM workflow_entity WHERE active));"
touch private-migration/RESTORE_COMPLETE
echo 'RESTORE_COMPLETE: source untouched, workflows paused, database private.'
