-- Clover Hosted Checkout: session storage for webhook lookup
-- When we create an HCO session we store sessionId -> ct_reference_id, vendor, location, cart snapshot.
-- When the HCO webhook fires we look up by session ID and create order_snapshot, pos_order, kitchen_ticket.

CREATE TABLE IF NOT EXISTS public.clover_checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL UNIQUE,
  vendor_id text NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  vendor_location_id uuid NOT NULL REFERENCES public.vendor_locations(id) ON DELETE CASCADE,
  ct_reference_id text NOT NULL,
  snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clover_checkout_sessions_session_id
  ON public.clover_checkout_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_clover_checkout_sessions_created_at
  ON public.clover_checkout_sessions(created_at);

COMMENT ON TABLE public.clover_checkout_sessions IS 'Stores Clover Hosted Checkout session ID -> vendor/location/ct_reference_id for webhook processing. Sessions expire ~15 min.';

ALTER TABLE public.clover_checkout_sessions ENABLE ROW LEVEL SECURITY;

-- Only server (service role) needs to read/write; no client policies
DROP POLICY IF EXISTS "clover_checkout_sessions_service_only" ON public.clover_checkout_sessions;
CREATE POLICY "clover_checkout_sessions_service_only"
ON public.clover_checkout_sessions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
