# Incident Runbook

How to debug, recover, and handle known failure modes in CountrTop.

---

## How to Debug

### 1. Check Logs

- **Vercel:** Dashboard → Project → Logs. Filter by function (e.g. `api/webhooks/square`, `api/cron/poll-square`).
- **Supabase:** Dashboard → Logs → Postgres. Check for slow queries, connection errors, deadlocks.
- **Sentry:** Project → Issues. Filter by app, environment, time range.

### 2. Check Key Tables

- **webhook_events:** `SELECT * FROM webhook_events WHERE status = 'failed' ORDER BY received_at DESC LIMIT 20;`
- **webhook_jobs:** `SELECT * FROM webhook_jobs WHERE status IN ('processing', 'failed') ORDER BY run_after;`
- **order_snapshots:** Verify order creation and duplicates.

### 3. Correlation IDs

- API responses include `X-Request-ID`. Use this to trace a request across logs.
- Pass `x-request-id` header when reproducing issues.

---

## How to Recover

### Webhook Backlog

If webhook processing is falling behind:

1. **Reset stale jobs:** Jobs stuck in `processing` for >5 min are auto-reset by `process-webhooks` cron. If needed, run manually:
   ```sql
   SELECT reset_stale_webhook_jobs();
   ```
2. **Replay a failed event:**
   ```bash
   pnpm tsx scripts/replay-webhook-event.ts --eventId=<Square event_id>
   curl -X POST https://<BASE_URL>/api/jobs/process-webhooks -H "Authorization: Bearer $CRON_SECRET"
   ```

### Square Token Expired

- Vendors with `square_access_token` that expired: `refreshSquareTokenIfNeeded` runs automatically when a 401 is seen during webhook processing.
- If still failing, re-connect Square in vendor admin: Settings → Connect Square.

### Cron Not Running

- Ensure `VERCEL_CRON_SECRET` or `CRON_SECRET` is set in Vercel env vars.
- Check Vercel Dashboard → Cron Jobs for execution logs.
- Manual trigger: `curl -H "Authorization: Bearer $CRON_SECRET" https://<BASE_URL>/api/cron/poll-square`

---

## Known Failure Modes

| Failure | Symptoms | Resolution |
|---------|----------|------------|
| Webhook signature mismatch | `status: 'invalid'`, Square retries | Verify `SQUARE_WEBHOOK_SIGNATURE_KEY` and `SQUARE_WEBHOOK_URL` match Square dashboard |
| Stripe webhook not configured | 500 on `/api/webhooks/stripe` | Set `STRIPE_WEBHOOK_SECRET` in vendor-admin env |
| Duplicate order snapshots | Multiple rows for same vendor+square_order_id | Fixed by `order_snapshots_vendor_square_order_unique` constraint (migration 20260220000000) |
| Rate limit exceeded | 429 on checkout/catalog | In-memory; resets per instance. Consider Redis for cross-instance |
| Orphan vendor on signup | Vendor exists but no auth user | Compensating transaction in signup (see prepare.ts) |

---

## Escalation

1. Check Sentry for recent errors.
2. Check Vercel logs for the affected endpoint.
3. Query `webhook_events` and `webhook_jobs` for failures.
4. Replay failed webhooks if applicable.
5. Contact: [Add your escalation contact]
