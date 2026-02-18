import type { NextApiRequest, NextApiResponse } from 'next';
import { randomBytes } from 'crypto';
import { decryptSignupCookie } from '../prepare';

const SQUARE_SCOPES =
  'MERCHANT_PROFILE_READ ORDERS_READ ORDERS_WRITE PAYMENTS_READ PAYMENTS_WRITE LOCATIONS_READ ITEMS_READ';

function getRedirectUri(req: NextApiRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
  const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? 'localhost:3000';
  return `${proto}://${host}/api/square-oauth/callback`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const cookieRaw = req.cookies?.signup_pending;
  if (!cookieRaw) {
    return res.redirect(302, '/signup?error=session_expired');
  }

  const decoded = decodeURIComponent(cookieRaw);
  const payload = decryptSignupCookie(decoded);
  if (!payload) {
    return res.redirect(302, '/signup?error=session_expired');
  }

  const env = (process.env.SQUARE_ENVIRONMENT ?? 'sandbox').toLowerCase() as 'sandbox' | 'production';
  const clientId =
    env === 'production'
      ? process.env.SQUARE_APPLICATION_ID
      : process.env.SQUARE_SANDBOX_APPLICATION_ID;

  if (!clientId) {
    return res.redirect(302, '/signup?error=not_configured');
  }

  const baseUrl =
    env === 'production'
      ? 'https://connect.squareup.com/oauth2/authorize'
      : 'https://connect.squareupsandbox.com/oauth2/authorize';

  const csrf = randomBytes(16).toString('hex');
  const state = Buffer.from(JSON.stringify({ intent: 'signup', csrf }), 'utf8').toString('base64url');

  const isProd = process.env.NODE_ENV === 'production';
  res.setHeader(
    'Set-Cookie',
    `square_oauth_state=${csrf}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${isProd ? '; Secure' : ''}`
  );

  const redirectUri = getRedirectUri(req);
  const params = new URLSearchParams({
    client_id: clientId,
    scope: process.env.SQUARE_OAUTH_SCOPES ?? SQUARE_SCOPES,
    session: 'false',
    state
  });
  if (redirectUri) params.set('redirect_uri', redirectUri);

  const url = `${baseUrl}?${params.toString()}`;
  return res.redirect(302, url);
}
