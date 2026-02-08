import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerDataClient } from '../../lib/dataClient';

const normalizeSlug = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type StatePayload = { slug?: string; csrf: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const code = normalizeSlug(req.query.code);
  const stateRaw = normalizeSlug(req.query.state);
  const merchantId = normalizeSlug(req.query.merchant_id);

  let state: StatePayload;
  try {
    state = JSON.parse(Buffer.from(stateRaw || '', 'base64url').toString('utf8')) as StatePayload;
  } catch {
    return res.redirect(302, '/vendors?clover=error&reason=invalid_state');
  }

  if (!code || !stateRaw) {
    return res.redirect(302, '/vendors?clover=error&reason=missing_params');
  }

  const cookieState = req.cookies?.clover_oauth_state;
  if (!cookieState || cookieState !== state.csrf) {
    return res.redirect(302, '/vendors?clover=error&reason=csrf_mismatch');
  }

  res.setHeader('Set-Cookie', 'clover_oauth_state=; Path=/; Max-Age=0');

  const slug = state.slug;
  if (!slug) {
    return res.redirect(302, '/vendors?clover=error&reason=invalid_state');
  }

  const appId = process.env.CLOVER_APP_ID;
  const appSecret = process.env.CLOVER_APP_SECRET;
  if (!appId || !appSecret) {
    return res.redirect(302, `/vendors/${slug}/settings?clover=error&reason=not_configured`);
  }

  const env = (process.env.CLOVER_ENVIRONMENT ?? 'sandbox').toLowerCase() as 'sandbox' | 'production';
  const tokenBaseUrl =
    env === 'production' ? 'https://api.clover.com' : 'https://apisandbox.dev.clover.com';

  const tokenRes = await fetch(`${tokenBaseUrl}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: appId,
      client_secret: appSecret,
      code
    })
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error('Clover OAuth token exchange failed:', tokenRes.status, errText);
    return res.redirect(302, `/vendors/${slug}/settings?clover=error&reason=token_exchange`);
  }

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
  };
  const accessToken = tokenJson.access_token;
  const refreshToken = tokenJson.refresh_token;

  if (!accessToken || !refreshToken) {
    return res.redirect(302, `/vendors/${slug}/settings?clover=error&reason=no_tokens`);
  }

  const dataClient = getServerDataClient();
  const vendor = await dataClient.getVendorBySlug(slug);
  if (!vendor) {
    return res.redirect(302, '/vendors?clover=error&reason=vendor_not_found');
  }

  await dataClient.setVendorCloverIntegration(vendor.id, env, {
    merchantId: merchantId ?? null,
    accessToken,
    refreshToken,
    connectionStatus: 'connected',
    lastError: null
  });

  const effectiveMerchantId = merchantId ?? null;
  if (effectiveMerchantId) {
    const locations = await dataClient.listVendorLocations(vendor.id);
    const hasLocation = locations.some(
      (l) => l.externalLocationId === effectiveMerchantId || l.squareLocationId === effectiveMerchantId
    );
    if (!hasLocation) {
      try {
        await dataClient.createVendorLocation({
          vendorId: vendor.id,
          externalLocationId: effectiveMerchantId,
          squareLocationId: effectiveMerchantId,
          posProvider: 'clover',
          name: 'Clover location',
          isPrimary: true,
          isActive: true,
          onlineOrderingEnabled: true
        });
      } catch (e) {
        console.error('Failed to create Clover vendor location:', e);
      }
    }
  }

  return res.redirect(302, `/vendors/${slug}/settings?clover=connected`);
}
