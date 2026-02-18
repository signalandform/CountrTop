/**
 * Shared menu fetching logic for server-side use (getServerSideProps) and API routes.
 * Avoids client-side fetch auth issues by loading menu data on the server.
 */
import type { MenuItem } from '@countrtop/models';
import { getAdapterForLocation } from '@countrtop/pos-adapters';
import type { DataClient } from '@countrtop/data';
import type { Vendor } from '@countrtop/models';
import { getSquareClientForVendorOrLegacy } from './square';

export type MenuItemWithAvailability = MenuItem & {
  available: boolean;
  internalStockCount: number | null;
};

export type FetchMenuResult =
  | { success: true; items: MenuItemWithAvailability[] }
  | { success: false; error: string };

export async function fetchMenuForVendor(
  vendor: Vendor,
  dataClient: DataClient
): Promise<FetchMenuResult> {
  try {
    const locations = await dataClient.listVendorLocations(vendor.id);
    const primaryOrFirst = locations.find((l) => l.isPrimary) ?? locations[0];
    const posProvider = primaryOrFirst?.posProvider ?? vendor.posProvider ?? 'square';

    if (posProvider === 'clover') {
      if (!primaryOrFirst) {
        return {
          success: false,
          error: 'No location configured. Connect Clover in Settings to sync your menu.'
        };
      }
      const cloverEnv = (process.env.CLOVER_ENVIRONMENT ?? 'sandbox').toLowerCase() as 'sandbox' | 'production';
      const cloverIntegration = await dataClient.getVendorCloverIntegration(vendor.id, cloverEnv);
      if (!cloverIntegration?.accessToken) {
        return {
          success: false,
          error: 'Clover not connected. Connect Clover in Settings.'
        };
      }
      const adapter = getAdapterForLocation(primaryOrFirst, vendor, { cloverIntegration });
      if (!adapter) {
        return { success: false, error: 'Clover catalog unavailable.' };
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
      return { success: true, items };
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

    return { success: true, items };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load menu';
    return { success: false, error: message };
  }
}
