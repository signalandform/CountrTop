import { createDataClient, DataClient } from '@countrtop/data';

let cachedClient: DataClient | null = null;

export const getDataClient = (): DataClient => {
  if (cachedClient) return cachedClient;

  const useMockData = process.env.EXPO_PUBLIC_USE_MOCK_DATA !== 'false';
  cachedClient = createDataClient({ useMockData });
  return cachedClient;
};
