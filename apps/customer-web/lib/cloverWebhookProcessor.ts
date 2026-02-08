/**
 * Clover webhook processing logic.
 * Used by the background worker after events are persisted and enqueued.
 */
import { createLogger } from '@countrtop/api-client';
import { getAdapterForLocation } from '@countrtop/pos-adapters';
import type { CanonicalOrder } from '@countrtop/pos-adapters';
import type { DataClient, WebhookEvent } from '@countrtop/data';

const logger = createLogger({ requestId: 'clover-webhook-processor' });

/**
 * Process a Clover webhook event: fetch order, upsert pos_orders, ensure KDS ticket, handle cancel.
 * Throws on error so the worker can reschedule.
 */
export async function processCloverWebhookEvent(
  webhookEvent: WebhookEvent,
  dataClient: DataClient
): Promise<void> {
  const payload = webhookEvent.payload as Record<string, unknown>;
  const merchantId = payload?.merchantId as string | undefined;
  const event = payload?.event as { type?: string; objectId?: string; ts?: number } | undefined;

  if (!merchantId || !event) {
    return;
  }

  const eventType = event.type ?? '';
  if (!eventType.startsWith('O:')) {
    return; // Ignore P:* for MVP
  }

  const orderId = event.objectId;
  if (!orderId) {
    return;
  }

  const location = await dataClient.getVendorLocationByExternalId({
    provider: 'clover',
    externalLocationId: merchantId
  });
  if (!location) {
    logger.info(`Unknown Clover merchant: ${merchantId}`);
    return;
  }

  const vendor = await dataClient.getVendorById(location.vendorId);
  if (!vendor) {
    return;
  }

  const cloverEnv =
    (process.env.CLOVER_ENVIRONMENT ?? (process.env.NODE_ENV === 'production' ? 'production' : 'sandbox')) as
      | 'sandbox'
      | 'production';
  const cloverIntegration = await dataClient.getVendorCloverIntegration(vendor.id, cloverEnv);
  const adapter = getAdapterForLocation(location, vendor, { cloverIntegration });
  if (!adapter) {
    logger.warn(`No Clover adapter for location ${location.id}`);
    return;
  }

  const order = await adapter.fetchOrder(orderId) as CanonicalOrder | null;
  if (!order) {
    logger.warn(`Clover order not found: ${orderId}`);
    return;
  }

  const orderJson: Record<string, unknown> = {
    ...order,
    items: order.items,
    metadata: order.metadata,
    raw: order.raw
  };

  const posOrderId = await dataClient.upsertPosOrder({
    provider: 'clover',
    vendorId: vendor.id,
    vendorLocationId: location.id,
    externalOrderId: order.externalId,
    externalLocationId: order.locationId,
    status: order.status,
    source: order.source === 'countrtop_online' ? 'countrtop_online' : 'pos',
    orderJson
  });

  if (order.status === 'open') {
    await dataClient.ensureKitchenTicketForPosOrder({
      provider: 'clover',
      externalOrderId: order.externalId,
      locationId: order.locationId,
      vendorId: vendor.id,
      vendorLocationId: location.id,
      posOrderId,
      status: order.status,
      placedAt: order.createdAt
    });
  }

  const isDead = order.status === 'canceled' || isCloverOrderDead(order);
  if (isDead) {
    await dataClient.updateTicketForCloverCanceled({
      posOrderId,
      locationId: order.locationId
    });
  }
}

function isCloverOrderDead(order: CanonicalOrder): boolean {
  const raw = order.raw as Record<string, unknown> | undefined;
  if (!raw) return false;
  const state = raw.state as string | undefined;
  const payments = (raw.payments as { elements?: Array<{ result?: string }> })?.elements ?? [];
  const hasVoidedPayment = payments.some((p) => p.result === 'VOIDED' || p.result === 'VOIDING');
  if (hasVoidedPayment) return true;
  if (state === 'voided' || state === 'deleted') return true;
  return false;
}
