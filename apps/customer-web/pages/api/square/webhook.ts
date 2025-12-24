import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';

import { getServerDataClient } from '../../../lib/dataClient';
import { squareClientForVendor } from '../../../lib/square';

export const config = {
  api: {
    bodyParser: false
  }
};

type WebhookResponse = {
  ok: boolean;
  status: 'processed' | 'ignored' | 'invalid';
  reason?: string;
};

const bufferRequest = (req: NextApiRequest): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });

const isValidSignature = (
  body: string,
  signature: string,
  signatureKey: string,
  notificationUrl: string
): boolean => {
  const payload = Buffer.from(notificationUrl + body, 'utf-8');
  const key = Buffer.from(signatureKey, 'utf-8');
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(payload);
  const digest = hmac.digest('base64');
  return digest === signature;
};

const parsePayment = (event: any) => {
  const dataObject = event?.data?.object ?? {};
  return dataObject.payment ?? dataObject;
};

const normalizePayment = (payment: any) => ({
  id: payment?.id ?? null,
  status: payment?.status ?? null,
  orderId: payment?.orderId ?? payment?.order_id ?? null,
  locationId: payment?.locationId ?? payment?.location_id ?? null,
  createdAt: payment?.createdAt ?? payment?.created_at ?? null,
  amountMoney: payment?.amountMoney ?? payment?.amount_money ?? null
});

const parseUserIdFromReference = (referenceId: string | null | undefined) => {
  if (!referenceId) return null;
  const parts = referenceId.split('__');
  if (parts.length < 2) return null;
  return parts.slice(1).join('__') || null;
};

const formatSquareError = (error: unknown) => {
  if (error && typeof error === 'object') {
    const withErrors = error as { errors?: unknown; result?: { errors?: unknown } };
    if (withErrors.errors) {
      return JSON.stringify(withErrors.errors);
    }
    if (withErrors.result?.errors) {
      return JSON.stringify(withErrors.result.errors);
    }
    try {
      return JSON.stringify(error, Object.getOwnPropertyNames(error));
    } catch {
      return '[object Object]';
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error ?? 'Unknown error');
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<WebhookResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, status: 'invalid', reason: 'Method not allowed' });
  }

  const signatureHeader = req.headers['x-square-hmacsha256-signature'];
  if (!signatureHeader || Array.isArray(signatureHeader)) {
    return res.status(400).json({ ok: false, status: 'invalid', reason: 'Missing signature header' });
  }

  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const notificationUrl = process.env.SQUARE_WEBHOOK_URL;
  const rawBody = await bufferRequest(req);

  if (signatureKey && notificationUrl) {
    const valid = isValidSignature(rawBody, signatureHeader, signatureKey, notificationUrl);
    if (!valid) {
      return res.status(400).json({ ok: false, status: 'invalid', reason: 'Invalid signature' });
    }
  } else if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({
      ok: false,
      status: 'invalid',
      reason: 'Webhook signature configuration missing'
    });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch (error) {
    return res.status(400).json({ ok: false, status: 'invalid', reason: 'Invalid JSON payload' });
  }

  const eventType: string = event?.type ?? 'unknown';
  if (!eventType.startsWith('payment.')) {
    return res.status(200).json({ ok: true, status: 'ignored', reason: 'Not a payment event' });
  }

  const payment = normalizePayment(parsePayment(event));
  if (!payment || payment.status !== 'COMPLETED') {
    return res.status(200).json({ ok: true, status: 'ignored', reason: 'Payment not completed' });
  }

  const orderId: string | undefined = payment.orderId ?? undefined;
  const locationId: string | undefined = payment.locationId ?? undefined;
  if (!orderId || !locationId) {
    return res.status(200).json({ ok: true, status: 'ignored', reason: 'Missing order metadata' });
  }

  const dataClient = getServerDataClient();
  const vendor = await dataClient.getVendorBySquareLocationId(locationId);
  if (!vendor) {
    return res.status(200).json({ ok: true, status: 'ignored', reason: 'Unknown vendor location' });
  }

  const existing = await dataClient.getOrderSnapshotBySquareOrderId(vendor.id, orderId);
  if (existing) {
    return res.status(200).json({ ok: true, status: 'processed', reason: 'Snapshot already exists' });
  }

  try {
    const square = squareClientForVendor(vendor);
    let order;
    try {
      const { result } = await square.ordersApi.retrieveOrder(orderId);
      order = result.order;
    } catch (error) {
      const message = formatSquareError(error);
      return res.status(500).json({
        ok: false,
        status: 'invalid',
        reason: `Order lookup failed: ${message}`
      });
    }

    const items =
      order?.lineItems?.map((item) => ({
        id: item.catalogObjectId ?? item.uid ?? item.name ?? 'item',
        name: item.name ?? 'Item',
        quantity: Number(item.quantity ?? 1),
        price: Number(item.basePriceMoney?.amount ?? 0),
        modifiers: item.modifiers?.map((modifier) => modifier.name)
      })) ?? [];

    const total = Number(order?.totalMoney?.amount ?? payment.amountMoney?.amount ?? 0);
    const currency = order?.totalMoney?.currency ?? payment.amountMoney?.currency ?? 'USD';

    const userId = order?.metadata?.ct_user_id ?? parseUserIdFromReference(order?.referenceId);
    const snapshot = await dataClient.createOrderSnapshot({
      vendorId: vendor.id,
      userId: userId ?? null,
      squareOrderId: orderId,
      placedAt: order?.createdAt ?? payment.createdAt ?? new Date().toISOString(),
      snapshotJson: {
        items,
        total,
        currency,
        squarePaymentId: payment.id,
        squareLocationId: locationId,
        squareReferenceId: order?.referenceId ?? null
      }
    });

    if (userId) {
      const points = Math.max(0, Math.floor(total / 100));
      if (points > 0) {
        await dataClient.recordLoyaltyEntry({
          id: crypto.randomUUID(),
          vendorId: vendor.id,
          userId,
          orderId: snapshot.id,
          pointsDelta: points
        });
      }
    }

    return res.status(200).json({ ok: true, status: 'processed' });
  } catch (error) {
    const message = formatSquareError(error);
    return res.status(500).json({ ok: false, status: 'invalid', reason: message });
  }
}
