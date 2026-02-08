import { randomUUID } from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';

import { createLogger } from '@countrtop/api-client';
import { getAdapterForLocation } from '@countrtop/pos-adapters';
import { getServerDataClient } from '../../../../lib/dataClient';
import { rateLimiters } from '../../../../lib/rateLimit';
import { getSquareClientForVendorOrLegacy } from '../../../../lib/square';

const logger = createLogger({ requestId: 'checkout' });

const cloverEnv = (process.env.CLOVER_ENVIRONMENT ?? (process.env.NODE_ENV === 'production' ? 'production' : 'sandbox')) as 'sandbox' | 'production';

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
  locationId?: string | null;
  /** Loyalty points to redeem for order discount (requires userId, loyalty enabled, valid balance) */
  redeemPoints?: number;
  /** ISO timestamp for scheduled pickup (when location has scheduled_orders_enabled) */
  scheduledPickupAt?: string | null;
  /** Client-generated idempotency key for Square createPaymentLink; stable across retries to prevent double charges */
  idempotencyKey?: string | null;
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

async function handler(req: NextApiRequest, res: NextApiResponse<CheckoutResponse>) {
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

  const redeemPoints = typeof body.redeemPoints === 'number' ? Math.floor(body.redeemPoints) : 0;
  let discountCents = 0;
  const currency = body.items[0]?.currency ?? 'USD';

  if (redeemPoints > 0) {
    if (!body.userId) {
      return res.status(400).json({ ok: false, error: 'Sign in required to redeem points' });
    }
    const loyaltyEnabled = await dataClient.getVendorFeatureFlag(vendor.id, 'customer_loyalty_enabled');
    if (!loyaltyEnabled) {
      return res.status(400).json({ ok: false, error: 'Loyalty redemption is not enabled' });
    }
    const balance = await dataClient.getLoyaltyBalance(vendor.id, body.userId);
    if (redeemPoints > balance) {
      return res.status(400).json({ ok: false, error: 'Not enough points to redeem' });
    }
    const settings = await dataClient.getVendorLoyaltySettings(vendor.id);
    if (redeemPoints < settings.minPointsToRedeem || redeemPoints > settings.maxPointsPerOrder) {
      return res.status(400).json({
        ok: false,
        error: `Redeem between ${settings.minPointsToRedeem} and ${settings.maxPointsPerOrder} points`
      });
    }
    const orderTotalCents = body.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    discountCents = Math.min(redeemPoints * settings.centsPerPoint, orderTotalCents);
    if (discountCents <= 0) {
      return res.status(400).json({ ok: false, error: 'Discount amount must be greater than zero' });
    }
  }

  const orderReferenceId = buildReferenceId();
  const baseUrl = getBaseUrl(req);
  const redirectUrl = `${baseUrl}/checkout/confirm?orderId=${encodeURIComponent(orderReferenceId)}`;

  const useMockData = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
  if (useMockData) {
    return res.status(200).json({
      ok: true,
      checkoutUrl: redirectUrl,
      orderId: orderReferenceId,
      squareOrderId: `mock_${orderReferenceId}`
    });
  }

  try {
    const locations = await dataClient.listVendorLocations(vendor.id);
    const matchedLocation = body.locationId
      ? locations.find(
          (loc) => loc.squareLocationId === body.locationId || loc.externalLocationId === body.locationId
        ) ?? null
      : locations.find((l) => l.isPrimary) ?? locations[0] ?? null;

    if (!matchedLocation) {
      return res.status(400).json({ ok: false, error: 'No pickup location configured' });
    }
    if (matchedLocation.onlineOrderingEnabled === false) {
      return res.status(400).json({ ok: false, error: 'Online ordering is disabled for this location' });
    }

    const locationId = matchedLocation.externalLocationId ?? matchedLocation.squareLocationId;
    const posProvider = matchedLocation.posProvider ?? 'square';

    const leadTimeMinutes = matchedLocation.onlineOrderingLeadTimeMinutes ?? 15;
    const scheduledPickupAt = typeof body.scheduledPickupAt === 'string' && body.scheduledPickupAt.trim()
      ? body.scheduledPickupAt.trim()
      : null;

    if (scheduledPickupAt) {
      const pickupDate = new Date(scheduledPickupAt);
      if (Number.isNaN(pickupDate.getTime())) {
        return res.status(400).json({ ok: false, error: 'Invalid scheduled pickup time' });
      }
      if (pickupDate.getTime() <= Date.now()) {
        return res.status(400).json({ ok: false, error: 'Scheduled pickup must be in the future' });
      }
      const maxDays = matchedLocation.scheduledOrderLeadDays ?? 7;
      const maxMs = maxDays * 24 * 60 * 60 * 1000;
      if (pickupDate.getTime() - Date.now() > maxMs) {
        return res.status(400).json({ ok: false, error: `Scheduled pickup cannot be more than ${maxDays} days in advance` });
      }
    }

    if (posProvider === 'clover') {
      if (!locationId) {
        return res.status(400).json({ ok: false, error: 'Clover location not configured' });
      }
      const cloverIntegration = await dataClient.getVendorCloverIntegration(vendor.id, cloverEnv);
      if (!cloverIntegration?.accessToken) {
        return res.status(403).json({
          ok: false,
          error: 'Vendor must connect Clover. Please ask the restaurant to connect Clover in their admin dashboard.'
        });
      }
      const adapter = getAdapterForLocation(matchedLocation, vendor, { cloverIntegration });
      if (!adapter) {
        return res.status(503).json({ ok: false, error: 'Clover checkout unavailable.' });
      }

      const orderTotalCents = body.items.reduce((sum, i) => sum + i.price * i.quantity, 0) - discountCents;
      const checkoutInput = {
        locationId,
        items: body.items.map((item) => ({
          catalogItemId: item.id,
          variationId: item.variationId,
          quantity: item.quantity,
          name: item.name,
          priceCents: item.price,
          note: undefined
        })),
        redirectUrl,
        metadata: {
          ct_reference_id: orderReferenceId,
          ...(body.userId && { ct_user_id: body.userId }),
          ...(redeemPoints > 0 && { ct_redeem_points: String(redeemPoints) }),
          ...(scheduledPickupAt && { ct_scheduled_pickup_at: scheduledPickupAt })
        } as Record<string, unknown>,
        ...(body.userId && { customerEmail: undefined })
      };

      const result = await adapter.createCheckout(checkoutInput);

      await dataClient.createCloverCheckoutSession({
        sessionId: result.orderId,
        vendorId: vendor.id,
        vendorLocationId: matchedLocation.id,
        ctReferenceId: orderReferenceId,
        snapshotJson: {
          items: body.items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, price: i.price })),
          total: orderTotalCents,
          currency,
          userId: body.userId ?? null,
          redeemPoints: redeemPoints > 0 ? redeemPoints : null,
          scheduledPickupAt: scheduledPickupAt ?? null
        }
      });

      return res.status(200).json({
        ok: true,
        checkoutUrl: result.checkoutUrl,
        orderId: orderReferenceId,
        squareOrderId: result.orderId
      });
    }

    if (!locationId || locationId === 'SQUARE_LOCATION_DEMO') {
      return res.status(400).json({ ok: false, error: 'Vendor Square location id not configured' });
    }

    const paymentsStatus = await dataClient.getSquarePaymentsActivationStatus(vendor.id);
    if (paymentsStatus && paymentsStatus.activated === false) {
      return res.status(400).json({
        ok: false,
        error:
          'This restaurant is not yet ready to accept orders. Please try again later.'
      });
    }

    let square;
    try {
      square = await getSquareClientForVendorOrLegacy(vendor, dataClient);
    } catch {
      return res.status(403).json({
        ok: false,
        error:
          'Vendor must connect Square. Please ask the restaurant to connect Square in their admin dashboard.'
      });
    }

    logger.debug('Square checkout initiated', {
      slug,
      useMockData,
      vendorId: vendor?.id,
      vendorSquareLocationId: vendor?.squareLocationId,
      locationId
    });

    const orderMetadata: Record<string, string> = {};
    if (body.userId) orderMetadata.ct_user_id = body.userId;
    if (redeemPoints > 0) orderMetadata.ct_redeem_points = String(redeemPoints);
    if (scheduledPickupAt) orderMetadata.ct_scheduled_pickup_at = scheduledPickupAt;

    const orderPayload: {
      locationId: string;
      referenceId: string;
      lineItems: { catalogObjectId: string; quantity: string }[];
      metadata?: Record<string, string>;
      discounts?: { uid: string; name: string; type: string; amountMoney: { amount: bigint; currency: string }; scope: string }[];
      fulfillments?: Array<{
        type: string;
        pickupDetails?: {
          scheduleType: string;
          pickupAt?: string;
          pickupWindowDuration?: string;
          prepTimeDuration?: string;
        };
      }>;
    } = {
      locationId,
      referenceId: orderReferenceId,
      lineItems: body.items.map((item) => ({
        catalogObjectId: item.variationId,
        quantity: item.quantity.toString()
      }))
    };
    if (Object.keys(orderMetadata).length > 0) orderPayload.metadata = orderMetadata;
    if (discountCents > 0) {
      orderPayload.discounts = [
        {
          uid: `ct_loyalty_${orderReferenceId}`,
          name: 'Loyalty points',
          type: 'FIXED_AMOUNT',
          amountMoney: { amount: BigInt(discountCents), currency },
          scope: 'ORDER'
        }
      ];
    }
    if (scheduledPickupAt) {
      orderPayload.fulfillments = [
        {
          type: 'PICKUP',
          pickupDetails: {
            scheduleType: 'SCHEDULED',
            pickupAt: scheduledPickupAt,
            pickupWindowDuration: 'PT30M',
            prepTimeDuration: `PT${leadTimeMinutes}M`
          }
        }
      ];
    }

    const idempotencyKey = body.idempotencyKey?.trim() || randomUUID();
    if (!body.idempotencyKey?.trim() && process.env.NODE_ENV === 'production') {
      logger.warn('Checkout called without idempotencyKey; using random. Risk of double charge on retry.');
    }

    const { result } = await square.checkoutApi.createPaymentLink({
      idempotencyKey,
      order: orderPayload,
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
    logger.error('Checkout error', error, {
      slug,
      vendorId: vendor?.id
    });
    const message =
      error?.result?.errors?.map((entry: { code?: string; detail?: string }) => `${entry.code}: ${entry.detail ?? ''}`).join(' | ') ||
      error?.errors?.map((entry: { code?: string; detail?: string }) => `${entry.code}: ${entry.detail ?? ''}`).join(' | ') ||
      error?.message ||
      'Failed to create checkout link';
    return res.status(500).json({ ok: false, error: message });
  }
}

// Apply rate limiting: 10 requests per minute (more restrictive for checkout)
export default rateLimiters.checkout(handler);
