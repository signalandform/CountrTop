# CountrTop Repo Audit Scorecard

**Audit Date:** February 11, 2025  
**Scope:** Full repository audit against production-readiness rubric

---

## 1. Scorecard (0–5 each + weighted total)

| Category | Criterion | Score | Notes |
|----------|-----------|-------|-------|
| **A. Product Risk / Correctness** | | | |
| | Critical flows correctness | 3.5/5 | Auth/billing/webhooks exist; no tests; good idempotency on webhooks |
| | Data integrity | 4/5 | Migrations, constraints, webhook idempotency; signup not transactional |
| | Error handling & observability | 3/5 | Structured logs (Pino), Sentry present but ErrorBoundary capture commented out |
| **B. Security** | | | |
| | Secrets & config hygiene | 4.5/5 | No secrets in repo; env vars; `.env` gitignored |
| | AuthZ & multi-tenant isolation | 4/5 | RLS on 22/24 tables; vendor-admin checks; webhook tables use service role |
| | External surface safety | 4/5 | Webhook verification (Square, Clover, Stripe); rate limiting; in-memory only |
| **C. Reliability & Scalability** | | | |
| | Performance & bottlenecks | 3.5/5 | Square retries/circuit breaker; rate limit in-memory; no N+1 audit |
| | Async jobs robustness | 4.5/5 | Webhook queue, backoff, atomic claim, poison-pill reset |
| | Dependency + build stability | 4/5 | pnpm lockfile, frozen install, no build in CI |
| **D. Maintainability** | | | |
| | Architecture clarity | 4/5 | Clear monorepo; packages/data, api-client, pos-adapters |
| | Test coverage quality | 1/5 | No tests; `pnpm test` is no-op |
| | Code health / consistency | 4/5 | ESLint, Prettier, TypeScript |
| **E. DX / Release** | | | |
| | CI/CD confidence | 2.5/5 | Lint + test; no build gate; no migration check |
| | Runbooks + on-call readiness | 3/5 | ENV_SETUP, CRON_SETUP, VERCEL_SETUP; no incident runbook |

### Weighted Total (starter weighting)

- **Security + critical flows (40%):** 0.40 × (3.5×0.5 + 4.5×0.25 + 4×0.25) ≈ **1.58**
- **Reliability/observability (25%):** 0.25 × (3.5×0.33 + 4.5×0.33 + 4×0.33) ≈ **1.0**
- **Maintainability/tests (20%):** 0.20 × (4×0.33 + 1×0.33 + 4×0.33) ≈ **0.6**
- **Performance/scaling (10%):** 0.10 × 3.5 ≈ **0.35**
- **DX/runbooks (5%):** 0.05 × 2.75 ≈ **0.14**

**Overall (0–5 scale):** ~3.7 / 5

---

## 2. Top 10 Risks (impact × likelihood × effort)

| # | Risk | Impact | Likelihood | Effort | Priority |
|---|------|--------|------------|--------|----------|
| 1 | **No automated tests** – regressions, payment/billing bugs go undetected | High | Certain | Medium | P0 |
| 2 | **CI does not run build** – broken builds can merge | High | Medium | Low | P0 |
| 3 | **Stripe webhook no idempotency** – duplicate subscription updates | High | Low | Low | P1 |
| 4 | **order_snapshots no unique (vendor_id, square_order_id)** – race could double-snapshot | Medium | Low | Low | P1 |
| 5 | **Rate limiting in-memory** – ineffective at 10× traffic / multiple instances | Medium | High | Medium | P1 |
| 6 | **Sentry capture commented out in ErrorBoundary** – errors not reported | Medium | Medium | Low | P1 |
| 7 | **Signup not transactional** – orphan vendor if auth fails mid-flow | Medium | Low | Medium | P2 |
| 8 | **No correlation IDs** – harder to trace requests across logs | Low | High | Low | P2 |
| 9 | **No migration check in CI** – schema drift risk | Medium | Low | Low | P2 |
| 10 | **No rollback / incident runbook** – slower recovery | Medium | Medium | Medium | P2 |

---

## 3. First 10 Hours Plan (exact files, exact changes)

| Hour | Task | Files | Changes |
|------|------|-------|---------|
| 1 | Add build to CI | `.github/workflows/ci.yml` | Add `pnpm build` after lint |
| 2 | Enable Sentry in ErrorBoundary | `packages/ui/src/ErrorBoundary.tsx`, `apps/*/pages/_app.tsx` | Uncomment `captureException` and wire to `@countrtop/monitoring` |
| 3 | Add unique constraint for order_snapshots | `supabase/migrations/` | New migration: `UNIQUE (vendor_id, square_order_id)` |
| 4 | Add Stripe webhook idempotency | `apps/vendor-admin-web/pages/api/webhooks/stripe.ts` | Store `event.id` in DB or use `event.id` as idempotency key before processing |
| 5 | Add correlation ID to request logs | `packages/api-client/src/logger.ts`, API routes | Generate `requestId` in middleware, pass to handlers |
| 6 | Add integration tests for checkout | `apps/customer-web/__tests__/` | Jest/Vitest: mock API, assert checkout flow |
| 7 | Add tests for webhook handler | `apps/customer-web/__tests__/` | Test signature validation, idempotency |
| 8 | Add migration check to CI | `.github/workflows/ci.yml` | Run `supabase db diff` or `supabase migration list` |
| 9 | Document incident runbook | `docs/INCIDENT_RUNBOOK.md` | How to debug, recover, known failure modes |
| 10 | Make signup transactional | `apps/vendor-admin-web/pages/api/signup/prepare.ts` | Use DB transaction: vendor + intake + billing + auth; rollback on failure |

---

## 4. Ship Blocker List (must-fix before launch)

- [ ] **CI must run build** – broken builds cannot merge
- [ ] **Enable Sentry capture** – production errors must be reported
- [ ] **Add unique constraint on order_snapshots (vendor_id, square_order_id)** – prevent duplicate order creation
- [ ] **At least one critical-path test** – e.g. checkout or webhook flow

---

## 5. Quick Wins (≤30 min each)

| Win | File(s) | Change |
|-----|---------|--------|
| Add build to CI | `.github/workflows/ci.yml` | Add `run: pnpm build` step |
| Enable Sentry in ErrorBoundary | `packages/ui/src/ErrorBoundary.tsx` | Uncomment `Sentry.captureException` |
| Add `requestId` to createLogger defaults | `packages/api-client/src/logger.ts` | Auto-generate UUID when not provided |
| Replace `console.error` with logger in Stripe webhook | `apps/vendor-admin-web/pages/api/webhooks/stripe.ts` | Use `createLogger` |
| Add `CRON_SECRET` check to poll-square docs | `docs/CRON_SETUP.md` | Explicit “required in production” note |

---

## 6. Architecture Map (one page)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CountrTop Architecture                              │
└─────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  customer-web    │  │  vendor-admin-web │  │  kds-web         │  │  ops-web          │
│  (Next.js)      │  │  (Next.js)       │  │  (Next.js PWA)   │  │  (Next.js)        │
└────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
         │                     │                      │                     │
         │    ┌────────────────┴──────────────────────┴────────────────────┘
         │    │
         ▼    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           API Routes (Next.js)                                    │
│  /api/vendors/[slug]/checkout   /api/webhooks/[provider]   /api/cron/poll-square │
│  /api/vendors/[slug]/catalog    /api/webhooks/stripe       /api/jobs/process-    │
│  /api/signup/prepare            /api/webhooks/clover-hco   webhooks              │
└─────────────────────────────────────────────────────────────────────────────────┘
         │                              │
         │    ┌─────────────────────────┼─────────────────────────┐
         │    │                         │                         │
         ▼    ▼                         ▼                         ▼
┌─────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────────┐
│ packages/data   │  │ packages/pos-adapters   │  │ packages/api-client          │
│ (Supabase)      │  │ Square, Clover, Toast   │  │ Square client, logger        │
└────────┬────────┘  └────────────┬────────────┘  └─────────────────────────────┘
         │                        │
         │    ┌───────────────────┼───────────────────┐
         │    │                   │                   │
         ▼    ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────────────┐
│ Supabase        │  │ Square API      │  │ Stripe / Resend                     │
│ - Auth          │  │ Clover API      │  │ (billing, emails)                    │
│ - Postgres      │  │ (catalog,       │  │                                     │
│ - RLS           │  │  checkout,       │  │                                     │
│ - Realtime      │  │  webhooks)       │  │                                     │
└─────────────────┘  └─────────────────┘  └─────────────────────────────────────┘

Data flow (orders):
  1. Customer → checkout API → Square/Clover Checkout
  2. Square/Clover → webhook → persist → enqueue job
  3. Cron (process-webhooks) → claim job → processor → upsert square_orders, kitchen_tickets, order_snapshots
  4. KDS subscribes via Supabase Realtime
```

---

## Appendix: Detailed Findings

### A. Product Risk / Correctness

**Critical flows**
- **Auth:** Supabase Auth (OAuth, password). No unit/integration tests.
- **Billing:** Stripe Checkout + webhook. AuthZ via `requireVendorAdminApi`. No idempotency on Stripe events.
- **Payments:** Square (primary), Clover. Checkout creates order; webhook confirms payment.
- **Webhooks:** Square, Clover, Stripe. Signature verification present. Persist + async process.
- **Data writes:** Mostly via `packages/data` / Supabase client.

**Data integrity**
- `webhook_events` UNIQUE (provider, event_id) – idempotent ingest.
- `webhook_jobs` UNIQUE (provider, event_id) – no duplicate jobs.
- `order_snapshots` – no unique on (vendor_id, square_order_id); app-level check `getOrderSnapshotBySquareOrderId` before create.
- Signup: vendor → intake → billing → auth → update vendor. Not transactional; rollback on auth failure leaves orphan records.

**Error handling**
- Pino structured logs; `createLogger({ requestId })`.
- Sentry package exists; `captureException` available; ErrorBoundary handlers have it commented out.
- No correlation IDs propagated across services.
- No dead-letter queue; webhook jobs reset after 5 min if stuck.

### B. Security

**Secrets**
- `.env` in `.gitignore`. No secrets in repo. ENV_SETUP.md documents all vars.

**AuthZ**
- RLS enabled on 22/24 tables. `webhook_events` and `webhook_jobs` use service role (no RLS).
- Vendor admin: `admin_user_id` check via `requireVendorAdminApi`.
- Ops: `OPS_ADMIN_EMAILS` whitelist.

**External surface**
- Webhooks: Square HMAC, Clover HCO signature, Stripe `constructEvent`.
- Rate limiting: checkout (10/min), catalog (100/min), signup (10/10min), reconcile. In-memory store.

### C. Reliability

**Performance**
- Square client: retries, circuit breaker.
- Rate limit: in-memory; ineffective across Vercel instances.

**Async jobs**
- Webhook queue with `claim_webhook_jobs` (FOR UPDATE SKIP LOCKED).
- Backoff: 5s, 30s, 2m, 10m, 1h.
- `reset_stale_webhook_jobs` for stuck jobs.

**Dependencies**
- pnpm lockfile; `--frozen-lockfile` in CI.

### D. Maintainability

**Architecture**
- Monorepo: apps (customer-web, vendor-admin-web, kds-web, ops-web, etc.), packages (data, api-client, pos-adapters, monitoring, email).

**Tests**
- No test files. `pnpm test` runs `pnpm -r test --if-present`; no packages define tests.

**Code health**
- ESLint, Prettier, TypeScript. Lint passes in CI.

### E. DX / Release

**CI/CD**
- Lint + test. No build step. No migration verification.

**Docs**
- ENV_SETUP, CRON_SETUP, VERCEL_SETUP, SQUARE_SETUP, CLOVER_SETUP, etc.
- No incident runbook or “how to recover” guide.
