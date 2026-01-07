# CountrTop

CountrTop is a **Tenant-Lite** ordering layer: multi-vendor capable, single-vendor operated. The canonical experience is the **customer web app** at `https://{vendor}.countrtop.com`, with an iOS WebView shell for mobile access.

---

## Tech Stack

- **Next.js** – customer web, vendor admin, KDS, and ops dashboard
- **React Native (Expo)** – customer iOS shell + vendor ops tablet app
- **Supabase** – auth, data, RLS, and realtime subscriptions
- **Square** – catalog, pricing, checkout, and official orders
- **Expo Push** – notifications (single type: "Order Ready")

---

## Structure

```
.
├── apps
│   ├── customer-web        # Customer ordering experience (Next.js)
│   ├── customer-mobile     # iOS WebView shell + push token capture (Expo)
│   ├── vendor-admin-web    # Vendor dashboard: analytics, settings, theming (Next.js)
│   ├── vendor-ops-mobile   # Order queue + "Mark Ready" (tablet optimized, Expo)
│   ├── kds-web             # Kitchen Display System - Universal Square queue (Next.js PWA)
│   └── ops-web             # Internal operations dashboard (Next.js)
├── packages
│   ├── api-client          # REST helpers + Square API client
│   ├── data                # Supabase client + data layer
│   ├── models              # Shared TypeScript types
│   └── ui                  # Shared UI primitives
├── supabase
│   └── migrations          # Database migrations
├── docs                    # Documentation and build plans
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.json
```

---

## Quickstart

1. Install dependencies: `pnpm install`
2. Customer web: `pnpm dev:customer-web`
3. Customer mobile (Expo): `pnpm dev:customer`
4. Vendor admin: `pnpm dev:vendor-admin`
5. Vendor ops (Expo): `pnpm dev:vendor-ops`
6. KDS: `pnpm dev:kds`
7. Ops dashboard: `pnpm dev:ops`

Build commands are namespaced: `pnpm build:customer-web`, `pnpm build:vendor-admin`, `pnpm build:kds`, `pnpm build:ops`, etc.

---

## Core Principles

- **Tenant-Lite**: Vendor resolved from subdomain on every request
- **Data isolation**: All persisted data is `vendor_id` scoped with RLS policies
- **Square canonical**: Square is the source of truth for catalog, pricing, checkout, and orders
- **Loyalty**: Accumulation only (points earned per order)
- **Push notifications**: Single type ("Order Ready")
- **Simplicity**: Prefer deletion/simplification over abstraction

---

## Apps Overview

### Customer Web (`customer-web`)
Customer-facing ordering application. Supports vendor theming (colors, fonts, logos).

### Vendor Admin (`vendor-admin-web`)
Vendor dashboard for:
- **Analytics**: Revenue, KDS performance, customer insights
- **Settings**: Business info, KDS configuration
- **Theming**: Customize colors, fonts, and branding

### KDS (`kds-web`)
Universal Square kitchen queue that ingests **all** Square OPEN orders (not just CountrTop online orders). Features:
- Realtime updates via Supabase subscriptions
- Offline-capable bump queue (placed → ready → completed)
- PWA installable on iPad
- Row Level Security for vendor-scoped access

### Ops Dashboard (`ops-web`)
Internal operations dashboard for:
- Vendor management and onboarding
- Feature flags
- System health monitoring
- Support inbox

---

## Environment Configuration

Copy sample envs to configure each app:
- `apps/customer-web/.env.example`
- `apps/vendor-admin-web/.env.example`
- `apps/kds-web/.env.example`
- `apps/ops-web/.env.example`

### Required Environment Variables

#### All Web Apps
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (server-side)
- `NEXT_PUBLIC_SUPABASE_URL` - Public Supabase URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Public anonymous key

#### Customer Web
- `SQUARE_ACCESS_TOKEN` - Square API access token
- `SQUARE_ENVIRONMENT` - "sandbox" or "production"
- `SQUARE_WEBHOOK_SIGNATURE_KEY` - Webhook signature key (production)
- `DEFAULT_VENDOR_SLUG` - Default vendor for local development

#### Ops Dashboard
- `OPS_ADMIN_EMAILS` - Comma-separated list of allowed admin emails

### Local Development

- Set `DEFAULT_VENDOR_SLUG=sunset` for local development
- Use `NEXT_PUBLIC_USE_MOCK_DATA=true` to read mock data
- Square server envs live in `apps/customer-web/.env.local`

---

## Documentation

Additional documentation is available in the `docs/` folder:

- **PHASE_3_PLAN.md** - Analytics and insights roadmap
- **MILESTONE_7_BUILD_PLAN.md** - Supabase realtime subscriptions
- **KDS_SCHEMA.md** - Kitchen Display System database schema
- **INDEXES.md** - Database index documentation
- **CONNECTION_POOLING.md** - Supabase connection pooling setup
- **VERCEL_SETUP.md** - Vercel deployment configuration
- **CRON_SETUP.md** - Square polling cron job setup

---

## CI

GitHub Actions workflow runs lint and test. Use `pnpm lint` and `pnpm test` locally before pushing.
