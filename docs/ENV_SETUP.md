# Environment Variables Setup Guide

This document lists all environment variables needed to run CountrTop.

## Core Services

### Supabase (Required)

```bash
# Get from: https://app.supabase.com → Project Settings → API
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...  # Server-side only, never expose to client

# For client-side apps
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

## POS Integrations

### Square

```bash
# Get from: https://developer.squareup.com/apps
SQUARE_ACCESS_TOKEN=EAAAl...
SQUARE_APPLICATION_ID=sandbox-sq0idb-...
SQUARE_ENVIRONMENT=sandbox  # or 'production'

# For webhooks (set in Square dashboard)
SQUARE_WEBHOOK_SIGNATURE_KEY=abc123...
SQUARE_WEBHOOK_URL=https://your-domain.com/api/webhooks/square
```

### Toast (Optional)

```bash
# Get from Toast Partner Portal
TOAST_CLIENT_ID=your-client-id
TOAST_CLIENT_SECRET=your-client-secret
TOAST_WEBHOOK_SECRET=your-webhook-secret
```

### Clover (Optional)

```bash
# Get from Clover Developer Portal
CLOVER_APP_ID=your-app-id
CLOVER_APP_SECRET=your-app-secret
CLOVER_WEBHOOK_SIGNING_KEY=your-signing-key
```

## Email Notifications

### Resend

```bash
# Get from: https://resend.com/api-keys
RESEND_API_KEY=re_abc123...
```

## Error Monitoring

### Sentry

```bash
# Get from: https://sentry.io → Project Settings → Client Keys
SENTRY_DSN=https://abc123@o123.ingest.sentry.io/456
NEXT_PUBLIC_SENTRY_DSN=https://abc123@o123.ingest.sentry.io/456

# Optional: for source maps
SENTRY_AUTH_TOKEN=sntrys_...
SENTRY_ORG=your-org
SENTRY_PROJECT=countrtop
```

## Vercel Deployment

These are automatically set by Vercel:

```bash
VERCEL_URL=your-deployment.vercel.app
VERCEL_ENV=production  # or 'preview', 'development'
VERCEL_GIT_COMMIT_SHA=abc123...
```

## Development

### Mock Mode

```bash
# Enable mock data for local development
NEXT_PUBLIC_USE_MOCK_DATA=true
```

## Per-App Configuration

### customer-web

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SQUARE_ACCESS_TOKEN=...
SQUARE_APPLICATION_ID=...
SQUARE_WEBHOOK_SIGNATURE_KEY=...
SQUARE_WEBHOOK_URL=...
RESEND_API_KEY=...
```

### kds-web

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
RESEND_API_KEY=...
```

### vendor-admin-web

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### ops-web

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Vercel Project Setup

1. Create separate Vercel projects for each app:
   - `countrtop-customer-web`
   - `countrtop-kds-web`
   - `countrtop-vendor-admin-web`
   - `countrtop-ops-web`

2. Set root directory for each:
   - `apps/customer-web`
   - `apps/kds-web`
   - `apps/vendor-admin-web`
   - `apps/ops-web`

3. Add environment variables in Vercel dashboard:
   - Settings → Environment Variables
   - Add for all environments (Production, Preview, Development)

4. Configure domains:
   - `*.countrtop.com` → customer-web (wildcard for vendors)
   - `kds.countrtop.com` → kds-web
   - `admin.countrtop.com` → vendor-admin-web
   - `ops.countrtop.com` → ops-web

## Local Development

Create `.env.local` in each app directory:

```bash
# apps/customer-web/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
SQUARE_ACCESS_TOKEN=EAAAl...
# ... etc
```

Then run:

```bash
pnpm dev  # Runs all apps concurrently
# or
pnpm --filter customer-web dev  # Run specific app
```
