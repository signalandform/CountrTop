/**
 * Unified POS Webhook Handler
 * 
 * Routes webhooks from different POS providers (Square, Toast, Clover)
 * to their respective handlers while maintaining a consistent response format.
 * 
 * Routes:
 *   POST /api/webhooks/square  -> Square webhook handler
 *   POST /api/webhooks/toast   -> Toast webhook handler (future)
 *   POST /api/webhooks/clover  -> Clover webhook handler (future)
 */

import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

import { createLogger, getSquareOrder } from '@countrtop/api-client';
import type { POSProvider } from '@countrtop/models';
import { getServerDataClient } from '../../../lib/dataClient';

const logger = createLogger({ requestId: 'webhook' });

export const config = {
  api: {
    bodyParser: false
  }
};

// =============================================================================
// Types
// =============================================================================

type WebhookResponse = {
  ok: boolean;
  status: 'processed' | 'ignored' | 'invalid' | 'unsupported';
  reason?: string;
  signatureValid?: boolean;
  provider?: POSProvider;
};

// Future use for unified webhook result tracking
// type CanonicalWebhookResult = {
//   processed: boolean;
//   orderId?: string;
//   locationId?: string;
//   vendorId?: string;
//   error?: string;
// };

// =============================================================================
// Utilities
// =============================================================================

const bufferRequest = (req: NextApiRequest): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });

// In-memory tracking for validation failures
const validationFailureCounts = new Map<string, number>();
const ALERT_THRESHOLD = 5;
const ALERT_WINDOW_MS = 60 * 60 * 1000;

const trackValidationFailure = (key: string) => {
  const now = Date.now();
  const count = validationFailureCounts.get(key) || 0;
  validationFailureCounts.set(key, count + 1);

  if (count + 1 >= ALERT_THRESHOLD) {
    const alertKey = `alert_${key}`;
    const lastAlert = validationFailureCounts.get(alertKey) || 0;
    if (now - lastAlert > ALERT_WINDOW_MS) {
      logger.error('Repeated signature validation failures detected', undefined, {
        key,
        count: count + 1,
        threshold: ALERT_THRESHOLD
      });
      validationFailureCounts.set(alertKey, now);
    }
  }

  setTimeout(() => {
    validationFailureCounts.delete(key);
  }, ALERT_WINDOW_MS);
};

const formatError = (error: unknown): string => {
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

// =============================================================================
// Square Webhook Handler
// =============================================================================

const isValidSquareSignature = (
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

const parseSquarePayment = (event: Record<string, unknown>) => {
  const dataObject = (event?.data as Record<string, unknown>)?.object as Record<string, unknown> ?? {};
  return (dataObject.payment as Record<string, unknown>) ?? dataObject;
};

const normalizeSquarePayment = (payment: Record<string, unknown>) => ({
  id: payment?.id as string | null ?? null,
  status: payment?.status as string | null ?? null,
  orderId: (payment?.orderId ?? payment?.order_id) as string | null ?? null,
  locationId: (payment?.locationId ?? payment?.location_id) as string | null ?? null,
  createdAt: (payment?.createdAt ?? payment?.created_at) as string | null ?? null,
  amountMoney: (payment?.amountMoney ?? payment?.amount_money) as Record<string, unknown> | null ?? null
});

const parseUserIdFromReference = (referenceId: string | null | undefined) => {
  if (!referenceId) return null;
  const parts = referenceId.split('__');
  if (parts.length < 2) return null;
  return parts.slice(1).join('__') || null;
};

async function handleSquareWebhook(
  req: NextApiRequest,
  rawBody: string
): Promise<{ response: WebhookResponse; statusCode: number }> {
  const signatureHeader = req.headers['x-square-hmacsha256-signature'];
  if (!signatureHeader || Array.isArray(signatureHeader)) {
    return {
      response: { ok: false, status: 'invalid', reason: 'Missing signature header', provider: 'square' },
      statusCode: 400
    };
  }

  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const notificationUrl = process.env.SQUARE_WEBHOOK_URL;

  let signatureValid = true;
  let signatureError: Error | null = null;

  if (signatureKey && notificationUrl) {
    try {
      signatureValid = isValidSquareSignature(rawBody, signatureHeader, signatureKey, notificationUrl);
      if (!signatureValid) {
        signatureError = new Error('Invalid signature');
        trackValidationFailure(`square_${signatureKey.substring(0, 8)}`);
        logger.error('Square signature validation failed', signatureError);
      }
    } catch (error) {
      signatureValid = false;
      signatureError = error instanceof Error ? error : new Error(String(error));
      logger.error('Square signature validation threw error', signatureError);
      trackValidationFailure('square_error');
    }
  } else if (process.env.NODE_ENV === 'production') {
    logger.error('Missing Square signature configuration in production');
    signatureValid = false;
    signatureError = new Error('Webhook signature configuration missing');
  } else {
    logger.warn('Square signature validation skipped (development mode)');
    signatureValid = true;
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return {
      response: { ok: false, status: 'invalid', reason: 'Invalid JSON payload', provider: 'square' },
      statusCode: 400
    };
  }

  const eventType: string = (event?.type as string) ?? 'unknown';

  // Extract order info from event
  let orderId: string | undefined;
  let locationId: string | undefined;
  let isPaymentEvent = false;
  let payment: ReturnType<typeof normalizeSquarePayment> | null = null;

  if (eventType === 'order.updated') {
    const dataObj = event?.data as Record<string, unknown> | undefined;
    const objData = dataObj?.object as Record<string, unknown> | undefined;
    const orderUpdated = objData?.order_updated as Record<string, unknown> | undefined;
    const orderObj = orderUpdated?.order as Record<string, unknown> | undefined;
    orderId = (orderUpdated?.order_id ?? orderObj?.id) as string | undefined;
    locationId = (orderObj?.location_id ?? orderUpdated?.location_id) as string | undefined;
  } else if (eventType === 'payment.updated') {
    isPaymentEvent = true;
    payment = normalizeSquarePayment(parseSquarePayment(event));
    orderId = payment.orderId ?? undefined;
    locationId = payment.locationId ?? undefined;
  } else {
    return {
      response: { ok: true, status: 'ignored', reason: 'Not an order or payment event', provider: 'square', signatureValid },
      statusCode: 200
    };
  }

  if (!orderId || !locationId) {
    return {
      response: { ok: true, status: 'ignored', reason: 'Missing order metadata', provider: 'square', signatureValid },
      statusCode: 200
    };
  }

  const dataClient = getServerDataClient();
  const vendor = await dataClient.getVendorBySquareLocationId(locationId);
  if (!vendor) {
    return {
      response: { ok: true, status: 'ignored', reason: 'Unknown vendor location', provider: 'square', signatureValid },
      statusCode: 200
    };
  }

  // Fetch full order from Square
  let order: Record<string, unknown>;
  try {
    order = await getSquareOrder(vendor, orderId);
  } catch (error) {
    const message = formatError(error);
    logger.error(`Failed to fetch Square order ${orderId}`, error instanceof Error ? error : new Error(message));
    return {
      response: { ok: true, status: 'processed', reason: `Order fetch failed, will retry: ${message}`, provider: 'square', signatureValid },
      statusCode: 200
    };
  }

  // Process order ingestion
  try {
    await dataClient.upsertSquareOrderFromSquare(order);
  } catch (error) {
    logger.error(`Failed to upsert square order ${orderId}`, error instanceof Error ? error : new Error(String(error)));
  }

  try {
    await dataClient.ensureKitchenTicketForOpenOrder(order);
  } catch (error) {
    logger.error(`Failed to ensure kitchen ticket for order ${orderId}`, error instanceof Error ? error : new Error(String(error)));
  }

  try {
    await dataClient.updateTicketForTerminalOrderState(order);
  } catch (error) {
    logger.error(`Failed to update ticket for terminal state ${orderId}`, error instanceof Error ? error : new Error(String(error)));
  }

  // Legacy order_snapshots flow for payment.updated with COMPLETED status
  if (isPaymentEvent && payment && payment.status === 'COMPLETED') {
    const existing = await dataClient.getOrderSnapshotBySquareOrderId(vendor.id, orderId);
    if (existing) {
      return {
        response: { ok: true, status: 'processed', reason: 'Snapshot already exists', provider: 'square', signatureValid },
        statusCode: 200
      };
    }

    try {
      const items = ((order?.lineItems as unknown[]) ?? []).map((item: unknown) => {
        const i = item as Record<string, unknown>;
        return {
          id: (i.catalogObjectId ?? i.uid ?? i.name ?? 'item') as string,
          name: (i.name ?? 'Item') as string,
          quantity: Number(i.quantity ?? 1),
          price: Number((i.basePriceMoney as Record<string, unknown>)?.amount ?? 0),
          modifiers: ((i.modifiers as unknown[]) ?? []).map((m: unknown) => (m as Record<string, unknown>).name)
        };
      });

      const total = Number((order?.totalMoney as Record<string, unknown>)?.amount ?? payment.amountMoney?.amount ?? 0);
      const currency = ((order?.totalMoney as Record<string, unknown>)?.currency ?? payment.amountMoney?.currency ?? 'USD') as string;
      const orderMetadata = order?.metadata as Record<string, unknown> | undefined;
      const userId = (orderMetadata?.ct_user_id ?? parseUserIdFromReference(order?.referenceId as string | undefined)) as string | null;

      // Get user display name if userId exists
      let customerDisplayName: string | null = null;
      if (userId) {
        try {
          const supabaseUrl = process.env.SUPABASE_URL;
          const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (supabaseUrl && supabaseKey) {
            const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
              auth: { autoRefreshToken: false, persistSession: false }
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
          logger.warn('Failed to get user display name', { userId, error });
        }
      }

      const pickupLabel = customerDisplayName ?? `Order ${orderId.slice(-6).toUpperCase()}`;

      const snapshot = await dataClient.createOrderSnapshot({
        vendorId: vendor.id,
        userId: userId ?? null,
        externalOrderId: orderId, // POS-agnostic field
        squareOrderId: orderId, // Deprecated alias
        placedAt: (order?.createdAt ?? payment.createdAt ?? new Date().toISOString()) as string,
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

      return {
        response: {
          ok: true,
          status: 'processed',
          provider: 'square',
          signatureValid,
          ...(signatureError && { reason: `Processed with signature warning: ${signatureError.message}` })
        },
        statusCode: 200
      };
    } catch (error) {
      const message = formatError(error);
      return {
        response: { ok: false, status: 'invalid', reason: message, provider: 'square', signatureValid },
        statusCode: 500
      };
    }
  }

  return {
    response: { ok: true, status: 'processed', provider: 'square', signatureValid },
    statusCode: 200
  };
}

// =============================================================================
// Toast Webhook Handler (Placeholder)
// =============================================================================

async function handleToastWebhook(
  _req: NextApiRequest,
  _rawBody: string
): Promise<{ response: WebhookResponse; statusCode: number }> {
  // Suppress unused parameter warnings - these will be used when Toast is implemented
  void _req;
  void _rawBody;
  // TODO: Implement Toast webhook handling
  return {
    response: { ok: false, status: 'unsupported', reason: 'Toast webhooks not yet implemented', provider: 'toast' },
    statusCode: 501
  };
}

// =============================================================================
// Clover Webhook Handler (Placeholder)
// =============================================================================

async function handleCloverWebhook(
  _req: NextApiRequest,
  _rawBody: string
): Promise<{ response: WebhookResponse; statusCode: number }> {
  // Suppress unused parameter warnings - these will be used when Clover is implemented
  void _req;
  void _rawBody;
  // TODO: Implement Clover webhook handling
  return {
    response: { ok: false, status: 'unsupported', reason: 'Clover webhooks not yet implemented', provider: 'clover' },
    statusCode: 501
  };
}

// =============================================================================
// Main Handler
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WebhookResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, status: 'invalid', reason: 'Method not allowed' });
  }

  const { provider } = req.query;
  const providerStr = Array.isArray(provider) ? provider[0] : provider;

  if (!providerStr || !['square', 'toast', 'clover'].includes(providerStr)) {
    return res.status(400).json({
      ok: false,
      status: 'invalid',
      reason: `Invalid provider: ${providerStr}. Must be one of: square, toast, clover`
    });
  }

  const rawBody = await bufferRequest(req);

  logger.info(`Received ${providerStr} webhook`, {
    provider: providerStr,
    contentLength: rawBody.length
  });

  let result: { response: WebhookResponse; statusCode: number };

  switch (providerStr) {
    case 'square':
      result = await handleSquareWebhook(req, rawBody);
      break;
    case 'toast':
      result = await handleToastWebhook(req, rawBody);
      break;
    case 'clover':
      result = await handleCloverWebhook(req, rawBody);
      break;
    default:
      result = {
        response: { ok: false, status: 'invalid', reason: `Unknown provider: ${providerStr}` },
        statusCode: 400
      };
  }

  logger.info(`Webhook ${providerStr} processed`, {
    provider: providerStr,
    status: result.response.status,
    ok: result.response.ok
  });

  return res.status(result.statusCode).json(result.response);
}

