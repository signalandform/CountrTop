# CountrTop

CountrTop is a **commission-free online ordering platform** for independent restaurants. Vendors get their own branded storefront at `https://{vendor}.countrtop.com`, with a unified Kitchen Display System that works with all orders—online and in-store.

---

## Tech Stack

- **Next.js** – Customer web, vendor admin, KDS, ops dashboard, and marketing site
- **React Native (Expo)** – Customer iOS shell + vendor ops tablet app
- **Supabase** – Auth, data, RLS, and realtime subscriptions
- **Square and Clover** – POS integrations for catalog, checkout, and orders. Square for full storefront and checkout; Clover for KDS. Vendors must activate Square for production payments; CountrTop detects and guides this during onboarding.
- **Resend** – Transactional email (order confirmations, ready notifications)
- **Vercel** – Hosting and deployment

---

## Structure

```
.
├── apps
│   ├── customer-web        # Customer ordering storefront (Next.js)
│   ├── customer-mobile     # iOS WebView shell + push notifications (Expo)
│   ├── vendor-admin-web    # Vendor dashboard: analytics, settings, branding (Next.js)
│   ├── vendor-ops-mobile   # Order queue + "Mark Ready" tablet app (Expo)
│   ├── kds-web             # Kitchen Display System - Universal order queue (Next.js PWA)
│   ├── ops-web             # Internal operations dashboard (Next.js)
│   └── marketing-web       # Marketing site & lead capture at countrtop.com (Next.js)
├── packages
│   ├── api-client          # REST helpers, Square API client, logging
│   ├── data                # Supabase client + data layer
│   ├── email               # Email templates and sending (Resend)
│   ├── functions           # Shared serverless function utilities
│   ├── models              # Shared TypeScript types
│   ├── monitoring          # Error tracking (Sentry)
│   ├── pos-adapters        # POS integrations (Square, Toast, Clover)
│   └── ui                  # Shared UI primitives
├── supabase
│   └── migrations          # Database migrations
├── docs                    # Documentation
├── scripts                 # Utility scripts
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.json
```

---

## Quickstart

```bash
# Install dependencies
pnpm install

# Run apps (each on different ports)
pnpm dev:customer-web     # http://localhost:3000
pnpm dev:vendor-admin     # http://localhost:3001
pnpm dev:kds              # http://localhost:3002
pnpm dev:ops              # http://localhost:3003
```

Build commands follow the same pattern: `pnpm build:customer-web`, `pnpm build:vendor-admin`, etc.

---

## Apps Overview

### Customer Web (`customer-web`)
Customer-facing ordering application with:
- Vendor theming (colors, logo)
- Menu browsing and cart
- Square checkout integration
- Order tracking with real-time status updates
- Email confirmations

### Vendor Admin (`vendor-admin-web`)
Vendor dashboard for:
- **Analytics**: Revenue, orders, peak hours, customer insights
- **Settings**: Business info, hours, pickup instructions
- **Branding**: Custom colors and logo
- **Locations**: Multi-location management with KDS settings

### KDS (`kds-web`)
Kitchen Display System that shows **all** orders (online + in-store POS):
- Real-time updates via Supabase subscriptions
- Ticket workflow: New → In Progress → Ready → Completed
- Recall completed tickets
- Sound alerts and auto-bump settings
- PWA installable on iPad
- Offline support

### Ops Dashboard (`ops-web`)
Internal operations dashboard for:
- Vendor management and onboarding
- Feature flags
- System health monitoring
- Support tools

### Marketing Web (`marketing-web`)
Public marketing site at `countrtop.com`:
- Landing page with features, pricing, and how-it-works
- Lead capture form (waitlist signups)
- Stored in Supabase `marketing_leads` table

---

## Core Principles

- **Zero Commission**: Vendors keep 100% of their revenue
- **Tenant-Lite**: Vendor resolved from subdomain on every request
- **Data Isolation**: All data is vendor-scoped with RLS policies
- **POS Canonical**: POS (Square/Toast/Clover) is source of truth for catalog and orders
- **Universal KDS**: Shows all orders, not just online—replaces paper tickets entirely
- **Simplicity**: Prefer deletion over abstraction

---

## Environment Variables

### All Web Apps
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### Customer Web
```
SQUARE_ACCESS_TOKEN=
SQUARE_ENVIRONMENT=sandbox|production
SQUARE_WEBHOOK_SIGNATURE_KEY=
SQUARE_WEBHOOK_URL=               # Must match URL Square calls (e.g. https://yourdomain.com/api/webhooks/square)
DEFAULT_VENDOR_SLUG=              # For local dev
RESEND_API_KEY=                   # Order confirmation emails
CRON_SECRET=                      # For cron jobs (poll-square, process-webhooks)
```

**Square Webhook Queue**: Webhooks are persisted and processed asynchronously. The worker runs every minute via Vercel Cron. Set `CRON_SECRET` and `SQUARE_WEBHOOK_URL` in production. To replay a failed event:
```bash
pnpm tsx scripts/replay-webhook-event.ts --eventId=<Square event_id>
# Then wait for cron or: curl -X POST <BASE_URL>/api/jobs/process-webhooks -H "Authorization: Bearer $CRON_SECRET"
```

### KDS Web
```
RESEND_API_KEY=                   # Order ready emails
```

### Ops Dashboard
```
OPS_ADMIN_EMAILS=                 # Comma-separated admin emails
```

### Marketing Web
```
RESEND_API_KEY=                   # Admin notification on new leads (optional)
```

---

## POS Integrations

CountrTop integrates with multiple POS systems:

| POS | Status | Features |
|-----|--------|----------|
| **Square** | ✅ Production | Catalog sync, checkout, webhooks, order polling |
| **Clover** | ✅ Production (KDS) | Order webhooks, KDS |
| **More POS** | Roadmap | Additional integrations planned |

See `docs/SQUARE_SETUP.md` and `docs/CLOVER_SETUP.md` for integration guides.

---

## Documentation

Additional documentation in `docs/`:

- **ENV_SETUP.md** – Environment variable reference
- **VENDOR_ONBOARDING.md** – Vendor setup guide
- **KDS_SCHEMA.md** – Kitchen Display System database schema
- **VERCEL_SETUP.md** – Vercel deployment configuration
- **CRON_SETUP.md** – Square polling cron job setup
- **CONNECTION_POOLING.md** – Supabase connection pooling
- **INDEXES.md** – Database index documentation

---

## Deployment

All apps deploy to Vercel:

| App | Domain |
|-----|--------|
| customer-web | `{vendor}.countrtop.com` |
| vendor-admin-web | `admin.countrtop.com` |
| kds-web | `kds.countrtop.com` |
| ops-web | `ops.countrtop.com` |
| marketing-web | `countrtop.com` |

---

## CI/CD

GitHub Actions runs on every push:
- ESLint (`pnpm lint`)
- TypeScript type checking
- Build verification

Run locally before pushing:
```bash
pnpm lint
pnpm build
```

---

## License

MIT
