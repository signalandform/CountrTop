# Vercel Cron Jobs Setup for Square Polling

This document describes how to configure Vercel Cron Jobs for automatic Square order polling.

## Overview

The Square polling reconciler (`/api/cron/poll-square`) runs automatically via Vercel Cron Jobs to:
- Recover missed webhook events
- Ensure `square_orders` and `kitchen_tickets` tables stay in sync
- Provide reliability backbone for the KDS system

## Configuration

### 1. Vercel Cron Configuration

The cron job is configured in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/poll-square",
      "schedule": "*/2 * * * *"
    }
  ]
}
```

**Schedule:** Runs every 2 minutes (`*/2 * * * *`)

To change the schedule, update the `schedule` field using [cron syntax](https://crontab.guru/).

### 2. Required Environment Variables

Set these in your Vercel project settings:

#### Required
- `VERCEL_CRON_SECRET` - Secret token for authenticating cron requests (Vercel standard)
  - Generate a secure random string (e.g., `openssl rand -hex 32`)
  - Must be at least 16 characters
  - Vercel automatically sends this in the `X-Vercel-Authorization` header
  - **Alternative:** `CRON_SECRET` (custom) - also supported for flexibility

#### Optional
- `POLL_MINUTES_BACK` - How many minutes back to poll (default: `10`)
- `SQUARE_LOCATION_IDS` - Comma-separated list of Square location IDs to poll
  - If not set, automatically queries all active vendors with `square_location_id`

#### Already Required (for other features)
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (for vendor queries)
- `SQUARE_ACCESS_TOKEN` - Square API access token (per vendor, stored in DB)

## Setup Instructions

### Step 1: Generate CRON_SECRET

```bash
# Generate a secure random secret
openssl rand -hex 32
```

### Step 2: Add Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following:
   - `VERCEL_CRON_SECRET` = (the value from Step 1) - **Recommended**
   - OR `CRON_SECRET` = (alternative custom secret)
   - `POLL_MINUTES_BACK` = `10` (optional, defaults to 10)
   - `SQUARE_LOCATION_IDS` = (optional, comma-separated location IDs)

### Step 3: Deploy

After deploying, Vercel will automatically:
1. Register the cron job
2. Start executing it on the configured schedule
3. Send requests with the `X-Vercel-Authorization: <VERCEL_CRON_SECRET>` header (if `VERCEL_CRON_SECRET` is set)

### Step 4: Verify Cron Job

1. Go to **Settings** → **Cron Jobs** in your Vercel project
2. You should see the `poll-square` cron job listed
3. Check the execution logs to verify it's running successfully

## Manual Testing

You can manually trigger the cron endpoint for testing:

```bash
# Using query parameter
curl "https://your-domain.com/api/cron/poll-square?secret=YOUR_CRON_SECRET&minutesBack=5"

# Using Authorization header
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
     "https://your-domain.com/api/cron/poll-square?minutesBack=5"
```

## Monitoring

- **Vercel Dashboard:** Check cron job execution logs in **Settings** → **Cron Jobs**
- **Application Logs:** The endpoint logs to your application logger with:
  - `Starting cron reconciliation` - When polling begins
  - `Cron reconciliation complete` - When polling finishes with summary stats
  - Error logs for any failures

## Troubleshooting

### Cron job not appearing in Vercel UI
- Ensure `vercel.json` is committed and deployed
- Check that the path matches exactly: `/api/cron/poll-square`
- Verify the cron schedule syntax is valid

### 401 Unauthorized errors
- Verify `VERCEL_CRON_SECRET` (or `CRON_SECRET`) is set in Vercel environment variables
- Check that the secret matches what Vercel is sending
- Verify Vercel is sending the `X-Vercel-Authorization` header (check logs)
- Review endpoint logs for authentication details

### No locations being polled
- If `SQUARE_LOCATION_IDS` is set, verify the location IDs are correct
- If not set, ensure vendors have `square_location_id` set and `status = 'active'`
- Check application logs for vendor query errors

## Schedule Recommendations

- **Staging:** Every 2 minutes (`*/2 * * * *`) - Good for testing
- **Production:** Every 1 minute (`* * * * *`) - Higher frequency for reliability
- **Development:** Every 5 minutes (`*/5 * * * *`) - Lower frequency to reduce API calls

Adjust based on your order volume and Square API rate limits.

