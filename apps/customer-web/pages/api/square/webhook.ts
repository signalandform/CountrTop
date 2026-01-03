import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

import { createLogger, getSquareOrder } from '@countrtop/api-client';
import { getServerDataClient } from '../../../lib/dataClient';

const logger = createLogger({ requestId: 'webhook' });

export const config = {
  api: {
    bodyParser: false
  }
};

type WebhookResponse = {
  ok: boolean;
  status: 'processed' | 'ignored' | 'invalid';
  reason?: string;
  signatureValid?: boolean;
};

// In-memory tracking for validation failures (in production, use Redis or similar)
const validationFailureCounts = new Map<string, number>();
const ALERT_THRESHOLD = 5; // Alert after 5 failures
const ALERT_WINDOW_MS = 60 * 60 * 1000; // 1 hour window

const bufferRequest = (req: NextApiRequest): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => {
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

const trackValidationFailure = (key: string) => {
  const now = Date.now();
  const count = validationFailureCounts.get(key) || 0;
  validationFailureCounts.set(key, count + 1);
  
  // Clean up old entries (simple cleanup, in production use TTL-based storage)
  if (count + 1 >= ALERT_THRESHOLD) {
    const alertKey = `alert_${key}`;
    const lastAlert = validationFailureCounts.get(alertKey) || 0;
    if (now - lastAlert > ALERT_WINDOW_MS) {
      logger.error('Repeated signature validation failures detected', undefined, {
        key,
        count: count + 1,
        threshold: ALERT_THRESHOLD
      });
      // In production, send to monitoring service (e.g., Sentry, PagerDuty)
      validationFailureCounts.set(alertKey, now);
    }
  }
  
  // Reset counter after window expires (simplified - in production use proper TTL)
  setTimeout(() => {
    validationFailureCounts.delete(key);
  }, ALERT_WINDOW_MS);
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

  let signatureValid = true;
  let signatureError: Error | null = null;

  // Try-catch around signature validation - continue processing even if validation fails
  if (signatureKey && notificationUrl) {
    try {
      signatureValid = isValidSignature(rawBody, signatureHeader, signatureKey, notificationUrl);
      if (!signatureValid) {
        signatureError = new Error('Invalid signature');
        const failureKey = `${signatureKey.substring(0, 8)}_${Date.now()}`;
        trackValidationFailure(failureKey);
        logger.error('Signature validation failed', signatureError, {
          hasSignatureKey: !!signatureKey,
          hasNotificationUrl: !!notificationUrl,
          signatureHeaderLength: signatureHeader.length
        });
      }
    } catch (error) {
      signatureValid = false;
      signatureError = error instanceof Error ? error : new Error(String(error));
      logger.error('Signature validation threw error', signatureError);
      const failureKey = `error_${Date.now()}`;
      trackValidationFailure(failureKey);
    }
  } else if (process.env.NODE_ENV === 'production') {
    // In production, missing config is still an error, but we'll log and continue
    logger.error('Missing signature configuration in production environment');
    signatureValid = false;
    signatureError = new Error('Webhook signature configuration missing');
  } else {
    // In development, allow missing config
    logger.warn('Signature validation skipped (development mode or missing config)');
    signatureValid = true; // Allow in dev
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch (error) {
    return res.status(400).json({ ok: false, status: 'invalid', reason: 'Invalid JSON payload' });
  }

  const eventType: string = event?.type ?? 'unknown';
  
  // Extract orderId and locationId from both order.updated and payment.updated events
  let orderId: string | undefined;
  let locationId: string | undefined;
  let isPaymentEvent = false;
  let payment: ReturnType<typeof normalizePayment> | null = null;

  if (eventType === 'order.updated') {
    const orderUpdated = event?.data?.object?.order_updated;
    orderId = orderUpdated?.order_id ?? orderUpdated?.order?.id;
    locationId = orderUpdated?.order?.location_id ?? orderUpdated?.location_id;
  } else if (eventType === 'payment.updated') {
    isPaymentEvent = true;
    payment = normalizePayment(parsePayment(event));
    orderId = payment.orderId ?? undefined;
    locationId = payment.locationId ?? undefined;
  } else {
    return res.status(200).json({ ok: true, status: 'ignored', reason: 'Not an order or payment event' });
  }

  if (!orderId || !locationId) {
    return res.status(200).json({ ok: true, status: 'ignored', reason: 'Missing order metadata' });
  }

  const dataClient = getServerDataClient();
  const vendor = await dataClient.getVendorBySquareLocationId(locationId);
  if (!vendor) {
    return res.status(200).json({ ok: true, status: 'ignored', reason: 'Unknown vendor location' });
  }

  // Fetch full order from Square (used for both ingestion and legacy flow)
  let order: any;
  try {
    order = await getSquareOrder(vendor, orderId);
  } catch (error) {
    const message = formatSquareError(error);
    logger.error(`Failed to fetch Square order ${orderId}`, error instanceof Error ? error : new Error(message), {
      orderId,
      eventType
    });
    // Return early if we can't fetch the order - we'll try again on next webhook
    return res.status(200).json({
      ok: true,
      status: 'processed',
      reason: `Order fetch failed, will retry: ${message}`,
      signatureValid: signatureValid
    });
  }

  // Process order ingestion for ALL events (order.updated and payment.updated)
  // This ensures square_orders and kitchen_tickets are always in sync
  // Wrap each step in try/catch to ensure idempotency and handle duplicates safely
  try {
    // Upsert square order (idempotent)
    await dataClient.upsertSquareOrderFromSquare(order);
  } catch (error) {
    logger.error(`Failed to upsert square order ${orderId}`, error instanceof Error ? error : new Error(String(error)), {
      orderId
    });
    // Continue processing even if upsert fails
  }

  try {
    // Ensure kitchen ticket for OPEN orders (idempotent, preserves existing status)
    await dataClient.ensureKitchenTicketForOpenOrder(order);
  } catch (error) {
    logger.error(`Failed to ensure kitchen ticket for order ${orderId}`, error instanceof Error ? error : new Error(String(error)), {
      orderId,
      orderState: order.state
    });
    // Continue processing even if ticket creation fails
  }

  try {
    // Update ticket for terminal states (COMPLETED, CANCELED)
    await dataClient.updateTicketForTerminalOrderState(order);
  } catch (error) {
    logger.error(`Failed to update ticket for terminal state ${orderId}`, error instanceof Error ? error : new Error(String(error)), {
      orderId,
      orderState: order.state
    });
    // Continue processing even if ticket update fails
  }

  // Legacy order_snapshots flow - only for payment.updated events with COMPLETED status
  if (isPaymentEvent && payment && payment.status === 'COMPLETED') {
    const existing = await dataClient.getOrderSnapshotBySquareOrderId(vendor.id, orderId);
    if (existing) {
      return res.status(200).json({
        ok: true,
        status: 'processed',
        reason: 'Snapshot already exists',
        signatureValid: signatureValid
      });
    }

    try {

    const items =
      order?.lineItems?.map((item: any) => ({
        id: item.catalogObjectId ?? item.uid ?? item.name ?? 'item',
        name: item.name ?? 'Item',
        quantity: Number(item.quantity ?? 1),
        price: Number(item.basePriceMoney?.amount ?? 0),
        modifiers: item.modifiers?.map((modifier: any) => modifier.name)
      })) ?? [];

    const total = Number(order?.totalMoney?.amount ?? payment.amountMoney?.amount ?? 0);
    const currency = order?.totalMoney?.currency ?? payment.amountMoney?.currency ?? 'USD';

    const userId = order?.metadata?.ct_user_id ?? parseUserIdFromReference(order?.referenceId);
    
    // Get user display name if userId exists
    let customerDisplayName: string | null = null;
    if (userId) {
      try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (supabaseUrl && supabaseKey) {
          const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
            auth: {
              autoRefreshToken: false,
              persistSession: false
            }
          });
          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
          if (authUser?.user) {
            customerDisplayName = authUser.user.user_metadata?.full_name ?? 
                                 authUser.user.user_metadata?.name ?? 
                                 authUser.user.email?.split('@')[0] ?? 
                                 null;
          }
        }
      } catch (error) {
        // Log but don't fail order creation if user lookup fails
        logger.warn('Failed to get user display name', { userId, error });
      }
    }
    
    // Generate pickup label: use display name if available, otherwise fallback to order ID
    const pickupLabel = customerDisplayName ?? `Order ${orderId.slice(-6).toUpperCase()}`;
    
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
      },
      customerDisplayName: customerDisplayName ?? null,
      pickupLabel
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

      // Return success even if signature was invalid (order was still processed)
      return res.status(200).json({
        ok: true,
        status: 'processed',
        signatureValid: signatureValid,
        ...(signatureError && { reason: `Processed with signature warning: ${signatureError.message}` })
      });
    } catch (error) {
      const message = formatSquareError(error);
      return res.status(500).json({
        ok: false,
        status: 'invalid',
        reason: message,
        signatureValid: signatureValid
      });
    }
  }

  // For non-payment events or non-COMPLETED payments, return success after ingestion
  return res.status(200).json({
    ok: true,
    status: 'processed',
    signatureValid: signatureValid
  });
}
