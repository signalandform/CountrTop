-- webhook_events: stores raw webhook payloads for idempotency and replay
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'received',
  error text,
  CONSTRAINT webhook_events_provider_event_id_key UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_received_at
  ON public.webhook_events (provider, received_at);

COMMENT ON TABLE public.webhook_events IS 'Raw webhook payloads for idempotency and replay. Status: received|ignored|processed|failed';
