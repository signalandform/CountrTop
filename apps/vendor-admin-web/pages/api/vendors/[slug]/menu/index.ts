import type { NextApiRequest, NextApiResponse } from 'next';
import { MenuItem } from '@countrtop/models';
import { getAdapterForLocation } from '@countrtop/pos-adapters';
import { getServerDataClient } from '../../../../../lib/dataClient';
import { requireVendorAdminApi } from '../../../../../lib/auth';
import { getSquareClientForVendorOrLegacy } from '../../../../../lib/square';

export type MenuItemWithAvailability = MenuItem & {
  available: boolean;
  internalStockCount: number | null;
};

type MenuGetResponse =
  | { success: true; items: MenuItemWithAvailability[] }
  | { success: false; error: string };

type MenuPatchBody = {
  catalogItemId: string;
  variationId: string;
  available?: boolean;
  internalStockCount?: number | null;
};

type MenuPatchResponse =
  | { success: true }
  | { success: false; error: string };

function normalizeSlug(value: string | string[] | undefined): string | null {
  const s = Array.isArray(value) ? value[0] : value;
  return typeof s === 'string' && s ? s : null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MenuGetResponse | MenuPatchResponse>
) {
  const slug = normalizeSlug(req.query.slug);
  if (!slug) {
    return res.status(400).json({ success: false, error: 'Vendor slug required' });
  }

  const authResult = await requireVendorAdminApi(req, res, slug);
  if (!authResult.authorized) {
    return res.status(authResult.statusCode ?? 401).json({
      success: false,
      error: authResult.error ?? 'Unauthorized'
    });
  }

  const dataClient = getServerDataClient();
  const vendor = await dataClient.getVendorBySlug(slug);
  if (!vendor) {
    return res.status(404).json({ success: false, error: 'Vendor not found' });
  }

  if (req.method === 'GET') {
    try {
      const locations = await dataClient.listVendorLocations(vendor.id);
      const primaryOrFirst = locations.find((l) => l.isPrimary) ?? locations[0];
      const posProvider = primaryOrFirst?.posProvider ?? vendor.posProvider ?? 'square';

      if (posProvider === 'clover') {
        if (!primaryOrFirst) {
          return res.status(503).json({
            success: false,
            error: 'No location configured. Connect Clover in Settings to sync your menu.'
          });
        }
        const cloverEnv = (process.env.CLOVER_ENVIRONMENT ?? 'sandbox').toLowerCase() as 'sandbox' | 'production';
        const cloverIntegration = await dataClient.getVendorCloverIntegration(vendor.id, cloverEnv);
        if (!cloverIntegration?.accessToken) {
          return res.status(503).json({
            success: false,
            error: 'Clover not connected. Connect Clover in Settings.'
          });
        }
        const adapter = getAdapterForLocation(primaryOrFirst, vendor, { cloverIntegration });
        if (!adapter) {
          return res.status(503).json({ success: false, error: 'Clover catalog unavailable.' });
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
        const items: MenuItemWithAvailability[] = rawItems.map((item) => {
          const override = availabilityByItemId.get(item.id);
          return {
            ...item,
            available: override === undefined ? true : override.available,
            internalStockCount: override === undefined ? null : override.internalStockCount
          };
        });
        return res.status(200).json({ success: true, items });
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

      const items: MenuItemWithAvailability[] = rawItems.map((item) => {
        const override = availabilityByItemId.get(item.id);
        return {
          ...item,
          available: override === undefined ? true : override.available,
          internalStockCount: override === undefined ? null : override.internalStockCount
        };
      });

      return res.status(200).json({ success: true, items });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load menu';
      return res.status(500).json({ success: false, error: message });
    }
  }

  if (req.method === 'PATCH') {
    let body: MenuPatchBody;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid JSON body' });
    }
    const { catalogItemId, variationId, available, internalStockCount } = body;
    if (!catalogItemId || typeof catalogItemId !== 'string') {
      return res.status(400).json({ success: false, error: 'catalogItemId is required' });
    }
    if (!variationId || typeof variationId !== 'string') {
      return res.status(400).json({ success: false, error: 'variationId is required' });
    }

    try {
      await dataClient.upsertMenuItemAvailability(vendor.id, catalogItemId, variationId, {
        available,
        internalStockCount
      });
      return res.status(200).json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update menu item';
      return res.status(500).json({ success: false, error: message });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
