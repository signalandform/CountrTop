-- Reset webhook jobs stuck in processing (e.g. worker died, Vercel deploy mid-run)
-- Jobs with locked_at older than 5 minutes are reset to queued so they can be reclaimed.
-- Note: If getSquareOrder is slow under rate limit, consider bumping to 10 minutes.
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
