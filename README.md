# CountrTop

CountrTop is a **commission-free online ordering platform** for independent restaurants. Vendors get their own branded storefront at `https://{vendor}.countrtop.com`, with a unified Kitchen Display System that works with all orders—online and in-store.

---

## Tech Stack

- **Next.js** – Customer web, vendor admin, KDS, ops dashboard, and marketing site
- **React Native (Expo)** – Customer iOS shell + vendor ops tablet app
- **Supabase** – Auth, data, RLS, and realtime subscriptions
- **Square / Toast / Clover** – POS integrations for catalog, checkout, and orders
- **Resend** – Transactional email (order confirmations, ready notifications)
- **Vercel** – Hosting and deployment

---

## Structure

```
.
├── apps
│   ├── customer-web        # Customer ordering storefront (Next.js)
│   ├── customer-mobile     # iOS WebView shell + push notifications (Expo)
│   ├── vendor-admin-web    # Vendor dashboard: analytics, settings, locations (Next.js)
│   ├── vendor-ops-mobile   # Order queue + "Mark Ready" tablet app (Expo)
│   ├── kds-web             # Kitchen Display System - universal order queue (Next.js PWA)
│   ├── ops-web             # Internal operations dashboard (Next.js)
│   └── marketing-web       # Marketing site & lead capture at countrtop.com (Next.js)
├── packages
│   ├── api-client          # REST helpers, Square API client, circuit breaker, logging
│   ├── data                # Supabase client, data layer, vendor cache, analytics
│   ├── email               # Email templates and sending (Resend)
│   ├── functions           # Shared serverless function utilities
│   ├── models              # Shared TypeScript types and env schemas
│   ├── monitoring          # Error tracking (Sentry)
│   ├── pos-adapters        # POS integrations (Square, Toast, Clover)
│   └── ui                  # Shared UI primitives, theme, ErrorBoundary
├── supabase
│   └── migrations          # Database migrations
├── docs                    # Documentation
├── scripts                 # Utility scripts (poll Square, backfill, etc.)
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
Customer-facing ordering application:

- **Storefront** – Vendor logo (right-aligned with heading), theming (logo, colors), open/closed badge, multi-location selector when applicable
- **Store info** – Full-week store hours with current day highlighted; single maps link (full address as label); pickup instructions card; contact-for-help (phone) in gate
- **Ordering** – Menu browsing, cart, Square checkout, pickup confirmation, loyalty points display
- **Order tracking** – Real-time status (placed → preparing → ready → completed), shortcode, estimated wait; post-completion CTAs: feedback (thumbs up/down), review link, contact-for-help (horizontal on desktop, stacked on mobile)
- **Auth** – Sign in with Apple (and other providers when configured); account card with points
- **Email** – Order confirmation and ready-for-pickup via Resend

### Vendor Admin (`vendor-admin-web`)
Vendor dashboard:

- **Settings** – Logo URL; custom colors (button + accent) with reset-to-default; Review Link (customer review URL after order, e.g. Google/Yelp); Feature flags; Location PINs (KDS access); KDS pairing tokens (QR code to pair devices)
- **Locations** – Multi-location management; per-location store hours (day-by-day with Closed checkbox), online ordering toggle and lead time, KDS queue settings (limits, auto-bump, sound, display mode)
- **Analytics** – Revenue series and by source, AOV, KDS summary/throughput/prep time/heatmap/source, customer summary and LTV, repeat customers, item performance
- **Orders** – Order list and status
- **Workspace** – Employees and time tracking (when enabled)

### KDS (`kds-web`)
Kitchen Display System for **all** orders (online + in-store POS):

- Real-time queue via Supabase subscriptions
- Ticket workflow: New → In Progress → Ready → Completed; recall completed
- Sound alerts, auto-bump, configurable limits and display mode (grid/list)
- Pairing via QR code (tokens from vendor admin)
- PWA installable on iPad; offline support

### Ops Dashboard (`ops-web`)
Internal operations:

- Vendor management and onboarding
- Feature flags per vendor
- System health monitoring
- Support tools

### Marketing Web (`marketing-web`)
Public site at `countrtop.com`:

- Landing page (features, pricing, how-it-works)
- Lead capture (waitlist); leads stored in Supabase `marketing_leads`

---

## Core Principles

- **Zero Commission** – Vendors keep 100% of their revenue
- **Tenant-Lite** – Vendor resolved from subdomain on every request
- **Data Isolation** – All data vendor-scoped with RLS policies
- **POS Canonical** – POS (Square/Toast/Clover) is source of truth for catalog and orders
- **Universal KDS** – Single queue for all orders; replaces paper tickets
- **Simplicity** – Prefer deletion over abstraction

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
DEFAULT_VENDOR_SLUG=              # For local dev
RESEND_API_KEY=                   # Order confirmation emails
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

| POS     | Status        | Features                                      |
|---------|---------------|-----------------------------------------------|
| **Square** | Production  | Catalog sync, checkout, webhooks, order polling |
| **Toast**  | In progress | Catalog sync, order webhooks                  |
| **Clover**  | In progress | Catalog sync, order webhooks                  |

See `docs/SQUARE_SETUP.md`, `docs/TOAST_SETUP.md`, and `docs/CLOVER_SETUP.md` for integration guides.

---

## Documentation

Additional docs in `docs/`:

- **ENV_SETUP.md** – Environment variable reference
- **VENDOR_ONBOARDING.md** – Vendor setup guide
- **KDS_SCHEMA.md** – Kitchen Display System database schema
- **VERCEL_SETUP.md** – Vercel deployment configuration
- **CRON_SETUP.md** – Square polling cron job setup
- **CONNECTION_POOLING.md** – Supabase connection pooling
- **INDEXES.md** – Database index documentation
- **TOAST_SETUP.md** – Toast POS integration
- **CLOVER_SETUP.md** – Clover POS integration

---

## Deployment

Apps deploy to Vercel:

| App              | Domain                |
|------------------|------------------------|
| customer-web     | `{vendor}.countrtop.com` |
| vendor-admin-web | `admin.countrtop.com`   |
| kds-web          | `kds.countrtop.com`    |
| ops-web          | `ops.countrtop.com`    |
| marketing-web    | `countrtop.com`        |

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
