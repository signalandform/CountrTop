import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getServerDataClient } from '../../../lib/dataClient';
import { createSquareClientFromOAuthToken } from '@countrtop/api-client/square';
import type { Database } from '@countrtop/data';
import { decryptSignupCookie } from '../signup/prepare';

const normalizeSlug = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type StatePayload = { slug?: string; csrf: string; intent?: string };

function redirectSignupError(res: NextApiResponse, error: string) {
  return res.redirect(302, `/signup?error=${encodeURIComponent(error)}`);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/-+/g, '-') || 'store';
}

function randomAlphanumeric(len: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
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

  if (isSignup) {
    return handleSignupCallback(req, res, code);
  }

  const slug = state.slug;
  if (!slug) {
    return res.redirect(302, '/vendors?square=error&reason=invalid_state');
  }

  return handleConnectCallback(req, res, code, slug);
}

async function handleSignupCallback(req: NextApiRequest, res: NextApiResponse, code: string) {
  const cookieRaw = req.cookies?.signup_pending;
  if (!cookieRaw) {
    return redirectSignupError(res, 'session_expired');
  }
  const decoded = decodeURIComponent(cookieRaw);
  const payload = decryptSignupCookie(decoded);
  if (!payload) {
    return redirectSignupError(res, 'session_expired');
  }

  res.setHeader('Set-Cookie', 'signup_pending=; Path=/; Max-Age=0');

  const env = (process.env.SQUARE_ENVIRONMENT ?? 'sandbox').toLowerCase() as 'sandbox' | 'production';
  const clientId = env === 'production' ? process.env.SQUARE_APPLICATION_ID : process.env.SQUARE_SANDBOX_APPLICATION_ID;
  const clientSecret = env === 'production' ? process.env.SQUARE_APPLICATION_SECRET : process.env.SQUARE_SANDBOX_APPLICATION_SECRET;

  if (!clientId || !clientSecret) {
    return redirectSignupError(res, 'not_configured');
  }

  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
  const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? 'localhost:3000';
  const redirectUri = `${proto}://${host}/api/square-oauth/callback`;
  const tokenUrl = env === 'production' ? 'https://connect.squareup.com/oauth2/token' : 'https://connect.squareupsandbox.com/oauth2/token';

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, grant_type: 'authorization_code', redirect_uri: redirectUri })
  });

  if (!tokenRes.ok) {
    console.error('Square OAuth token exchange failed:', tokenRes.status, await tokenRes.text());
    return redirectSignupError(res, 'token_exchange');
  }

  const tokenJson = (await tokenRes.json()) as { access_token?: string; refresh_token?: string; merchant_id?: string };
  const accessToken = tokenJson.access_token;
  const refreshToken = tokenJson.refresh_token;
  const merchantId = tokenJson.merchant_id ?? null;

  if (!accessToken || !refreshToken) {
    return redirectSignupError(res, 'no_tokens');
  }

  const square = createSquareClientFromOAuthToken(accessToken, env);
  let locationIds: string[] = [];
  let displayName = payload.businessName?.trim() || 'My Store';

  try {
    const { result } = await square.locationsApi.listLocations();
    if (result.locations) {
      locationIds = result.locations.map((loc) => loc.id ?? '').filter(Boolean);
    }
  } catch (e) {
    console.error('Square listLocations failed:', e);
  }

  if (locationIds.length === 0) {
    return redirectSignupError(res, 'no_locations');
  }

  try {
    const merchantRes = await square.merchantsApi.retrieveMerchant('me');
    if (merchantRes.result?.merchant?.businessName) {
      displayName = merchantRes.result.merchant.businessName;
    }
  } catch {
    // use fallback displayName
  }

  const selectedLocationId = locationIds[0];

  let slug = slugify(displayName) + '_' + randomAlphanumeric(4);
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: existing } = await getSupabase()
      .from('vendors')
      .select('id')
      .eq('slug', slug)
      .single();
    if (!existing) break;
    slug = slugify(displayName) + '_' + randomAlphanumeric(6);
  }

  const { data: slugCheck } = await getSupabase().from('vendors').select('id').eq('slug', slug).single();
  if (slugCheck) {
    return redirectSignupError(res, 'slug_conflict');
  }

  const vendorId = `vendor_${slug}_${Date.now()}`;
  const supabase = getSupabase();

  const { error: vendorError } = await supabase.from('vendors').insert({
    id: vendorId,
    slug,
    display_name: displayName,
    pos_provider: 'square',
    square_location_id: selectedLocationId,
    square_credential_ref: null,
    status: 'active'
  });

  if (vendorError) {
    console.error('Signup vendor insert failed:', vendorError);
    return redirectSignupError(res, 'slug_conflict');
  }

  const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from('vendor_billing').insert({
    vendor_id: vendorId,
    plan_id: 'trial',
    trial_ends_at: trialEndsAt
  });

  const dataClient = getServerDataClient();
  await dataClient.setVendorSquareIntegration(vendorId, env, {
    squareAccessToken: accessToken,
    squareRefreshToken: refreshToken,
    squareMerchantId: merchantId,
    availableLocationIds: locationIds,
    selectedLocationId,
    connectionStatus: 'connected',
    lastError: null
  });

  try {
    const locResult = await square.locationsApi.listLocations();
    const loc = locResult.result.locations?.[0];
    const locName = loc?.name ?? 'Location';
    await dataClient.createVendorLocation({
      vendorId: vendorId,
      externalLocationId: selectedLocationId,
      squareLocationId: selectedLocationId,
      posProvider: 'square',
      name: locName,
      isPrimary: true,
      isActive: true,
      onlineOrderingEnabled: true
    });
  } catch (e) {
    console.error('Failed to create vendor location:', e);
  }

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true
  });

  if (authError) {
    if (authError.message?.toLowerCase().includes('already') || authError.code === 'user_already_exists') {
      return redirectSignupError(res, 'email_exists');
    }
    console.error('Signup createUser failed:', authError);
    return redirectSignupError(res, 'slug_conflict');
  }

  if (!authData?.user?.id) {
    return redirectSignupError(res, 'slug_conflict');
  }

  await supabase.from('vendors').update({ admin_user_id: authData.user.id }).eq('id', vendorId);

  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: payload.email
  });

  if (linkError || !linkData?.properties?.action_link) {
    return res.redirect(302, `/login?signup=success&email=${encodeURIComponent(payload.email)}`);
  }

  return res.redirect(302, linkData.properties.action_link);
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient<Database>(url, key, { auth: { persistSession: false } });
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
