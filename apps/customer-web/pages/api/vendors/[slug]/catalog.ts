import type { NextApiRequest, NextApiResponse } from 'next';

import { getServerDataClient } from '../../../../lib/dataClient';
import { squareClientForVendor } from '../../../../lib/square';

type CatalogItem = {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  variationId: string;
  imageUrl?: string | null;
};

type CatalogResponse = { ok: true; items: CatalogItem[] } | { ok: false; error: string };

const normalizeSlug = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function handler(req: NextApiRequest, res: NextApiResponse<CatalogResponse>) {
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

  const useMockData = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== 'false';
  if (useMockData) {
    return res.status(200).json({ ok: true, items: mockCatalogItems });
  }

  try {
    const square = squareClientForVendor(vendor);
    const { result } = await square.catalogApi.listCatalog(undefined, 'ITEM,IMAGE');

    const images = new Map<string, string>();
    (result.objects ?? []).forEach((object) => {
      if (object.type === 'IMAGE' && object.id && object.imageData?.url) {
        images.set(object.id, object.imageData.url);
      }
    });

    const items: CatalogItem[] = (result.objects ?? [])
      .filter((object) => object.type === 'ITEM' && object.itemData?.variations?.length)
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

    return res.status(200).json({ ok: true, items });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load catalog';
    return res.status(500).json({ ok: false, error: message });
  }
}

const mockCatalogItems: CatalogItem[] = [
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
