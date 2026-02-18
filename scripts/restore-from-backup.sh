#!/bin/bash
# Restore database from backup_before_reset.sql
#
# Prerequisites:
# - psql (PostgreSQL client)
# - Database password from Supabase Dashboard → Project Settings → Database
#
# Usage:
#   DB_PASSWORD='your-db-password' ./scripts/restore-from-backup.sh
#   DB_PASSWORD='...' FORCE=1 ./scripts/restore-from-backup.sh   # Drop public schema first (if restore fails)
#
# Connection string format (get project ref from supabase projects list or Dashboard):
#   postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
#
# For direct connection (port 5432):
#   postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_FILE="$REPO_ROOT/backup_before_reset.sql"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found at $BACKUP_FILE"
  exit 1
fi

if [ -z "$DB_PASSWORD" ]; then
  echo "Error: DB_PASSWORD is required."
  echo ""
  echo "Get your database password from:"
  echo "  Supabase Dashboard → Your Project → Settings → Database"
  echo ""
  echo "Then run:"
  echo "  DB_PASSWORD='your-password' $0"
  exit 1
fi

# Project ref (override with SUPABASE_PROJECT_REF if different)
# Region: override SUPABASE_REGION if not us-east-1
PROJECT_REF="${SUPABASE_PROJECT_REF:-tahgdjvvxiggrkoxsjdy}"
REGION="${SUPABASE_REGION:-us-east-1}"

# Pooler connection (recommended for scripts)
CONNECTION_STRING="postgresql://postgres.${PROJECT_REF}:${DB_PASSWORD}@aws-0-${REGION}.pooler.supabase.com:6543/postgres"

echo "Restoring from $BACKUP_FILE to project $PROJECT_REF..."
echo ""

if [ -n "$FORCE" ]; then
  echo "FORCE=1: Dropping public schema first..."
  psql "$CONNECTION_STRING" -c "
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO postgres;
    GRANT ALL ON SCHEMA public TO public;
  "
  echo ""
fi

psql "$CONNECTION_STRING" -f "$BACKUP_FILE"

echo ""
echo "Restore complete."
