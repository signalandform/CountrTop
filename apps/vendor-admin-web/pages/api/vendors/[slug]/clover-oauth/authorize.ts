import type { NextApiRequest, NextApiResponse } from 'next';
import { randomBytes } from 'crypto';
import { requireVendorAdminApi } from '../../../../../lib/auth';

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

  const appId = process.env.CLOVER_APP_ID;
  if (!appId) {
    return res.redirect(302, `/vendors/${slug}/settings?clover=error&reason=not_configured`);
  }

  const env = (process.env.CLOVER_ENVIRONMENT ?? 'sandbox').toLowerCase() as 'sandbox' | 'production';
  const baseUrl =
    env === 'production'
      ? 'https://www.clover.com/oauth/v2/authorize'
      : 'https://sandbox.dev.clover.com/oauth/v2/authorize';

  const csrf = randomBytes(16).toString('hex');
  const state = Buffer.from(JSON.stringify({ slug, csrf }), 'utf8').toString('base64url');

  const redirectUri = getRedirectUri(req);
  res.setHeader(
    'Set-Cookie',
    `clover_oauth_state=${csrf}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`
  );

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state
  });
  const url = `${baseUrl}?${params.toString()}`;
  return res.redirect(302, url);
}

function getRedirectUri(req: NextApiRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
  const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? 'localhost:3000';
  return `${proto}://${host}/api/clover-oauth/callback`;
}
