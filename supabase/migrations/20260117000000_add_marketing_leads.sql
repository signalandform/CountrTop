-- Marketing leads table for waitlist signups
CREATE TABLE IF NOT EXISTS public.marketing_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  business_name TEXT,
  source TEXT DEFAULT 'website',
  status TEXT DEFAULT 'new',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT marketing_leads_email_unique UNIQUE (email)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_marketing_leads_email ON public.marketing_leads(email);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_status ON public.marketing_leads(status);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_created ON public.marketing_leads(created_at DESC);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_marketing_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_marketing_leads_updated_at ON public.marketing_leads;
CREATE TRIGGER set_marketing_leads_updated_at
  BEFORE UPDATE ON public.marketing_leads
  FOR EACH ROW
  EXECUTE FUNCTION update_marketing_leads_updated_at();

-- RLS (disabled for service role access only)
ALTER TABLE public.marketing_leads ENABLE ROW LEVEL SECURITY;

-- Only allow service role to access this table
CREATE POLICY "Service role can manage marketing_leads"
  ON public.marketing_leads
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.marketing_leads IS 'Waitlist and lead capture from marketing site';
