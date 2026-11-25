# Gmail network fix — 20 October 2026

Deployed and checked. The Windows DNS cache had been flushed. Subsequent DNS comparisons succeeded through the router, Cloudflare and Google, so no DNS server settings were changed. Before deployment, Windows passed 20/20 HTTPS checks, the ordinary container path passed 16/20, and the Gmail-only IPv4 candidate passed 20/20.

## Change

`docker-compose.yml` now mounts `scripts/network/gmail-ipv4.cjs` read-only and loads it with NODE_OPTIONS. The preload selects IPv4 only for `gmail.googleapis.com` and `oauth2.googleapis.com`. Other hostname lookups retain their original behavior. It does not change TLS verification, retries, quotas, approvals or workflow definitions.

Only n8n was recreated, using its existing image and data volume. Live environment values were compared privately against Compose before recreation. No environment drift was found, no executions were running, and email workflows were inactive. Readiness passed afterward; workflow definitions and activation states matched the pre-deployment snapshot. No emails were sent or workflows activated.

## Post-deployment evidence

The 60 credential-free Gmail profile requests all received the expected HTTP 401 response:

| Path | Passed | Median | Maximum |
| --- | --- | --- | --- |
| n8n with deployed preload | 20/20 | 688 ms | 3,371 ms |
| n8n with additional process-local scoped hook | 20/20 | 696 ms | 1,897 ms |
| Windows control | 20/20 | 424 ms | 1,687 ms |

The diagnostic label `n8n:default` now means the deployed baseline, which already includes the preload; it is not an unmodified control. The second n8n group adds the same scoped hook in the diagnostic process. Therefore this confirms post-deployment connectivity, not an independent concurrent comparison with the old configuration.

Raw results: `gmail-connectivity-2026-10-20T06-33-58-799Z-scoped/requests.jsonl` and `summary.json`. All three offline preload tests also passed. Deployment record: `gmail-network-deployment-20261020.json`.

The earlier authenticated two-email test verified same-thread sending, a real inbound reply, and SQL denial of further outreach due to that reply. This post-deployment run verifies transport only; it does not retest OAuth refresh, authenticated sends or scheduled production execution. Long-term network reliability remains UNVERIFIED, and this change cannot prevent an ISP/router outage.

## Rollback and operating boundary

The original Compose file is saved privately at `.local/gmail-network-deploy-20261020/docker-compose.before.yml`. To roll back, remove only the added NODE_OPTIONS entry and Gmail preload bind mount, then recreate only n8n with `docker compose up -d --no-deps --pull never --force-recreate n8n` during an idle maintenance window. Compare against the backup first and preserve any later unrelated changes. No database rollback is needed.

Email workflows remain inactive and existing no-retry/reconciliation safeguards remain intact. The observed connection-selection problem is mitigated; this result is not authorization to begin prospect outreach.
