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

// =============================================================================
// Email Helper (optional - gracefully skips if not configured)
// =============================================================================

type EmailParams = {
  userId: string;
  customerDisplayName: string | null;
  vendorSlug: string;
  snapshotId: string;
  orderId: string;
  order: Record<string, unknown>;
  locationId: string;
  items: Array<{ id: string; name: string; quantity: number; price: number; modifiers: unknown[] }>;
  total: number;
  currency: string;
  dataClient: ReturnType<typeof getServerDataClient>;
  logger: ReturnType<typeof createLogger>;
};

async function sendOrderConfirmationEmail(params: EmailParams) {
  const { userId, customerDisplayName, vendorSlug, snapshotId, orderId, order, locationId, items, total, currency, dataClient, logger: log } = params;
  
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) return;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const customerEmail = authUser?.user?.email;
    
    if (!customerEmail) return;
    
    // Get location for pickup instructions
    const vendorLocation = await dataClient.getVendorLocationBySquareId(locationId);
    
    // Use order reference ID for shortcode (last 4 chars)
    const referenceId = order?.referenceId as string | undefined;
    const shortcode = referenceId?.slice(-4).toUpperCase() || orderId.slice(-4).toUpperCase();
    
    // Call email service via HTTP instead of importing package
    // This avoids TypeScript issues with optional packages
    const emailPayload = {
      customerEmail,
      customerName: customerDisplayName || 'Customer',
      vendorName: vendorSlug || 'Restaurant',
      orderId: snapshotId,
      shortcode,
      items: items.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
      total,
      currency,
      pickupInstructions: vendorLocation?.pickupInstructions,
      estimatedWaitMinutes: 15
    };
    
    // For now, just log that we would send email
    // Real implementation would call Resend API directly
    log.info('Order confirmation email queued', { email: customerEmail, shortcode });
    
    // Direct Resend API call
    if (process.env.RESEND_API_KEY) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: `${emailPayload.vendorName} <orders@countrtop.com>`,
          to: emailPayload.customerEmail,
          subject: `Order Confirmed - ${emailPayload.vendorName} #${emailPayload.shortcode}`,
          html: generateOrderConfirmationHtml({
            ...emailPayload,
            pickupInstructions: emailPayload.pickupInstructions ?? undefined
          })
        })
      });
      
      if (!response.ok) {
        const error = await response.text();
        log.warn('Failed to send order confirmation email', { error });
      }
    }
  } catch (err) {
    log.warn('Failed to send order confirmation email', { error: err });
  }
}

function generateOrderConfirmationHtml(data: {
  customerName: string;
  vendorName: string;
  shortcode: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  total: number;
  currency: string;
  pickupInstructions?: string;
  estimatedWaitMinutes?: number;
}) {
  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: data.currency }).format(cents / 100);
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Order Confirmation</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f0f23; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f0f23; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px;">
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <h1 style="margin: 0; color: #667eea; font-size: 28px;">Order Confirmed! ✓</h1>
              <p style="margin: 10px 0 0; color: #a0a0a0;">${data.vendorName}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; text-align: center;">
              <div style="background: rgba(102, 126, 234, 0.1); border: 2px solid #667eea; border-radius: 12px; padding: 20px; display: inline-block;">
                <p style="margin: 0 0 8px; color: #a0a0a0; font-size: 14px;">Your Pickup Code</p>
                <p style="margin: 0; color: #667eea; font-size: 48px; font-weight: 800; letter-spacing: 4px;">${data.shortcode}</p>
              </div>
            </td>
          </tr>
          ${data.estimatedWaitMinutes ? `
          <tr>
            <td style="padding: 10px 40px; text-align: center;">
              <p style="margin: 0; color: #e8e8e8; font-size: 18px;">⏱️ Estimated wait: <strong>${data.estimatedWaitMinutes} minutes</strong></p>
            </td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding: 30px 40px;">
              <h2 style="margin: 0 0 16px; color: #e8e8e8; font-size: 18px;">Order Summary</h2>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${data.items.map(item => `
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <span style="color: #a78bfa; font-weight: 700;">${item.quantity}×</span>
                    <span style="color: #e8e8e8; margin-left: 8px;">${item.name}</span>
                  </td>
                  <td style="padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; color: #e8e8e8;">
                    ${formatCurrency(item.price * item.quantity)}
                  </td>
                </tr>
                `).join('')}
                <tr>
                  <td style="padding: 16px 0 0; color: #e8e8e8; font-weight: 700; font-size: 18px;">Total</td>
                  <td style="padding: 16px 0 0; text-align: right; color: #667eea; font-weight: 700; font-size: 18px;">
                    ${formatCurrency(data.total)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${data.pickupInstructions ? `
          <tr>
            <td style="padding: 0 40px 30px;">
              <div style="background: rgba(52, 199, 89, 0.1); border: 1px solid rgba(52, 199, 89, 0.3); border-radius: 8px; padding: 16px;">
                <p style="margin: 0 0 8px; color: #34c759; font-weight: 600;">📍 Pickup Instructions</p>
                <p style="margin: 0; color: #e8e8e8;">${data.pickupInstructions}</p>
              </div>
            </td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding: 30px 40px; background: rgba(0,0,0,0.2); text-align: center;">
              <p style="margin: 0; color: #666; font-size: 12px;">Powered by CountrTop</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

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

        // Send order confirmation email (async, don't wait)
        // Email functionality is optional - gracefully skip if not configured
        if (process.env.RESEND_API_KEY) {
          sendOrderConfirmationEmail({
            userId,
            customerDisplayName,
            vendorSlug: vendor.slug,
            snapshotId: snapshot.id,
            orderId,
            order,
            locationId,
            items,
            total,
            currency,
            dataClient,
            logger
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

