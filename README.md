# CountrTop

CountrTop v0.1 is a **Tenant Lite** ordering layer: multi-vendor capable, single-vendor operated. The canonical experience is the **customer web app** at `https://{vendor}.countrtop.com`, with an iOS WebView shell for mobile access.

---

## 🔧 Tech Stack

- **Next.js** – customer web + vendor admin (Insights)
- **React Native (Expo)** – customer iOS shell + vendor ops tablet app
- **Supabase** – auth + data + RLS
- **Square** – catalog, pricing, checkout, and official orders
- **Expo Push** – notifications (single type: “Order Ready”)

---

## 📦 Structure

```
.
├── apps
│   ├── customer-web        # Canonical customer experience (Next.js)
│   ├── customer-mobile     # iOS WebView shell + push token capture (Expo)
│   ├── vendor-admin-web    # Vendor Insights + Settings (Next.js)
│   ├── vendor-ops-mobile   # Order queue + "Mark Ready" (tablet optimized)
│   └── kds-web             # Kitchen Display System (KDS) - Universal Square queue (Next.js, PWA)
├── packages
│   ├── api-client          # Minimal REST helpers + Square API client
│   ├── data                # Supabase + mock data client
│   ├── models              # Shared v0.1 types
│   └── ui                  # Shared UI primitives
├── supabase
│   └── migrations          # Database migrations
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.json
```

---

## 🚀 Quickstart

1. Install dependencies: `pnpm install`
2. Customer web (canonical): `pnpm dev:customer-web`
3. Customer mobile shell (Expo): `pnpm dev:customer`
4. Vendor admin (Insights + Settings): `pnpm dev:vendor-admin`
5. Vendor ops (Expo): `pnpm dev:vendor-ops`
6. KDS (Kitchen Display System): `pnpm dev:kds`

Build commands are namespaced: `pnpm build:customer-web`, `pnpm build:customer`, `pnpm build:vendor-ops`, `pnpm build:vendor-admin`, `pnpm build:kds`.

---

## ✅ v0.1 Principles

- Tenant Lite: vendor resolved from subdomain on every request
- All persisted data is `vendor_id` scoped
- Square is canonical for catalog/pricing/checkout/orders
- Loyalty is accumulation only
- Push notifications: one type (“Order Ready”)
- Prefer deletion/simplification over abstraction

---

## 🔐 Environment configuration

Copy the sample envs to configure each app:

- `apps/customer-web/.env.example`
- `apps/customer-mobile/.env.example`
- `apps/vendor-admin-web/.env.example`
- `apps/vendor-ops-mobile/.env.example`

### Required Environment Variables

All apps validate environment variables on startup. Missing required variables will cause the app to fail fast in production, with warnings in development.

#### Customer Web & Vendor Admin Web

**Required (Production):**
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-side)
- `NEXT_PUBLIC_SUPABASE_URL` - Public Supabase URL (client-side auth)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Public Supabase anonymous key (client-side auth)

**Optional:**
- `NEXT_PUBLIC_USE_MOCK_DATA=true` - Use mock data instead of Supabase (development only)
- `SQUARE_ACCESS_TOKEN` - Square API access token
- `SQUARE_ENVIRONMENT` - "sandbox" or "production" (default: sandbox)
- `SQUARE_WEBHOOK_SIGNATURE_KEY` - Square webhook signature key (required in production)
- `SQUARE_WEBHOOK_URL` - Square webhook notification URL (required in production)
- `DEFAULT_VENDOR_SLUG` - Default vendor slug for local development
- `NEXT_PUBLIC_APPLE_SIGNIN` - Enable Apple Sign In ("true"/"false")

#### Customer Mobile

**Optional:**
- `EXPO_PUBLIC_CUSTOMER_WEB_URL` - Customer web app URL
- `EXPO_PUBLIC_DEFAULT_VENDOR_SLUG` - Default vendor slug
- `EXPO_PUBLIC_API_BASE_URL` - API base URL
- `EXPO_PUBLIC_EXPO_PROJECT_ID` - Expo project ID for push notifications

#### Vendor Ops Mobile

**Optional:**
- `EXPO_PUBLIC_VENDOR_SLUG` - Vendor slug for this ops app
- `EXPO_PUBLIC_API_BASE_URL` - API base URL
- `EXPO_ACCESS_TOKEN` - Expo access token for push notifications

### Validation

Environment variables are validated at startup using schemas in `packages/models/src/env.ts`. The validation:
- **Production**: Fails fast with descriptive error messages if required variables are missing
- **Development**: Logs warnings for missing or invalid variables but allows the app to continue

For local development:

- Set `DEFAULT_VENDOR_SLUG=sunset`
- Use `NEXT_PUBLIC_USE_MOCK_DATA=true` on web apps to read mock data
- Square server envs live in `apps/customer-web/.env.example`

### Square Webhook Configuration

The Square webhook handler (`apps/customer-web/pages/api/square/webhook.ts`) requires the following environment variables:

- **`SQUARE_WEBHOOK_SIGNATURE_KEY`** (required in production): The HMAC-SHA256 signature key provided by Square for webhook signature validation. Used to verify webhook authenticity.
- **`SQUARE_WEBHOOK_URL`** (required in production): The full URL where Square sends webhook notifications. Must match the URL configured in Square Developer Dashboard.

**Note:** The webhook handler implements resilient signature validation:
- Signature validation failures are logged but do not block order processing
- Order snapshots are created regardless of signature validation result
- Repeated validation failures trigger alerts (after 5 failures within 1 hour)
- In development mode, missing signature configuration is allowed with a warning

**Security:** In production, always configure both `SQUARE_WEBHOOK_SIGNATURE_KEY` and `SQUARE_WEBHOOK_URL`. While the handler continues processing on validation failure, this should be monitored and investigated.

---

## 🍳 KDS (Kitchen Display System)

CountrTop KDS is a universal Square kitchen queue that ingests **all** Square OPEN orders (not just CountrTop online orders). This ensures CountrTop becomes the default kitchen surface, competing with Fresh KDS.

**Status:** Phase 1 (Food Truck MVP) - Milestones 0-5 complete ✅

**Deployment:**
- Staging: `https://kds.staging.countrtop.com`
- Production: TBD

**Features:**
- Universal Square order ingestion (webhook + polling)
- Offline-capable bump queue (placed → ready → completed)
- PWA installable on iPad
- Row Level Security (RLS) for vendor-scoped access

**Roadmap:** See [KDS Roadmap](./KDS_ROADMAP.md) for detailed milestones and future phases.

---

## ✅ CI

GitHub Actions workflow `CI` runs lint and test (where present). Use `pnpm lint` and `pnpm test` locally before pushing.
