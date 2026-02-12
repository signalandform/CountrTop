# Supabase MCP Verification

This guide helps verify that the Supabase MCP in Cursor is connected to the correct CountrTop project.

## Current Configuration

The Supabase MCP is scoped to a specific project via `project_ref` in the MCP URL:

```
https://mcp.supabase.com/mcp?project_ref=<PROJECT_REF>
```

**Current project reference:** `tahgdjvvxiggrkoxsjdy`

## How to Verify You're on the Right Project

1. **In Supabase Dashboard**
   - Go to [app.supabase.com](https://app.supabase.com)
   - Select the project that uses `supabase.countrtop.com` as its API URL (production)
   - Navigate to **Project Settings** → **General**
   - Find **Reference ID** (or **Project ID**)
   - This value should match the `project_ref` in your MCP config

2. **In Cursor**
   - Open **Settings** → **Cursor Settings** → **Tools & MCP**
   - Find the Supabase MCP entry
   - The URL should include `project_ref=tahgdjvvxiggrkoxsjdy` for the production CountrTop project

3. **Quick check via MCP**
   - Ask the AI to "list tables in the public schema" or "query the vendors table"
   - You should see CountrTop tables: `vendors`, `webhook_jobs`, `kitchen_tickets`, `order_snapshots`, etc.
   - Row counts should match production (e.g., ~6 vendors, ~53 webhook jobs)

## If the Project is Wrong

1. Get the correct `project_ref` from Supabase Dashboard (Project Settings → General)
2. Update your MCP config:
   - **User-level:** `~/.cursor/mcp.json`
   - **Project-level:** `CountrTop/.cursor/mcp.json` (if present)
3. Restart Cursor or reload the MCP connection
4. Re-authenticate if prompted (Settings → Tools & MCP → Supabase)

## Project-Level Config

This project includes `.cursor/mcp.json` with the expected Supabase MCP config. When working in CountrTop, Cursor uses this to ensure the MCP points at the correct project.
