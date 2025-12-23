import { createClient } from '@supabase/supabase-js';

import { createDataClient, Database } from '@countrtop/data';

export const getServerDataClient = () => {
  const useMockData = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== 'false';
  if (useMockData) {
    return createDataClient({ useMockData: true });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return createDataClient({ useMockData: true });
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey);
  return createDataClient({ supabase });
};
