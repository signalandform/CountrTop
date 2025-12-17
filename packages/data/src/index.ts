import { SupabaseClient } from '@supabase/supabase-js';

import { CreateOrderInput, DataClient, MenuItemInput, Subscription } from './dataClient';
import { createMockDataClient, MockDataClient, MockDataSeed } from './mockData';
import { Database, SupabaseDataClient } from './supabaseClient';

export * from './models';
export * from './dataClient';
export * from './supabaseClient';
export * from './mockData';
export * from './auth';

export type DataClientFactoryOptions = {
  supabase?: SupabaseClient<Database>;
  useMockData?: boolean;
  mockSeed?: MockDataSeed;
};

export const createDataClient = (options: DataClientFactoryOptions = {}): DataClient => {
  const { supabase, useMockData, mockSeed } = options;
  if (useMockData || !supabase) {
    return createMockDataClient(mockSeed);
  }
  return new SupabaseDataClient(supabase);
};

export type {
  CreateOrderInput,
  DataClient,
  Database,
  MenuItemInput,
  MockDataSeed,
  RewardActivityInput,
  Subscription
};
export { MockDataClient, SupabaseDataClient };
