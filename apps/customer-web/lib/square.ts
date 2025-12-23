import { Client, Environment } from 'square';

import { Vendor } from '@countrtop/models';

const resolveEnvironment = (): Environment => {
  const value = (process.env.SQUARE_ENVIRONMENT ?? 'sandbox').toLowerCase();
  return value === 'production' ? Environment.Production : Environment.Sandbox;
};

const normalizeCredentialRef = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');

const resolveAccessToken = (vendor: Vendor) => {
  if (vendor.squareCredentialRef) {
    const refKey = `SQUARE_ACCESS_TOKEN_${normalizeCredentialRef(vendor.squareCredentialRef)}`;
    const refToken = process.env[refKey];
    if (refToken) return refToken;
  }

  return process.env.SQUARE_ACCESS_TOKEN ?? null;
};

export const squareClientForVendor = (vendor: Vendor) => {
  const accessToken = resolveAccessToken(vendor);
  if (!accessToken) {
    throw new Error('Square access token not configured for vendor.');
  }

  return new Client({
    accessToken,
    environment: resolveEnvironment()
  });
};
