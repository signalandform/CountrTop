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

import { createLogger } from '@countrtop/api-client';
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

export async function handleSquareWebhook(
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

  if (signatureKey && notificationUrl) {
    try {
      signatureValid = isValidSquareSignature(rawBody, signatureHeader, signatureKey, notificationUrl);
      if (!signatureValid) {
        trackValidationFailure(`square_${signatureKey.substring(0, 8)}`);
        logger.error('Square signature validation failed', new Error('Invalid signature'));
      }
    } catch (error) {
      signatureValid = false;
      logger.error('Square signature validation threw error', error instanceof Error ? error : new Error(String(error)));
      trackValidationFailure('square_error');
    }
  } else if (process.env.NODE_ENV === 'production') {
    logger.error('Missing Square signature configuration in production');
    signatureValid = false;
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

  const eventId = event?.event_id as string | undefined;
  if (!eventId || typeof eventId !== 'string') {
    return {
      response: { ok: false, status: 'invalid', reason: 'Missing event_id', provider: 'square' },
      statusCode: 400
    };
  }

  const eventType: string = (event?.type as string) ?? 'unknown';

  const dataClient = getServerDataClient();
  const { created, webhookEvent } = await dataClient.insertWebhookEventIfNew({
    provider: 'square',
    eventId,
    eventType,
    payload: event
  });

  let orderId: string | undefined;
  let locationId: string | undefined;

  if (eventType === 'order.updated') {
    const dataObj = event?.data as Record<string, unknown> | undefined;
    const objData = dataObj?.object as Record<string, unknown> | undefined;
    const orderUpdated = objData?.order_updated as Record<string, unknown> | undefined;
    const orderObj = orderUpdated?.order as Record<string, unknown> | undefined;
    orderId = (orderUpdated?.order_id ?? orderObj?.id) as string | undefined;
    locationId = (orderObj?.location_id ?? orderUpdated?.location_id) as string | undefined;
  } else if (eventType === 'payment.updated') {
    const payment = normalizeSquarePayment(parseSquarePayment(event));
    orderId = payment.orderId ?? undefined;
    locationId = payment.locationId ?? undefined;
  } else {
    await dataClient.updateWebhookEventStatus(webhookEvent.id, { status: 'ignored' });
    return {
      response: { ok: true, status: 'ignored', reason: 'Not an order or payment event', provider: 'square', signatureValid },
      statusCode: 200
    };
  }

  if (!orderId || !locationId) {
    await dataClient.updateWebhookEventStatus(webhookEvent.id, { status: 'ignored' });
    return {
      response: { ok: true, status: 'ignored', reason: 'Missing order metadata', provider: 'square', signatureValid },
      statusCode: 200
    };
  }

  const vendor = await dataClient.getVendorBySquareLocationId(locationId);
  if (!vendor) {
    await dataClient.updateWebhookEventStatus(webhookEvent.id, { status: 'ignored' });
    return {
      response: { ok: true, status: 'ignored', reason: 'Unknown vendor location', provider: 'square', signatureValid },
      statusCode: 200
    };
  }

  await dataClient.enqueueWebhookJob({
    provider: 'square',
    eventId,
    webhookEventId: webhookEvent.id
  });

  logger.info('Square webhook enqueued', { eventId, eventType, orderId, created });
  return {
    response: { ok: true, status: 'processed', reason: 'Enqueued', provider: 'square', signatureValid },
    statusCode: 200
  };
}

// =============================================================================
// Toast Webhook Handler
// =============================================================================

type ToastWebhookPayload = {
  eventType: string;
  eventTime: string;
  eventId: string;
  restaurantGuid: string;
  data?: {
    orderGuid?: string;
    paymentGuid?: string;
    [key: string]: unknown;
  };
};

async function handleToastWebhook(
  req: NextApiRequest,
  rawBody: string
): Promise<{ response: WebhookResponse; statusCode: number }> {
  // Verify signature if configured
  const signingKey = process.env.TOAST_WEBHOOK_SECRET;
  const signature = req.headers['toast-signature'] as string | undefined;
  
  let signatureValid = true;
  if (signingKey && signature) {
    const expectedSignature = crypto.createHmac('sha256', signingKey).update(rawBody).digest('base64');
    signatureValid = signature === expectedSignature;
    if (!signatureValid) {
      logger.warn('Toast signature validation failed');
    }
  } else if (process.env.NODE_ENV === 'production' && !signingKey) {
    logger.warn('Toast webhook signature key not configured');
  }

  let payload: ToastWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return {
      response: { ok: false, status: 'invalid', reason: 'Invalid JSON payload', provider: 'toast' },
      statusCode: 400
    };
  }

  const restaurantGuid = payload.restaurantGuid;
  if (!restaurantGuid) {
    return {
      response: { ok: true, status: 'ignored', reason: 'No restaurant GUID', provider: 'toast', signatureValid },
      statusCode: 200
    };
  }

  const dataClient = getServerDataClient();

  // Find vendor by Toast restaurantGuid (stored in externalLocationId via vendor_locations)
  const location = await dataClient.getVendorLocationBySquareId(restaurantGuid);
  if (!location) {
    logger.info(`Unknown Toast restaurant: ${restaurantGuid}`);
    return {
      response: { ok: true, status: 'ignored', reason: 'Unknown restaurant', provider: 'toast', signatureValid },
      statusCode: 200
    };
  }

  const vendor = await dataClient.getVendorById(location.vendorId);
  if (!vendor) {
    return {
      response: { ok: true, status: 'ignored', reason: 'Vendor not found', provider: 'toast', signatureValid },
      statusCode: 200
    };
  }

  // Handle different Toast event types
  const eventType = payload.eventType?.toUpperCase() || '';
  const orderGuid = payload.data?.orderGuid;
  const paymentGuid = payload.data?.paymentGuid;

  if (eventType.includes('ORDER') && orderGuid) {
    try {
      logger.info(`Toast order event: ${eventType} for order ${orderGuid}`, {
        restaurantGuid,
        vendorId: vendor.id
      });

      // TODO: Fetch full order from Toast and process
      // const adapter = getAdapterForLocation(location, vendor);
      // const order = await adapter.fetchOrder(orderGuid);
      // await dataClient.upsertToastOrder(order);
      // await dataClient.ensureKitchenTicketForOpenOrder(order);
    } catch (error) {
      logger.error(`Failed to process Toast order ${orderGuid}`, error instanceof Error ? error : new Error(String(error)));
    }
  }

  if (eventType.includes('PAYMENT') && paymentGuid) {
    logger.info(`Toast payment event: ${eventType} for payment ${paymentGuid}`, {
      restaurantGuid,
      vendorId: vendor.id
    });
    // Payment handling would be similar to Square
  }

  return {
    response: { ok: true, status: 'processed', provider: 'toast', signatureValid },
    statusCode: 200
  };
}

// =============================================================================
// Clover Webhook Handler
// =============================================================================

type CloverWebhookPayload = {
  appId: string;
  merchants: {
    [merchantId: string]: Array<{
      type: string;
      objectId: string;
      ts: number;
    }>;
  };
};

async function handleCloverWebhook(
  req: NextApiRequest,
  rawBody: string
): Promise<{ response: WebhookResponse; statusCode: number }> {
  // Verify signature if configured
  const signingKey = process.env.CLOVER_WEBHOOK_SIGNING_KEY;
  const signature = req.headers['x-clover-signature'] as string | undefined;
  
  let signatureValid = true;
  if (signingKey && signature) {
    const expectedSignature = crypto.createHmac('sha256', signingKey).update(rawBody).digest('hex');
    signatureValid = signature === expectedSignature;
    if (!signatureValid) {
      logger.warn('Clover signature validation failed');
    }
  } else if (process.env.NODE_ENV === 'production' && !signingKey) {
    logger.warn('Clover webhook signature key not configured');
  }

  let payload: CloverWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return {
      response: { ok: false, status: 'invalid', reason: 'Invalid JSON payload', provider: 'clover' },
      statusCode: 400
    };
  }

  // Clover sends events grouped by merchant
  const merchantIds = Object.keys(payload.merchants || {});
  if (merchantIds.length === 0) {
    return {
      response: { ok: true, status: 'ignored', reason: 'No merchant events', provider: 'clover', signatureValid },
      statusCode: 200
    };
  }

  const dataClient = getServerDataClient();

  // Process events for each merchant
  for (const merchantId of merchantIds) {
    const events = payload.merchants[merchantId] || [];
    
    // Find vendor by Clover merchantId (stored in externalLocationId via vendor_locations)
    const location = await dataClient.getVendorLocationBySquareId(merchantId);
    if (!location) {
      logger.info(`Unknown Clover merchant: ${merchantId}`);
      continue;
    }

    const vendor = await dataClient.getVendorById(location.vendorId);
    if (!vendor) {
      continue;
    }

    for (const event of events) {
      // Handle order events
      if (event.type.startsWith('O:')) {
        const orderId = event.objectId;
        
        try {
          // For order updates, we need to fetch the full order from Clover
          // This would require the CloverAdapter - for now we just log
          logger.info(`Clover order event: ${event.type} for order ${orderId}`, {
            merchantId,
            vendorId: vendor.id
          });

          // TODO: Fetch order from Clover and process like Square
          // const adapter = getAdapterForLocation(location, vendor);
          // const order = await adapter.fetchOrder(orderId);
          // await dataClient.upsertCloverOrder(order);
          // await dataClient.ensureKitchenTicketForOpenOrder(order);
        } catch (error) {
          logger.error(`Failed to process Clover order ${orderId}`, error instanceof Error ? error : new Error(String(error)));
        }
      }

      // Handle payment events
      if (event.type.startsWith('P:')) {
        const paymentId = event.objectId;
        logger.info(`Clover payment event: ${event.type} for payment ${paymentId}`, {
          merchantId,
          vendorId: vendor.id
        });
        // Payment handling would be similar to Square
      }
    }
  }

  return {
    response: { ok: true, status: 'processed', provider: 'clover', signatureValid },
    statusCode: 200
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

