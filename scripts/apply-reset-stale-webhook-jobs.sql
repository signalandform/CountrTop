-- Run this in Supabase Dashboard → SQL Editor to fix the failing process-webhooks cron.
-- Or: psql "$DATABASE_URL" -f scripts/apply-reset-stale-webhook-jobs.sql
-- Or: supabase db push (after supabase login && supabase link)

-- Reset webhook jobs stuck in processing (e.g. worker died, Vercel deploy mid-run)
-- Jobs with locked_at older than 5 minutes are reset to queued so they can be reclaimed.
CREATE OR REPLACE FUNCTION public.reset_stale_webhook_jobs()
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  n int;
BEGIN
  UPDATE public.webhook_jobs
  SET status = 'queued',
      locked_at = NULL,
      locked_by = NULL,
      updated_at = now()
  WHERE status = 'processing'
    AND locked_at < now() - interval '5 minutes';

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

COMMENT ON FUNCTION public.reset_stale_webhook_jobs() IS 'Resets jobs stuck in processing for >5 min to queued. Call before claiming.';
