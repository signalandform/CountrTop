import { createClient } from '@supabase/supabase-js';

import { createDataClient, type Database } from '@countrtop/data';

export const getServerDataClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    db: { schema: 'public' },
    global: { headers: { 'x-client-info': 'countrtop-ops' } },
    auth: { persistSession: false }
  });
  return createDataClient({ supabase });
};
