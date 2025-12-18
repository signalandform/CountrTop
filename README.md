# CountrTop

**CountrTop Kit** now ships as a 3-pronged starter for food and beverage teams: a customer-facing mobile app, a tablet-friendly vendor ops console, and a web-based vendor admin command center. Everything lives in a single PNPM monorepo with shared data models, API helpers, and UI primitives.

---

## 🔧 Tech Stack

- **React Native (Expo)** – cross-platform iOS/Android app
- **Next.js or React** – vendor admin dashboard
- **Firebase / Supabase** – backend (auth, data, functions)
- **Stripe** – payments
- **Expo Push** – notifications
- **Codex** – AI pair programmer for rapid iteration

---

## 📦 Structure

```
.
├── apps
│   ├── customer-mobile     # Expo app for customer browsing, ordering, rewards
│   ├── vendor-ops-mobile   # Expo app for kitchen/ops teams (orders queue, analytics)
│   └── vendor-admin-web    # Next.js admin for onboarding, menu, billing, analytics
├── packages
│   ├── api-client          # REST helpers for customer app + loyalty
│   ├── data                # Supabase/mock data client, auth helpers
│   ├── functions           # Server-side helpers + webhooks
│   ├── models              # Shared data contracts + enums
│   └── ui                  # Reusable dashboard UI primitives
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.json
```

### Quickstart

1. Install dependencies: `pnpm install`
2. Customer app (Expo): `pnpm dev:customer`
3. Vendor Ops (Expo): `pnpm dev:vendor-ops`
4. Vendor Admin (Next.js): `pnpm dev:vendor-admin`

Build commands are also namespaced per surface: `pnpm build:customer`, `pnpm build:vendor-ops`, and `pnpm build:vendor-admin`.

### What’s included

- **Shared models + enums** consumed by every app, keeping order status + roles consistent.
- **Data layer** (`packages/data`) that powers vendor menu CRUD, order queues, loyalty, and realtime/polling subscriptions.
- **Vendor Admin web** with onboarding tracker, menu management (list/create/edit/delete), vendor settings surface, billing placeholders, and analytics tied to shared data.
- **Vendor Ops mobile** with auth gating, live orders queue, order detail + status actions, lightweight analytics, and realtime/polling fallback.
- **Customer mobile** tabbed experience for discover / orders / rewards / account, plus push notification bootstrap + loyalty stubs.
