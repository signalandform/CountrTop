import { createClient } from '@supabase/supabase-js';

import { createDataClient, Database, MockDataSeed } from '@countrtop/data';

const buildMockSeed = (): MockDataSeed => {
  const slug = process.env.DEFAULT_VENDOR_SLUG ?? 'sunset';
  const displayName = process.env.DEFAULT_VENDOR_NAME ?? 'Sunset Coffee Cart';
  const squareLocationId = process.env.SQUARE_LOCATION_ID;
  if (!squareLocationId) {
    throw new Error('SQUARE_LOCATION_ID is required when NEXT_PUBLIC_USE_MOCK_DATA=true');
  }
  const squareCredentialRefRaw = process.env.DEFAULT_VENDOR_SQUARE_CREDENTIAL_REF;
  const squareCredentialRef =
    squareCredentialRefRaw && squareCredentialRefRaw.trim().length > 0
      ? squareCredentialRefRaw.trim()
      : undefined;

  return {
    vendors: [
      {
        id: process.env.DEFAULT_VENDOR_ID ?? 'vendor_cafe',
        slug,
        displayName,
        squareLocationId,
        squareCredentialRef,
        status: 'active'
      }
    ]
  };
};

export const getServerDataClient = () => {
  const useMockData = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
  if (useMockData) {
    return createDataClient({ useMockData: true, mockSeed: buildMockSeed() });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when NEXT_PUBLIC_USE_MOCK_DATA=false');
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey);
  return createDataClient({ supabase });
};
