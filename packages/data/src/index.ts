import type { SupabaseClient } from '@supabase/supabase-js';

import {
  DataClient,
  LoyaltyLedgerEntryInput,
  OrderSnapshotInput,
  PushDeviceInput
} from './dataClient';
import { createMockDataClient, MockDataClient, MockDataSeed } from './mockData';
import type { Database } from './supabaseClient';

export * from './models';
export * from './dataClient';
export * from './supabaseClient';
export * from './mockData';
export * from './session';
export * from './vendor';

export type DataClientFactoryOptions = {
  supabase?: SupabaseClient<Database>;
  useMockData?: boolean;
  mockSeed?: MockDataSeed;
};

type SupabaseModule = typeof import('./supabaseClient');

let cachedSupabaseModule: SupabaseModule | null = null;
const loadSupabaseModule = (): SupabaseModule => {
  if (!cachedSupabaseModule) {
    cachedSupabaseModule = require('./supabaseClient');
  }
  return cachedSupabaseModule;
};

export const createDataClient = (options: DataClientFactoryOptions = {}): DataClient => {
  const { supabase, useMockData, mockSeed } = options;
  if (useMockData || !supabase) {
    return createMockDataClient(mockSeed);
  }
  const { SupabaseDataClient } = loadSupabaseModule();
  return new SupabaseDataClient(supabase);
};

export type {
  DataClient,
  Database,
  MockDataSeed,
  LoyaltyLedgerEntryInput,
  OrderSnapshotInput,
  PushDeviceInput
};
export { MockDataClient };

export const loadSupabaseDataClient = (): SupabaseModule['SupabaseDataClient'] =>
  loadSupabaseModule().SupabaseDataClient;
