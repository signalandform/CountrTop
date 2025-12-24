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
│   ├── vendor-admin-web    # Vendor Insights (read-only)
│   └── vendor-ops-mobile   # Order queue + "Mark Ready" (tablet optimized)
├── packages
│   ├── api-client          # Minimal REST helpers
│   ├── data                # Supabase + mock data client
│   ├── models              # Shared v0.1 types
│   └── ui                  # Shared UI primitives
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.json
```

---

## 🚀 Quickstart

1. Install dependencies: `pnpm install`
2. Customer web (canonical): `pnpm dev:customer-web`
3. Customer mobile shell (Expo): `pnpm dev:customer`
4. Vendor admin (Insights): `pnpm dev:vendor-admin`
5. Vendor ops (Expo): `pnpm dev:vendor-ops`

Build commands are namespaced: `pnpm build:customer-web`, `pnpm build:customer`, `pnpm build:vendor-ops`, `pnpm build:vendor-admin`.

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

For local development:

- Set `DEFAULT_VENDOR_SLUG=sunset`
- Use `NEXT_PUBLIC_USE_MOCK_DATA=true` on web apps to read mock data
- Square server envs live in `apps/customer-web/.env.example`
- Square webhook envs (`SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_WEBHOOK_URL`) are required for payment success processing
- Supabase browser auth uses `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## ✅ CI

GitHub Actions workflow `CI` runs lint and test (where present). Use `pnpm lint` and `pnpm test` locally before pushing.
