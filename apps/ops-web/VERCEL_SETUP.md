# CountrTop Ops Dashboard - Vercel Setup Guide

## Project Configuration

### Root Directory
Set the **Root Directory** in Vercel to: `apps/ops-web`

### Build Settings
- **Framework Preset:** Next.js
- **Build Command:** `pnpm --filter @countrtop/ops-web build`
- **Install Command:** `pnpm install`
- **Output Directory:** `.next` (default)

### Environment Variables

Add the following environment variables in Vercel:

#### Required (Supabase)
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon/public key
- `SUPABASE_URL` - Your Supabase project URL (same as above)
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key

#### Required (Ops Access Control)
- `OPS_ADMIN_EMAILS` - Comma-separated list of allowed email addresses
  - Example: `jack@signalandformllc.com,jane@signalandformllc.com`
  - Only users with emails in this list can access the dashboard

#### Optional
- `CRON_SECRET` - Secret for cron job authentication (if needed later)

### Custom Domains

#### Staging
- Add domain: `ops.staging.countrtop.com`
- DNS: Create CNAME record `ops.staging` → `cname.vercel-dns.com`

#### Production
- Add domain: `ops.countrtop.com`
- DNS: Create CNAME record `ops` → `cname.vercel-dns.com`

## Testing Locally

1. Set environment variables in `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   OPS_ADMIN_EMAILS=your-email@example.com
   ```

2. Run the dev server:
   ```bash
   pnpm dev:ops
   ```

3. Navigate to `http://localhost:3000`
4. Sign in with a Supabase account
5. If your email is in `OPS_ADMIN_EMAILS`, you'll see the dashboard
6. If not, you'll be redirected to `/access-denied`

## Security Notes

- The dashboard is protected by email allowlist (env var `OPS_ADMIN_EMAILS`)
- All pages use `getServerSideProps` with `requireOpsAdmin` guard
- Unauthorized users are redirected to `/login` or `/access-denied`
- Make sure `OPS_ADMIN_EMAILS` is set in both staging and production environments

