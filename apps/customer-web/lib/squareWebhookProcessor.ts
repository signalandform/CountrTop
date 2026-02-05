/**
 * Shared Square webhook processing logic.
 * Used by the background worker after events are persisted and enqueued.
 */
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

import { createLogger, getSquareOrder } from '@countrtop/api-client';
import { sendOrderConfirmation } from '@countrtop/email';
import type { DataClient, WebhookEvent } from '@countrtop/data';

const logger = createLogger({ requestId: 'square-webhook-processor' });

// =============================================================================
// Parsing helpers
// =============================================================================

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

function extractSquareCustomerEmail(order: Record<string, unknown>): string | null {
  const fulfillments = order?.fulfillments as Array<Record<string, unknown>> | undefined;
  if (fulfillments?.length) {
    const pickup = fulfillments[0]?.pickupDetails as Record<string, unknown> | undefined;
    const recipient = pickup?.recipient as Record<string, unknown> | undefined;
    if (recipient?.emailAddress) return recipient.emailAddress as string;
  }
  const customer = order?.customer as Record<string, unknown> | undefined;
  if (customer?.emailAddress) return customer.emailAddress as string;
  return null;
}

function extractSquareCustomerName(order: Record<string, unknown>): string | null {
  const fulfillments = order?.fulfillments as Array<Record<string, unknown>> | undefined;
  if (fulfillments?.length) {
    const pickup = fulfillments[0]?.pickupDetails as Record<string, unknown> | undefined;
    const recipient = pickup?.recipient as Record<string, unknown> | undefined;
    if (recipient?.displayName) return recipient.displayName as string;
  }
  const customer = order?.customer as Record<string, unknown> | undefined;
  if (customer?.givenName || customer?.familyName) {
    return [customer.givenName, customer.familyName].filter(Boolean).join(' ');
  }
  return null;
}

// =============================================================================
// Email helper
// =============================================================================

type EmailParams = {
  userId: string | null;
  customerDisplayName: string | null;
  customerEmail: string | null;
  vendorSlug: string;
  vendorDisplayName: string;
  snapshotId: string;
  orderId: string;
  order: Record<string, unknown>;
  locationId: string;
  items: Array<{ id: string; name: string; quantity: number; price: number; modifiers: unknown[] }>;
  total: number;
  currency: string;
  dataClient: DataClient;
};

async function sendOrderConfirmationEmail(params: EmailParams) {
  const { userId, customerDisplayName, customerEmail: providedEmail, vendorDisplayName, snapshotId, orderId, order, locationId, items, total, currency, dataClient } = params;
  try {
    let customerEmail = providedEmail;
    let customerName = customerDisplayName;
    if (userId && !customerEmail) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && supabaseKey) {
        const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
          auth: { autoRefreshToken: false, persistSession: false }
        });
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
        customerEmail = authUser?.user?.email ?? null;
        if (!customerName) {
          customerName = authUser?.user?.user_metadata?.full_name ??
            authUser?.user?.user_metadata?.name ??
            authUser?.user?.email?.split('@')[0] ?? null;
        }
      }
    }
    if (!customerEmail) {
      logger.info('No customer email found for order confirmation', { userId: userId ?? undefined, orderId });
      return;
    }
    const vendorLocation = await dataClient.getVendorLocationBySquareId(locationId);
    const referenceId = order?.referenceId as string | undefined;
    const shortcode = referenceId?.slice(-4).toUpperCase() || orderId.slice(-4).toUpperCase();
    logger.info('Sending order confirmation email', { email: customerEmail, shortcode });
    const result = await sendOrderConfirmation({
      customerEmail,
      customerName: customerName || 'Customer',
      vendorName: vendorDisplayName || 'Restaurant',
      orderId: snapshotId,
      shortcode,
      items: items.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
      total,
      currency,
      pickupInstructions: vendorLocation?.pickupInstructions ?? undefined,
      estimatedWaitMinutes: 15
    });
    if (!result.success) logger.warn('Failed to send order confirmation email', { error: result.error });
  } catch (err) {
    logger.warn('Failed to send order confirmation email', { error: err });
  }
}

// =============================================================================
// Main processor
// =============================================================================

/**
 * Process a Square webhook event: fetch order, upsert, sync KDS tickets, handle payment completion.
 * Throws on error so the worker can reschedule.
 */
export async function processSquareWebhookEvent(
  webhookEvent: WebhookEvent,
  dataClient: DataClient
): Promise<void> {
  const payload = webhookEvent.payload as Record<string, unknown>;
  const eventType: string = (payload?.type as string) ?? 'unknown';

  let orderId: string | undefined;
  let locationId: string | undefined;
  let isPaymentEvent = false;
  let payment: ReturnType<typeof normalizeSquarePayment> | null = null;

  if (eventType === 'order.updated') {
    const dataObj = payload?.data as Record<string, unknown> | undefined;
    const objData = dataObj?.object as Record<string, unknown> | undefined;
    const orderUpdated = objData?.order_updated as Record<string, unknown> | undefined;
    const orderObj = orderUpdated?.order as Record<string, unknown> | undefined;
    orderId = (orderUpdated?.order_id ?? orderObj?.id) as string | undefined;
    locationId = (orderObj?.location_id ?? orderUpdated?.location_id) as string | undefined;
  } else if (eventType === 'payment.updated') {
    isPaymentEvent = true;
    payment = normalizeSquarePayment(parseSquarePayment(payload));
    orderId = payment.orderId ?? undefined;
    locationId = payment.locationId ?? undefined;
  } else {
    return; // Ignored event type, nothing to do
  }

  if (!orderId || !locationId) {
    return; // Missing metadata, nothing to do
  }

  const vendor = await dataClient.getVendorBySquareLocationId(locationId);
  if (!vendor) {
    return; // Unknown vendor, ignore
  }

  const order = await getSquareOrder(vendor, orderId);

  await dataClient.upsertSquareOrderFromSquare(order);
  await dataClient.ensureKitchenTicketForOpenOrder(order);
  await dataClient.updateTicketForTerminalOrderState(order);

  if (isPaymentEvent && payment && payment.status === 'COMPLETED') {
    const existing = await dataClient.getOrderSnapshotBySquareOrderId(vendor.id, orderId);
    if (existing) return;

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
              authUser.user.email?.split('@')[0] ?? null;
          }
        }
      } catch (error) {
        logger.warn('Failed to get user display name', { userId, error });
      }
    }

    const squareEmail = extractSquareCustomerEmail(order);
    const squareName = extractSquareCustomerName(order);
    const pickupLabel = customerDisplayName ?? `Order ${orderId.slice(-6).toUpperCase()}`;

    const snapshot = await dataClient.createOrderSnapshot({
      vendorId: vendor.id,
      userId: userId ?? null,
      externalOrderId: orderId,
      squareOrderId: orderId,
      placedAt: (order?.createdAt ?? payment.createdAt ?? new Date().toISOString()) as string,
      snapshotJson: {
        items,
        total,
        currency,
        squarePaymentId: payment.id,
        squareLocationId: locationId,
        squareReferenceId: order?.referenceId ?? null,
        customerEmail: squareEmail,
        customerName: customerDisplayName || squareName
      },
      customerDisplayName: customerDisplayName ?? squareName ?? null,
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
      const redeemPointsRaw = orderMetadata?.ct_redeem_points;
      const redeemPoints = typeof redeemPointsRaw === 'string' ? parseInt(redeemPointsRaw, 10) : Number(redeemPointsRaw);
      if (!Number.isNaN(redeemPoints) && redeemPoints > 0) {
        const entries = await dataClient.listLoyaltyEntriesForUser(vendor.id, userId);
        const alreadyRedeemed = entries.some((e) => e.orderId === snapshot.id && e.pointsDelta < 0);
        if (!alreadyRedeemed) {
          await dataClient.recordLoyaltyEntry({
            id: crypto.randomUUID(),
            vendorId: vendor.id,
            userId,
            orderId: snapshot.id,
            pointsDelta: -redeemPoints
          });
        }
      }
    }

    if (process.env.RESEND_API_KEY) {
      sendOrderConfirmationEmail({
        userId: userId ?? null,
        customerDisplayName: customerDisplayName || squareName,
        customerEmail: squareEmail,
        vendorSlug: vendor.slug,
        vendorDisplayName: vendor.displayName,
        snapshotId: snapshot.id,
        orderId,
        order,
        locationId,
        items,
        total,
        currency,
        dataClient
      });
    }
  }
}
