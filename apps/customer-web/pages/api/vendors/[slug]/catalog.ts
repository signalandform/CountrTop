import type { NextApiRequest, NextApiResponse } from 'next';

import { MenuItem } from '@countrtop/models';
import { getAdapterForLocation } from '@countrtop/pos-adapters';
import { getServerDataClient } from '../../../../lib/dataClient';
import { rateLimiters } from '../../../../lib/rateLimit';
import { getSquareClientForVendorOrLegacy } from '../../../../lib/square';

type CatalogResponse = { ok: true; items: MenuItem[] } | { ok: false; error: string };

const normalizeSlug = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const cloverEnv = (process.env.CLOVER_ENVIRONMENT ?? (process.env.NODE_ENV === 'production' ? 'production' : 'sandbox')) as 'sandbox' | 'production';

async function handler(req: NextApiRequest, res: NextApiResponse<CatalogResponse>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const slug = normalizeSlug(req.query.slug);
  if (!slug) {
    return res.status(400).json({ ok: false, error: 'Vendor slug required' });
  }

  const dataClient = getServerDataClient();
  const vendor = await dataClient.getVendorBySlug(slug);
  if (!vendor) {
    return res.status(404).json({ ok: false, error: 'Vendor not found' });
  }

  const useMockData = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
  if (useMockData) {
    return res.status(200).json({ ok: true, items: mockCatalogItems });
  }

  try {
    const locations = await dataClient.listVendorLocations(vendor.id);
    const primaryOrFirst = locations.find((l) => l.isPrimary) ?? locations[0];
    const posProvider = primaryOrFirst?.posProvider ?? vendor.posProvider ?? 'square';

    if (posProvider === 'clover' && primaryOrFirst) {
      const cloverIntegration = await dataClient.getVendorCloverIntegration(vendor.id, cloverEnv);
      if (!cloverIntegration?.accessToken) {
        return res.status(503).json({ ok: false, error: 'Clover not connected. Please ask the restaurant to connect Clover.' });
      }
      const adapter = getAdapterForLocation(primaryOrFirst, vendor, { cloverIntegration });
      if (!adapter) {
        return res.status(503).json({ ok: false, error: 'Clover catalog unavailable.' });
      }
      const locationId = primaryOrFirst.externalLocationId ?? primaryOrFirst.squareLocationId;
      const canonicalItems = await adapter.fetchCatalog(locationId);
      const rawItems: MenuItem[] = canonicalItems
        .filter((item) => item.available && item.externalId)
        .map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          price: item.priceCents,
          currency: item.currency,
          variationId: item.variationId ?? item.externalId,
          imageUrl: item.imageUrl ?? null
        }));
      const availabilityList = await dataClient.getMenuAvailabilityForVendor(vendor.id);
      const availabilityByItemId = new Map(availabilityList.map((a) => [a.catalogItemId, a]));
      const items = rawItems.filter((item) => {
        const override = availabilityByItemId.get(item.id);
        return override === undefined ? true : override.available;
      });
      return res.status(200).json({ ok: true, items });
    }

    const square = await getSquareClientForVendorOrLegacy(vendor, dataClient);
    const { result } = await square.catalogApi.listCatalog(undefined, 'ITEM,IMAGE');

    const images = new Map<string, string>();
    (result.objects ?? []).forEach((object) => {
      if (object.type === 'IMAGE' && object.id && object.imageData?.url) {
        images.set(object.id, object.imageData.url);
      }
    });

    const rawItems: MenuItem[] = (result.objects ?? [])
      .filter((object) => {
        if (object.type !== 'ITEM') return false;
        if (!object.itemData?.variations?.length) return false;
        if (object.isDeleted) return false;
        if (object.itemData?.isArchived) return false;
        return true;
      })
      .map((object) => {
        const variation = object.itemData?.variations?.[0];
        const priceMoney = variation?.itemVariationData?.priceMoney;
        return {
          id: object.id ?? '',
          name: object.itemData?.name ?? 'Item',
          description: object.itemData?.description ?? undefined,
          price: Number(priceMoney?.amount ?? 0),
          currency: priceMoney?.currency ?? 'USD',
          variationId: variation?.id ?? '',
          imageUrl: object.itemData?.imageIds?.[0]
            ? images.get(object.itemData.imageIds[0]) ?? null
            : null
        };
      })
      .filter((item) => item.id && item.variationId);

    const availabilityList = await dataClient.getMenuAvailabilityForVendor(vendor.id);
    const availabilityByItemId = new Map(availabilityList.map((a) => [a.catalogItemId, a]));
    const items = rawItems.filter((item) => {
      const override = availabilityByItemId.get(item.id);
      return override === undefined ? true : override.available;
    });

    return res.status(200).json({ ok: true, items });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load catalog';
    return res.status(500).json({ ok: false, error: message });
  }
}

const mockCatalogItems: MenuItem[] = [
  {
    id: 'mock_espresso',
    name: 'Espresso',
    description: 'Rich espresso shot with caramel notes',
    price: 325,
    currency: 'USD',
    variationId: 'mock_variation_espresso',
    imageUrl: null
  },
  {
    id: 'mock_croissant',
    name: 'Butter Croissant',
    description: 'Flaky pastry baked fresh daily',
    price: 450,
    currency: 'USD',
    variationId: 'mock_variation_croissant',
    imageUrl: null
  },
  {
    id: 'mock_sandwich',
    name: 'Chipotle Chicken Sandwich',
    description: 'Grilled chicken, chipotle mayo, pickled onions',
    price: 1099,
    currency: 'USD',
    variationId: 'mock_variation_sandwich',
    imageUrl: null
  }
];

// Apply rate limiting: 100 requests per minute
export default rateLimiters.catalog(handler);
