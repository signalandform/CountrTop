# Database Connection Pooling Configuration

This document describes the connection pooling strategy for Supabase clients in CountrTop.

## Overview

Supabase uses HTTP connections rather than traditional database connection pools. However, we configure clients with appropriate settings for connection reuse and resource management.

## Configuration by App Type

### Web Apps (Server-Side)
- **Apps**: `customer-web`, `vendor-admin-web`
- **Max Connections**: Effectively unlimited (HTTP-based)
- **Connection Reuse**: Enabled via HTTP keep-alive
- **Timeout**: 30 seconds (default)
- **Session Persistence**: Disabled (server-side)

**Configuration Location**: `apps/*/lib/dataClient.ts`

```typescript
createClient<Database>(supabaseUrl, supabaseKey, {
  db: { schema: 'public' },
  auth: { persistSession: false }
});
```

### Browser/Mobile Apps (Client-Side)
- **Apps**: `customer-web` (browser), `customer-mobile`, `vendor-ops-mobile`
- **Max Connections**: 5 concurrent requests (browser limit)
- **Connection Reuse**: Enabled via HTTP keep-alive
- **Session Persistence**: Enabled for auth

**Configuration Location**: `apps/customer-web/lib/supabaseBrowser.ts`

```typescript
createClient<Database>(url, anonKey, {
  db: { schema: 'public' },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
```

## Best Practices

1. **Client Reuse**: Always reuse the same Supabase client instance when possible
   - Web apps: Client is created once per request (Next.js serverless)
   - Browser: Client is cached and reused

2. **Connection Timeout**: Default 30s is appropriate for most use cases
   - Adjust if you have long-running queries

3. **Error Handling**: Implement graceful degradation on connection failures
   - Retry logic is handled at the application level (see retry logic implementation)

4. **Monitoring**: Monitor connection usage in production
   - Check Supabase dashboard for connection metrics
   - Watch for connection timeout errors

## Supabase Connection Limits

Supabase has connection limits based on your plan:
- **Free tier**: 60 connections
- **Pro tier**: 200 connections
- **Team tier**: 400 connections

These limits apply to direct database connections (via `db` option), not HTTP API calls.

## Notes

- Supabase JS client uses HTTP/HTTPS, not direct database connections
- Connection pooling is handled by Supabase infrastructure
- The `db` option enables direct database access (PostgreSQL) if needed
- For most use cases, HTTP API calls are sufficient and don't count toward connection limits

