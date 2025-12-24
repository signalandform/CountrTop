import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@countrtop/data';

let cachedClient: SupabaseClient<Database> | null = null;

export const getBrowserSupabaseClient = (): SupabaseClient<Database> | null => {
  if (cachedClient) return cachedClient;

  if (typeof window === 'undefined') {
    return null;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return null;
  }

  cachedClient = createClient<Database>(url, anonKey);
  return cachedClient;
};
