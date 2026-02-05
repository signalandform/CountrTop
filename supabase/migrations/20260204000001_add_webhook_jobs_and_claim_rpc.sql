-- webhook_jobs: DB-backed queue for async webhook processing
CREATE TABLE IF NOT EXISTS public.webhook_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  webhook_event_id uuid NOT NULL REFERENCES public.webhook_events(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  attempts int NOT NULL DEFAULT 0,
  run_after timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_jobs_provider_event_id_key UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_jobs_status_run_after
  ON public.webhook_jobs (status, run_after);

COMMENT ON TABLE public.webhook_jobs IS 'Queue for async webhook processing. Status: queued|processing|done|failed';

-- Atomic job claiming via RPC (FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.claim_webhook_jobs(
  p_provider text,
  p_limit int,
  p_locked_by text
)
RETURNS SETOF public.webhook_jobs
LANGUAGE plpgsql
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM public.webhook_jobs
    WHERE provider = p_provider
      AND status = 'queued'
      AND run_after <= now()
    ORDER BY run_after ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.webhook_jobs
    SET status = 'processing',
        locked_at = now(),
        locked_by = p_locked_by,
        attempts = attempts + 1,
        updated_at = now()
    WHERE id = r.id;
  END LOOP;

  RETURN QUERY
    SELECT * FROM public.webhook_jobs
    WHERE provider = p_provider
      AND status = 'processing'
      AND locked_by = p_locked_by
      AND locked_at >= now() - interval '1 minute'
    ORDER BY run_after ASC;
END;
$$;
