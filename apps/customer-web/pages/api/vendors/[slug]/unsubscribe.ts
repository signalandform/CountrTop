import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerDataClient } from '../../../../lib/dataClient';

const normalizeSlug = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const normalizeEmail = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const UNSUBSCRIBED_HTML = (vendorName: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribed</title>
</head>
<body style="margin: 0; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #FFF8F0; color: #1A1A2E;">
  <div style="max-width: 480px; margin: 0 auto; text-align: center;">
    <h1 style="font-size: 24px; margin: 0 0 16px;">You're unsubscribed</h1>
    <p style="margin: 0; color: #64748B; font-size: 16px;">
      You've been unsubscribed from promotional emails from ${escapeHtml(vendorName)}.
    </p>
  </div>
</body>
</html>
`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * GET /api/vendors/[slug]/unsubscribe?email=...
 * Records unsubscribe for vendor promotional emails (CRM). No auth required.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const slug = normalizeSlug(req.query.slug);
  const email = normalizeEmail(req.query.email);

  if (!slug || !email || !email.includes('@')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(400).send(
      '<!DOCTYPE html><html><body><p>Invalid request. Use the unsubscribe link from the email.</p></body></html>'
    );
  }

  try {
    const dataClient = getServerDataClient();
    const vendor = await dataClient.getVendorBySlug(slug);
    if (!vendor) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send(
        '<!DOCTYPE html><html><body><p>Vendor not found.</p></body></html>'
      );
    }

    await dataClient.recordVendorEmailUnsubscribe(vendor.id, email);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(UNSUBSCRIBED_HTML(vendor.displayName));
  } catch (err) {
    console.error('Unsubscribe error:', err);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send(
      '<!DOCTYPE html><html><body><p>Something went wrong. Please try again later.</p></body></html>'
    );
  }
}
