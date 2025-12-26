import { randomUUID } from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';

import { getServerDataClient } from '../../../../lib/dataClient';
import { squareClientForVendor } from '../../../../lib/square';

type CheckoutItem = {
  id: string;
  name: string;
  price: number;
  currency: string;
  quantity: number;
  variationId: string;
};

type CheckoutRequest = {
  items: CheckoutItem[];
  userId?: string | null;
};

type CheckoutResponse =
  | { ok: true; checkoutUrl: string; orderId: string; squareOrderId: string }
  | { ok: false; error: string };

const normalizeSlug = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const getBaseUrl = (req: NextApiRequest) => {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http';
  const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host ?? 'localhost:3000';
  return `${proto}://${host}`;
};

const buildReferenceId = () => `ct_${randomUUID()}`;

export default async function handler(req: NextApiRequest, res: NextApiResponse<CheckoutResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const slug = normalizeSlug(req.query.slug);
  if (!slug) {
    return res.status(400).json({ ok: false, error: 'Vendor slug required' });
  }

  const body = req.body as CheckoutRequest;
  if (!body?.items?.length) {
    return res.status(400).json({ ok: false, error: 'Cart items required' });
  }
  if (body.items.some((item) => item.quantity <= 0)) {
    return res.status(400).json({ ok: false, error: 'Invalid item quantity' });
  }

  const dataClient = getServerDataClient();
  const vendor = await dataClient.getVendorBySlug(slug);
  if (!vendor) {
    return res.status(404).json({ ok: false, error: 'Vendor not found' });
  }

  const orderReferenceId = buildReferenceId();
  const baseUrl = getBaseUrl(req);
  const redirectUrl = `${baseUrl}/checkout/confirm?orderId=${encodeURIComponent(orderReferenceId)}`;

  const useMockData = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== 'false';
  if (useMockData) {
    return res.status(200).json({
      ok: true,
      checkoutUrl: redirectUrl,
      orderId: orderReferenceId,
      squareOrderId: `mock_${orderReferenceId}`
    });
  }

  try {
    const square = squareClientForVendor(vendor);

    const { result } = await square.checkoutApi.createPaymentLink({
      idempotencyKey: randomUUID(),
      order: {
        locationId: vendor.squareLocationId,
        referenceId: orderReferenceId,
        ...(body.userId ? { metadata: { ct_user_id: body.userId } } : {}),
        lineItems: body.items.map((item) => ({
          catalogObjectId: item.variationId,
          quantity: item.quantity.toString()
        }))
      },
      checkoutOptions: {
        redirectUrl
      }
    });

    const checkoutUrl = result.paymentLink?.url;
    const squareOrderId = result.paymentLink?.orderId ?? '';

    if (!checkoutUrl || !squareOrderId) {
      return res.status(500).json({ ok: false, error: 'Square checkout did not return a URL.' });
    }

    return res.status(200).json({
      ok: true,
      checkoutUrl,
      orderId: orderReferenceId,
      squareOrderId
    });
  } catch (error: any) {
    console.error('Square createPaymentLink error:', JSON.stringify(error, null, 2));
    const message =
      error?.result?.errors?.map((entry: { code?: string; detail?: string }) => `${entry.code}: ${entry.detail ?? ''}`).join(' | ') ||
      error?.errors?.map((entry: { code?: string; detail?: string }) => `${entry.code}: ${entry.detail ?? ''}`).join(' | ') ||
      error?.message ||
      'Failed to create checkout link';
    return res.status(500).json({ ok: false, error: message });
  }
}
