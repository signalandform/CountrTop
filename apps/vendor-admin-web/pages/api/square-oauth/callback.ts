import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerDataClient } from '../../../lib/dataClient';
import { createSquareClientFromOAuthToken } from '@countrtop/api-client/square';

const normalizeSlug = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type StatePayload = { slug?: string; csrf: string; intent?: string };

function redirectSignupError(res: NextApiResponse, error: string) {
  return res.redirect(302, `/signup?error=${encodeURIComponent(error)}`);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const code = normalizeSlug(req.query.code);
  const stateRaw = normalizeSlug(req.query.state);
  const error = normalizeSlug(req.query.error);

  let state: StatePayload;
  try {
    state = JSON.parse(Buffer.from(stateRaw || '', 'base64url').toString('utf8')) as StatePayload;
  } catch {
    return res.redirect(302, '/vendors?square=error&reason=invalid_state');
  }

  const isSignup = state?.intent === 'signup';

  if (error === 'access_denied') {
    return isSignup ? redirectSignupError(res, 'denied') : res.redirect(302, '/vendors?square=denied');
  }

  if (!code || !stateRaw) {
    return isSignup ? redirectSignupError(res, 'missing_params') : res.redirect(302, '/vendors?square=error&reason=missing_params');
  }

  const cookieState = req.cookies?.square_oauth_state;
  if (!cookieState || cookieState !== state.csrf) {
    return isSignup ? redirectSignupError(res, 'csrf_mismatch') : res.redirect(302, '/vendors?square=error&reason=csrf_mismatch');
  }

  res.setHeader('Set-Cookie', 'square_oauth_state=; Path=/; Max-Age=0');

  // Signup via OAuth is disabled: new vendors must use the signup page (POS + intake + prepare).
  // Redirect to signup so they complete account creation with POS selection and intake.
  if (isSignup) {
    res.setHeader('Set-Cookie', 'signup_pending=; Path=/; Max-Age=0');
    return res.redirect(302, '/signup?error=use_signup_form');
  }

  const slug = state.slug;
  if (!slug) {
    return res.redirect(302, '/vendors?square=error&reason=invalid_state');
  }

  return handleConnectCallback(req, res, code, slug);
}

async function handleConnectCallback(
  req: NextApiRequest,
  res: NextApiResponse,
  code: string,
  slug: string
) {
  const env = (process.env.SQUARE_ENVIRONMENT ?? 'sandbox').toLowerCase() as 'sandbox' | 'production';
  const clientId =
    env === 'production'
      ? process.env.SQUARE_APPLICATION_ID ?? process.env.SQUARE_SANDBOX_APPLICATION_ID
      : process.env.SQUARE_SANDBOX_APPLICATION_ID ?? process.env.SQUARE_APPLICATION_ID;
  const clientSecret =
    clientId === process.env.SQUARE_APPLICATION_ID
      ? process.env.SQUARE_APPLICATION_SECRET
      : process.env.SQUARE_SANDBOX_APPLICATION_SECRET;

  if (!clientId || !clientSecret) {
    return res.redirect(302, `/vendors/${slug}/settings?square=error&reason=not_configured`);
  }

  const effectiveEnv = clientId === process.env.SQUARE_APPLICATION_ID ? 'production' : 'sandbox';

  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
  const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? 'localhost:3000';
  const redirectUri = `${proto}://${host}/api/square-oauth/callback`;

  const tokenUrl =
    effectiveEnv === 'production'
      ? 'https://connect.squareup.com/oauth2/token'
      : 'https://connect.squareupsandbox.com/oauth2/token';

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    })
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error('Square OAuth token exchange failed:', tokenRes.status, errText);
    return res.redirect(302, `/vendors/${slug}/settings?square=error&reason=token_exchange`);
  }

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    merchant_id?: string;
  };
  const accessToken = tokenJson.access_token;
  const refreshToken = tokenJson.refresh_token;
  const merchantId = tokenJson.merchant_id ?? null;

  if (!accessToken || !refreshToken) {
    return res.redirect(302, `/vendors/${slug}/settings?square=error&reason=no_tokens`);
  }

  const dataClient = getServerDataClient();
  const vendor = await dataClient.getVendorBySlug(slug);
  if (!vendor) {
    return res.redirect(302, '/vendors?square=error&reason=vendor_not_found');
  }

  const square = createSquareClientFromOAuthToken(accessToken, effectiveEnv);
  let locationIds: string[] = [];
  try {
    const { result } = await square.locationsApi.listLocations();
    if (result.locations) {
      locationIds = result.locations.map((loc) => loc.id ?? '').filter(Boolean);
    }
  } catch (e) {
    console.error('Square listLocations failed:', e);
  }

  const selectedLocationId = locationIds[0] ?? null;

  await dataClient.setVendorSquareIntegration(vendor.id, effectiveEnv, {
    squareAccessToken: accessToken,
    squareRefreshToken: refreshToken,
    squareMerchantId: merchantId,
    availableLocationIds: locationIds,
    selectedLocationId,
    connectionStatus: 'connected',
    lastError: null
  });

  if (selectedLocationId) {
    const locations = await dataClient.listVendorLocations(vendor.id);
    const hasLocation = locations.some(
      (l) => l.squareLocationId === selectedLocationId || l.externalLocationId === selectedLocationId
    );
    if (!hasLocation && locationIds.length > 0) {
      try {
        const locResult = await square.locationsApi.listLocations();
        const loc = locResult.result.locations?.[0];
        const name = loc?.name ?? 'Location';
        await dataClient.createVendorLocation({
          vendorId: vendor.id,
          externalLocationId: selectedLocationId,
          squareLocationId: selectedLocationId,
          posProvider: 'square',
          name,
          isPrimary: true,
          isActive: true,
          onlineOrderingEnabled: true
        });
      } catch (e) {
        console.error('Failed to create vendor location:', e);
      }
    }
  }

  return res.redirect(302, `/vendors/${slug}/settings?square=connected`);
}
