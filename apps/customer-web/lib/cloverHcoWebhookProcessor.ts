/**
 * Process Clover Hosted Checkout webhook: payment approved -> order_snapshot, pos_order, kitchen_ticket.
 * Called from POST /api/webhooks/clover-hco when payment status is APPROVED.
 */
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@countrtop/api-client';
import { sendOrderConfirmation } from '@countrtop/email';
import type { DataClient } from '@countrtop/data';

const logger = createLogger({ requestId: 'clover-hco-processor' });

export type CloverHcoWebhookPayload = {
  CreatedTime?: string;
  Message?: string;
  Status?: string;
  Type?: string;
  Id?: string;
  MerchantId?: string;
  Data?: string;
};

/**
 * Verify Clover-Signature header per docs: t=timestamp,v1=hmacSha256(timestamp + '.' + rawBody, secret)
 */
export function verifyCloverHcoSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  signingSecret: string
): boolean {
  if (!signatureHeader) return false;
  const parts = signatureHeader.split(',');
  let t: string | null = null;
  let v1: string | null = null;
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 't') t = value ?? null;
    if (key === 'v1') v1 = value ?? null;
  }
  if (!t || !v1) return false;
  const payload = `${t}.${rawBody}`;
  const hmac = crypto.createHmac('sha256', signingSecret);
  hmac.update(payload);
  const computed = hmac.digest('hex');
  return computed === v1;
}

export async function processCloverHcoPaymentApproved(
  sessionId: string,
  merchantId: string,
  paymentId: string | undefined,
  dataClient: DataClient
): Promise<void> {
  const session = await dataClient.getCloverCheckoutSessionBySessionId(sessionId);
  if (!session) {
    logger.info('Clover HCO: no session found for sessionId', { sessionId });
    return;
  }

  const { vendorId, vendorLocationId, ctReferenceId, snapshotJson } = session;
  const vendor = await dataClient.getVendorById(vendorId);
  if (!vendor) {
    logger.warn('Clover HCO: vendor not found', { vendorId });
    return;
  }

  const existing = await dataClient.getOrderSnapshotBySquareOrderId(vendorId, sessionId);
  if (existing) {
    logger.info('Clover HCO: order snapshot already exists', { sessionId });
    return;
  }

  const items = (snapshotJson?.items as Array<{ id: string; name: string; quantity: number; price: number }>) ?? [];
  const total = Number(snapshotJson?.total ?? 0);
  const currency = (snapshotJson?.currency as string) ?? 'USD';
  const userId = (snapshotJson?.userId as string) ?? null;

  const placedAt = new Date().toISOString();
  const externalOrderId = sessionId;

  const posOrderId = await dataClient.upsertPosOrder({
    provider: 'clover',
    vendorId,
    vendorLocationId,
    externalOrderId: sessionId,
    externalLocationId: merchantId,
    status: 'paid',
    source: 'countrtop_online',
    orderJson: {
      items,
      total,
      currency,
      source: 'countrtop_online',
      ctReferenceId,
      paymentId: paymentId ?? null
    }
  });

  await dataClient.ensureKitchenTicketForPosOrder({
    provider: 'clover',
    externalOrderId,
    locationId: merchantId,
    vendorId,
    vendorLocationId,
    posOrderId,
    status: 'paid',
    placedAt,
    ctReferenceId
  });

  const snapshotItems = items.map((i) => ({
    id: i.id,
    name: i.name,
    quantity: i.quantity,
    price: i.price,
    modifiers: [] as unknown[]
  }));

  const snapshot = await dataClient.createOrderSnapshot({
    vendorId,
    userId,
    externalOrderId,
    squareOrderId: externalOrderId,
    placedAt,
    snapshotJson: {
      items: snapshotItems,
      total,
      currency,
      customerEmail: null,
      customerName: null
    },
    customerDisplayName: null,
    pickupLabel: `Order ${ctReferenceId.slice(-6).toUpperCase()}`
  });

  if (userId) {
    const points = Math.max(0, Math.floor(total / 100));
    if (points > 0) {
      await dataClient.recordLoyaltyEntry({
        id: crypto.randomUUID(),
        vendorId,
        userId,
        orderId: snapshot.id,
        pointsDelta: points
      });
    }
    const redeemPoints = Number(snapshotJson?.redeemPoints ?? 0);
    if (!Number.isNaN(redeemPoints) && redeemPoints > 0) {
      const entries = await dataClient.listLoyaltyEntriesForUser(vendor.id, userId);
      const alreadyRedeemed = entries.some((e) => e.orderId === snapshot.id && e.pointsDelta < 0);
      if (!alreadyRedeemed) {
        await dataClient.recordLoyaltyEntry({
          id: crypto.randomUUID(),
          vendorId,
          userId,
          orderId: snapshot.id,
          pointsDelta: -redeemPoints
        });
      }
    }
  }

  if (process.env.RESEND_API_KEY) {
    let customerEmail: string | null = null;
    let customerName: string | null = null;
    if (userId) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && supabaseKey) {
        const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
          auth: { autoRefreshToken: false, persistSession: false }
        });
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
        customerEmail = authUser?.user?.email ?? null;
        customerName =
          authUser?.user?.user_metadata?.full_name ??
          authUser?.user?.user_metadata?.name ??
          authUser?.user?.email?.split('@')[0] ??
          null;
      }
    }
    if (customerEmail) {
      try {
        const shortcode = ctReferenceId.slice(-4).toUpperCase();
        await sendOrderConfirmation({
          customerEmail,
          customerName: customerName || 'Customer',
          vendorName: vendor.displayName || 'Restaurant',
          orderId: snapshot.id,
          shortcode,
          items: snapshotItems.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price })),
          total,
          currency,
          estimatedWaitMinutes: 15
        });
      } catch (err) {
        logger.warn('Clover HCO: failed to send order confirmation email', { err });
      }
    }
  }

  logger.info('Clover HCO order snapshot and ticket created', {
    sessionId,
    vendorId,
    snapshotId: snapshot.id,
    ctReferenceId
  });
}
