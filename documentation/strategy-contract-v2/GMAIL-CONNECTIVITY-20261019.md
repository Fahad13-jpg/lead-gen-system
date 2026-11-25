# Gmail connectivity: diagnostic result, no production fix deployed

120 credential-free GET requests targeted the Gmail profile endpoint. HTTP 401 was the expected successful transport response. No message or model calls were made. Probes ran in separate Node processes inside the existing container; its running n8n process and configuration were untouched.

| Test window | Container default | Container candidate | Windows control |
| --- | --- | --- | --- |
| Initial 20 interleaved rounds | 19/20 | Forced IPv4: 20/20 | 20/20 |
| Second 20 interleaved rounds | 7/20 | Gmail-only IPv4: 14/20 | 17/20 |
| Final user-requested retry | 0/20 | Gmail-only IPv4: 0/20 | 1/20 |

## Final retry — 19 October, approximately 11:49–11:50 pm Pakistan time

The additional 60 read-only requests confirmed the problem persists. The container default path failed with EAI_AGAIN/ENOTFOUND; the scoped IPv4 path failed with cancellation/ENOTFOUND; Windows failed with timeout/ENOTFOUND. DNS resolution failed on both the host and container. This is evidence of a broader current connectivity/resolution problem, not proof of a specific Docker or workflow defect. The responsible resolver, network device, ISP route or upstream cause remains UNVERIFIED. IPv4 alone is not a fix.

Final raw evidence: `gmail-connectivity-20261019-scoped-final/requests.jsonl` and `summary.json`. The original two runs were preserved. Total across all three windows: 180 credential-free requests. No further tests or production changes are planned until the user decides how to address the network issue. Previously verified email/thread/reply behavior remains valid, but unattended sending should remain inactive.

The default container path reproduced IPv6 ENETUNREACH plus IPv4 connect timeouts, and one DNS EAI_AGAIN. IPv4 avoids the unreachable address family but does not eliminate failures. During the second window, Windows also encountered ECONNRESET and timeouts (rounds 1, 6, 7); the scoped container requests failed in overlapping rounds 1, 2, 6, 7, 8, 12. Some failures occurred after a TCP connection or TLS handshake. An error code alone cannot prove that an email POST was not sent.

This rules out a purely container-specific explanation for all observed failures. It does not identify the exact network/ISP/provider root cause. A new route (for example a different Internet connection) or the intended cloud deployment host is needed as an independent control before selecting a production network change.

## Candidate and scope

`scripts/network/gmail-ipv4.cjs` is a local, optional preload limited to `gmail.googleapis.com` and `oauth2.googleapis.com`. Its three offline tests pass, including actual Node preload loading and unchanged lookups for other hosts. It changes no TLS verification and adds no retries. Its connection selection was tested in the second interleaved run with the installed n8n HTTP helper. It is **not deployed or recommended as a complete fix** given the remaining failures. Service boot with this preload, OAuth token refresh through it, and long-running production reliability are UNVERIFIED.

No Compose, Docker, DNS, firewall, proxy, workflow, database or production process changes were applied. Node 22.19.0 is installed; no existing NODE_OPTIONS or HTTP(S)/ALL_PROXY values were set in the n8n process environment at inspection time. No credentials were used in the probes.

## Evidence limits

Raw JSONL and summaries are in `gmail-connectivity-20261019/` and `gmail-connectivity-20261019-scoped/`. Each file includes timestamps, error classes and available socket phase timings. The helper's historical `first_byte_ms` field actually measured complete helper response time; use it as response time, not precise TTFB. The script now labels this `response_ms`. Host HTTPS uses a 12-second socket timeout, while the n8n probe additionally has a 15-second absolute abort; therefore rates and maximum timings are diagnostic and not a controlled equal-deadline benchmark. Requests alternate candidate/default order, with a concurrent host request each round. Twenty requests per configuration cannot establish long-term reliability.

## Email behavior remains safe

The earlier live test verified two accepted emails in one thread and an actual reply persisted as a stop event. Direct dispatch and follow-up checks both denied further outreach specifically due to the saved reply. On uncertain sends, retain the attempt and reconcile; never automatically resend. Mailbox-read failures must leave follow-ups blocked until a fresh successful scan. Keep production sending inactive until network validation and explicit activation approval. No new waiting state, ledger extension or retry policy was introduced.
