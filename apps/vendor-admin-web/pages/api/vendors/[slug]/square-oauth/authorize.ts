import type { NextApiRequest, NextApiResponse } from 'next';
import { randomBytes } from 'crypto';
import { requireVendorAdminApi } from '../../../../../lib/auth';
import { getServerDataClient } from '../../../../../lib/dataClient';

const SQUARE_SCOPES =
  'MERCHANT_PROFILE_READ ORDERS_READ ORDERS_WRITE PAYMENTS_READ PAYMENTS_WRITE LOCATIONS_READ ITEMS_READ';

const normalizeSlug = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const slug = normalizeSlug(req.query.slug);
  if (!slug) {
    return res.redirect(302, '/login?error=slug_required');
  }

  const authResult = await requireVendorAdminApi(req, res, slug);
  if (!authResult.authorized) {
    return res.redirect(302, `/login?error=${encodeURIComponent(authResult.error ?? 'unauthorized')}`);
  }

  const env = (process.env.SQUARE_ENVIRONMENT ?? 'sandbox').toLowerCase() as 'sandbox' | 'production';
  const clientId =
    env === 'production'
      ? process.env.SQUARE_APPLICATION_ID
      : process.env.SQUARE_SANDBOX_APPLICATION_ID;

  if (!clientId) {
    return res.status(500).json({
      error: 'Square OAuth not configured. Set SQUARE_APPLICATION_ID or SQUARE_SANDBOX_APPLICATION_ID.'
    });
  }

  const baseUrl =
    env === 'production'
      ? 'https://connect.squareup.com/oauth2/authorize'
      : 'https://connect.squareupsandbox.com/oauth2/authorize';

  const csrf = randomBytes(16).toString('hex');
  const state = Buffer.from(JSON.stringify({ slug, csrf }), 'utf8').toString('base64url');

  res.setHeader(
    'Set-Cookie',
    `square_oauth_state=${csrf}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`
  );

  const redirectUri = getRedirectUri(req);
  const params = new URLSearchParams({
    client_id: clientId,
    scope: SQUARE_SCOPES,
    session: 'false',
    state
  });
  if (redirectUri) params.set('redirect_uri', redirectUri);

  const url = `${baseUrl}?${params.toString()}`;
  return res.redirect(302, url);
}

function getRedirectUri(req: NextApiRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
  const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? 'localhost:3000';
  return `${proto}://${host}/api/square-oauth/callback`;
}
