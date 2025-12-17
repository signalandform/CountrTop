# CountrTop

**CountrTop Kit** is a white-label mobile app + vendor dashboard starter for food trucks, vendors, and hospitality brands. Designed to power standalone ordering and loyalty apps, or feed into multi-vendor platforms like Hilltop.

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

This repository is organized as a PNPM-powered monorepo with dedicated apps for mobile and web, plus shared packages for UI, data models, and API access.

```
.
├── apps
│   ├── dashboard   # Next.js vendor console
│   └── mobile      # Expo React Native customer app
├── packages
│   ├── api-client  # Typed API helpers for menus, loyalty, and orders
│   ├── models      # Shared data contracts
│   └── ui          # Reusable UI building blocks for the dashboard
├── tsconfig.json   # Shared compiler settings and path aliases
├── pnpm-workspace.yaml
└── package.json
```

### Quickstart

1. Install dependencies with `pnpm install`.
2. Run `pnpm dev:mobile` to start the Expo dev server.
3. Run `pnpm dev:dashboard` to start the Next.js dashboard.

### What’s included

- **Typed data models** for vendors, menu items, loyalty, and orders.
- **API client stubs** for fetching featured vendors, menus, loyalty snapshots, and recent orders.
- **Shared UI components** for dashboard sections and stats.
- **Placeholder screens** in both apps aligned to the ordering, loyalty, and vendor management flows described above.
