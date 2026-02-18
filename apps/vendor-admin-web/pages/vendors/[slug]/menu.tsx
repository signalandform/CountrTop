import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useState, useCallback } from 'react';

import type { Vendor } from '@countrtop/models';

import { requireVendorAdmin } from '../../../lib/auth';
import { getServerDataClient } from '../../../lib/dataClient';
import { VendorAdminLayout } from '../../../components/VendorAdminLayout';
import type { MenuItemWithAvailability } from '../../api/vendors/[slug]/menu';
import { fetchMenuForVendor } from '../../../lib/fetchMenu';

type MenuPageProps = {
  vendorSlug: string;
  vendorName: string;
  vendor: Vendor | null;
  initialItems: MenuItemWithAvailability[];
  menuError: string | null;
};

export const getServerSideProps: GetServerSideProps<MenuPageProps> = async (context) => {
  const slugParam = context.params?.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

  const authResult = await requireVendorAdmin(context, slug ?? null);
  if (!authResult.authorized) {
    if (authResult.redirect) {
      return { redirect: authResult.redirect };
    }
    return {
      props: {
        vendorSlug: slug ?? 'unknown',
        vendorName: 'Access Denied',
        vendor: null,
        initialItems: [],
        menuError: authResult.error ?? null
      }
    };
  }

  const dataClient = getServerDataClient();
  const vendor = slug ? await dataClient.getVendorBySlug(slug) : null;

  let initialItems: MenuItemWithAvailability[] = [];
  let menuError: string | null = null;

  if (vendor) {
    const menuResult = await fetchMenuForVendor(vendor, dataClient);
    if (menuResult.success) {
      initialItems = menuResult.items;
    } else {
      menuError = menuResult.error;
    }
  }

  return {
    props: {
      vendorSlug: slug ?? 'unknown',
      vendorName: vendor?.displayName ?? 'Unknown Vendor',
      vendor: vendor ?? null,
      initialItems,
      menuError
    }
  };
};

const formatPrice = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);

export default function MenuPage({ vendorSlug, vendorName, vendor, initialItems, menuError: initialMenuError }: MenuPageProps) {
  const [items, setItems] = useState<MenuItemWithAvailability[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialMenuError);
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});

  const fetchMenu = useCallback(async () => {
    if (!vendorSlug) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/vendors/${vendorSlug}/menu`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Failed to load menu');
        setItems([]);
        return;
      }
      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load menu');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [vendorSlug]);

  const updateItem = useCallback(
    async (catalogItemId: string, variationId: string, patch: { available?: boolean; internalStockCount?: number | null }) => {
      try {
        const res = await fetch(`/api/vendors/${vendorSlug}/menu`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ catalogItemId, variationId, ...patch })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error ?? 'Update failed');
        }
        setItems((prev) =>
          prev.map((item) =>
            item.id === catalogItemId
              ? {
                  ...item,
                  ...(patch.available !== undefined && { available: patch.available }),
                  ...(patch.internalStockCount !== undefined && { internalStockCount: patch.internalStockCount })
                }
              : item
          )
        );
      } catch (err) {
        console.error('Update menu item failed:', err);
      }
    },
    [vendorSlug]
  );

  const handleAvailableToggle = useCallback(
    (item: MenuItemWithAvailability) => {
      updateItem(item.id, item.variationId, { available: !item.available });
    },
    [updateItem]
  );

  const handleStockBlur = useCallback(
    (item: MenuItemWithAvailability, value: string) => {
      let internalStockCount: number | null = null;
      if (value !== '') {
        const n = parseInt(value, 10);
        if (Number.isNaN(n) || n < 0) return;
        internalStockCount = n;
      }
      setStockInputs((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      updateItem(item.id, item.variationId, { internalStockCount });
    },
    [updateItem]
  );

  const handleStockInputChange = useCallback((itemId: string, value: string) => {
    if (value !== '' && (value.includes('.') || value.includes('-') || parseInt(value, 10) < 0)) return;
    setStockInputs((prev) => ({ ...prev, [itemId]: value }));
  }, []);

  if (!vendor) {
    return (
      <VendorAdminLayout vendorSlug={vendorSlug} vendorName={vendorName}>
        <main className="page">
          <div className="container">
            <p>Vendor not found</p>
          </div>
        </main>
      </VendorAdminLayout>
    );
  }

  return (
    <>
      <Head>
        <title>Menu – {vendorName}</title>
      </Head>
      <VendorAdminLayout vendorSlug={vendorSlug} vendorName={vendorName} vendorLogoUrl={vendor.logoUrl}>
        <main className="page">
          <div className="container">
            <div className="headerRow">
              <div>
                <h1 className="title">Menu</h1>
                <p className="subtitle">Toggle availability and set internal stock count for each item. Unavailable items are hidden from your storefront.</p>
              </div>
              <button type="button" onClick={fetchMenu} disabled={loading} className="btnRefresh">
                {loading ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            {loading && <p className="status">Loading menu…</p>}
            {error && <p className="error">{error}</p>}
            {!loading && !error && items.length === 0 && (
              <p className="status">
                No menu items found. Connect {vendor?.posProvider === 'clover' ? 'Clover' : 'Square'} to sync your catalog.
              </p>
            )}

            {!loading && !error && items.length > 0 && (
              <ul className="list">
                {items.map((item) => (
                  <li key={item.id} className="card">
                    <div className="cardMain">
                      <div className="nameRow">
                        {item.imageUrl && (
                          <img src={item.imageUrl} alt="" className="thumb" />
                        )}
                        <div className="info">
                          <span className="name">{item.name}</span>
                          <span className="price">{formatPrice(item.price, item.currency)}</span>
                        </div>
                      </div>
                      <div className="controls">
                        <label className="toggleLabel">
                          <span className="toggleText">{item.available ? 'Available' : 'Unavailable'}</span>
                          <input
                            type="checkbox"
                            checked={item.available}
                            onChange={() => handleAvailableToggle(item)}
                            className="toggle"
                            aria-label={`${item.name} – ${item.available ? 'Available' : 'Unavailable'}`}
                          />
                          <span className="switch" />
                        </label>
                        <label className="stockLabel">
                          <span className="stockText">Stock</span>
                          <input
                            type="number"
                            min={0}
                            placeholder="—"
                            value={stockInputs[item.id] ?? item.internalStockCount ?? ''}
                            onChange={(e) => handleStockInputChange(item.id, e.target.value)}
                            onBlur={(e) => handleStockBlur(item, e.target.value)}
                            className="stockInput"
                            aria-label={`Internal stock for ${item.name}`}
                          />
                        </label>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <style jsx>{`
            .page {
              min-height: 100vh;
              background: var(--ct-bg-primary);
              color: var(--ct-text);
              font-family: var(--ct-font-body);
            }

            .container {
              max-width: 800px;
              margin: 0 auto;
            }

            .headerRow {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 16px;
              margin-bottom: 8px;
            }

            .btnRefresh {
              flex-shrink: 0;
              padding: 8px 16px;
              border-radius: 8px;
              border: 1px solid var(--ct-card-border);
              background: var(--ct-bg-surface);
              color: var(--ct-text);
              font-size: 14px;
              cursor: pointer;
            }

            .btnRefresh:hover:not(:disabled) {
              background: var(--ct-bg-surface-warm);
            }

            .btnRefresh:disabled {
              opacity: 0.7;
              cursor: not-allowed;
            }

            .title {
              font-size: 24px;
              font-weight: 700;
              margin: 0 0 8px;
            }

            .subtitle {
              color: var(--ct-text-muted);
              margin: 0 0 24px;
              font-size: 14px;
            }

            .status,
            .error {
              margin: 16px 0;
              font-size: 14px;
            }

            .error {
              color: var(--ct-error, #c00);
            }

            .list {
              list-style: none;
              margin: 0;
              padding: 0;
              display: flex;
              flex-direction: column;
              gap: 12px;
            }

            .card {
              background: var(--ct-bg-surface);
              border: 1px solid var(--ct-card-border);
              border-radius: 12px;
              padding: 16px;
              box-shadow: var(--ct-card-shadow);
            }

            .cardMain {
              display: flex;
              flex-wrap: wrap;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
            }

            .nameRow {
              display: flex;
              align-items: center;
              gap: 12px;
              min-width: 0;
            }

            .thumb {
              width: 48px;
              height: 48px;
              border-radius: 8px;
              object-fit: cover;
              background: var(--ct-bg-surface-warm);
            }

            .info {
              display: flex;
              flex-direction: column;
              gap: 2px;
            }

            .name {
              font-weight: 600;
              font-size: 16px;
            }

            .price {
              font-size: 14px;
              color: var(--ct-text-muted);
            }

            .controls {
              display: flex;
              align-items: center;
              gap: 20px;
              flex-shrink: 0;
            }

            .toggleLabel {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              cursor: pointer;
              user-select: none;
            }

            .toggleText {
              font-size: 14px;
              font-weight: 500;
            }

            .toggle {
              position: absolute;
              opacity: 0;
              width: 0;
              height: 0;
            }

            .switch {
              position: relative;
              width: 44px;
              height: 24px;
              background: var(--ct-card-border);
              border-radius: 12px;
              transition: background 0.2s;
            }

            .switch::after {
              content: '';
              position: absolute;
              top: 2px;
              left: 2px;
              width: 20px;
              height: 20px;
              background: var(--ct-bg-primary);
              border-radius: 50%;
              transition: transform 0.2s;
              box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
            }

            .toggle:checked + .switch {
              background: var(--color-primary, #e85d04);
            }

            .toggle:checked + .switch::after {
              transform: translateX(20px);
            }

            .stockLabel {
              display: inline-flex;
              align-items: center;
              gap: 8px;
            }

            .stockText {
              font-size: 14px;
              font-weight: 500;
            }

            .stockInput {
              width: 72px;
              padding: 6px 10px;
              border: 1px solid var(--ct-card-border);
              border-radius: 8px;
              background: var(--ct-bg-surface-warm);
              color: var(--ct-text);
              font-size: 14px;
            }

            .stockInput::placeholder {
              color: var(--ct-text-muted);
            }

            @media (max-width: 600px) {
              .cardMain {
                flex-direction: column;
                align-items: stretch;
              }

              .controls {
                justify-content: space-between;
              }
            }
          `}</style>
        </main>
      </VendorAdminLayout>
    </>
  );
}
