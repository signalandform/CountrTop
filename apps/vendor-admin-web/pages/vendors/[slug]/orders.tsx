import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useState } from 'react';

import { OrderSnapshot } from '@countrtop/models';
import { getServerDataClient } from '../../../lib/dataClient';
import { requireVendorAdmin } from '../../../lib/auth';
import { VendorAdminLayout } from '../../../components/VendorAdminLayout';

type Props = {
  vendorSlug: string;
  vendorName: string;
  statusMessage?: string | null;
  orders: OrderSnapshot[];
};

type NormalizedItem = { name: string; quantity: number; price: number };
type NormalizedSnapshot = { total: number; currency: string; items: NormalizedItem[] };

const formatCurrency = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const shortenId = (value: string | null | undefined) => {
  if (!value) return 'Guest';
  return value.length <= 12 ? value : `${value.slice(0, 6)}…${value.slice(-4)}`;
};

const normalizeSnapshot = (snapshot: Record<string, unknown>): NormalizedSnapshot => {
  const total = typeof snapshot.total === 'number' ? snapshot.total : 0;
  const currency = typeof snapshot.currency === 'string' ? snapshot.currency : 'USD';
  const rawItems = Array.isArray(snapshot.items) ? snapshot.items : [];
  const items = rawItems.map((item: unknown) => {
    const i = item as Record<string, unknown>;
    return {
      name: typeof i.name === 'string' ? i.name : 'Item',
      quantity: typeof i.quantity === 'number' ? i.quantity : 1,
      price: typeof i.price === 'number' ? i.price : 0
    };
  });
  return { total, currency, items };
};

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const slugParam = context.params?.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

  // Check vendor admin access
  const authResult = await requireVendorAdmin(context, slug ?? null);
  if (!authResult.authorized) {
    if (authResult.redirect) {
      return { redirect: authResult.redirect };
    }
    return {
      props: {
        vendorSlug: slug ?? 'unknown',
        vendorName: 'Access Denied',
        statusMessage: authResult.error ?? 'Access denied',
        orders: []
      }
    };
  }

  const dataClient = getServerDataClient();
  const vendor = slug ? await dataClient.getVendorBySlug(slug) : null;

  if (!vendor) {
    return {
      props: {
        vendorSlug: slug ?? 'unknown',
        vendorName: 'Unknown vendor',
        statusMessage: 'Vendor not found',
        orders: []
      }
    };
  }

  const orders = await dataClient.listOrderSnapshotsForVendor(vendor.id);
  const sortedOrders = [...orders]
    .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime())
    .slice(0, 50);

  return {
    props: {
      vendorSlug: vendor.slug,
      vendorName: vendor.displayName,
      orders: sortedOrders
    }
  };
};

export default function VendorOrdersPage({ vendorSlug, vendorName, orders: initialOrders, statusMessage }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderSnapshot[]>(initialOrders);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <>
      <Head>
        <title>{`Orders – ${vendorName}`}</title>
      </Head>
      <VendorAdminLayout vendorSlug={vendorSlug} vendorName={vendorName}>
        <main className="page">
          <header className="header">
            <div className="header-content">
              <p className="eyebrow">CountrTop Admin</p>
              <h1 className="title">{vendorName} Orders</h1>
              <p className="subtitle">Recent order snapshots</p>
            </div>
          </header>

        {statusMessage && <div className="error-banner">{statusMessage}</div>}

        {!statusMessage && orders.length === 0 && (
          <div className="empty-state">
            <span className="empty-icon">📦</span>
            <p>No orders yet</p>
          </div>
        )}

        {/* Orders List */}
        <div className="orders-list">
          {orders.map((order) => {
            const data = normalizeSnapshot(order.snapshotJson);
            const itemCount = data.items.reduce((sum, i) => sum + i.quantity, 0);
            const isExpanded = expandedId === order.id;

            return (
              <div key={order.id} className={`order-card ${isExpanded ? 'expanded' : ''}`}>
                <button className="order-header" onClick={() => toggleExpand(order.id)}>
                  <div className="order-main">
                    <div className="order-date">{formatDate(order.placedAt)}</div>
                    <div className="order-id">{order.squareOrderId}</div>
                  </div>
                  <div className="order-total">{formatCurrency(data.total, data.currency)}</div>
                  <div className="order-items">{itemCount} items</div>
                  <div className="order-customer">
                    {order.pickupLabel || order.customerDisplayName || shortenId(order.userId)}
                  </div>
                  <div className="order-expand">{isExpanded ? '−' : '+'}</div>
                </button>

                {isExpanded && (
                  <div className="order-details">
                    {data.items.length > 0 && (
                      <>
                        {data.items.map((item, idx) => (
                          <div key={idx} className="detail-row">
                            <span className="detail-qty">{item.quantity}×</span>
                            <span className="detail-name">{item.name}</span>
                            <span className="detail-price">
                              {formatCurrency(item.price * item.quantity, data.currency)}
                            </span>
                          </div>
                        ))}
                        <div className="detail-divider" />
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <style jsx>{`
          .page {
            min-height: 100vh;
            background: var(--ct-bg-primary);
            color: var(--ct-text);
            font-family: var(--ct-font-body);
            padding: 0 24px 48px;
          }

          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding: 48px 0 32px;
            flex-wrap: wrap;
            gap: 20px;
          }

          .header-content {
            max-width: 500px;
          }

          .eyebrow {
            text-transform: uppercase;
            letter-spacing: 3px;
            font-size: 11px;
            color: var(--color-accent);
            margin: 0 0 8px;
          }

          .title {
            font-size: 32px;
            font-weight: 700;
            margin: 0 0 8px;
            background: var(--ct-gradient-primary);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .subtitle {
            font-size: 16px;
            color: var(--color-text-muted);
            margin: 0;
          }

          .back-link {
            color: var(--color-accent);
            text-decoration: none;
            font-size: 14px;
            transition: color 0.2s;
          }

          .back-link:hover {
            color: var(--color-primary);
          }

          .error-banner {
            background: rgba(239, 68, 68, 0.2);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #fca5a5;
            padding: 12px 16px;
            border-radius: 12px;
            margin-bottom: 24px;
          }

          .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: var(--color-text-muted);
          }

          .empty-icon {
            font-size: 48px;
            display: block;
            margin-bottom: 16px;
          }

          .orders-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .order-card {
            background: var(--ct-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 16px;
            overflow: hidden;
            transition: border-color 0.2s;
          }

          .order-card:hover {
            border-color: rgba(232, 93, 4, 0.2);
          }

          .order-card.expanded {
            border-color: rgba(232, 93, 4, 0.4);
          }

          .order-header {
            width: 100%;
            display: grid;
            grid-template-columns: 2fr 1fr 1fr 1fr 40px;
            gap: 16px;
            align-items: center;
            padding: 16px 20px;
            background: transparent;
            border: none;
            color: inherit;
            cursor: pointer;
            text-align: left;
            font-family: inherit;
          }

          @media (max-width: 700px) {
            .page {
              padding: 0 16px 40px;
            }
            .header {
              padding: 24px 0 24px;
            }
            .title {
              font-size: 24px;
            }
            .order-header {
              grid-template-columns: 1fr 1fr;
              gap: 12px;
              padding: 14px 16px;
              min-height: 44px;
            }
            .order-items,
            .order-customer {
              display: none;
            }
            .order-expand {
              min-width: 44px;
              min-height: 44px;
            }
            .order-details {
              padding: 0 16px 16px;
            }
          }

          .order-main {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }

          .order-date {
            font-weight: 600;
            font-size: 14px;
          }

          .order-id {
            color: var(--color-text-muted);
            font-size: 12px;
            font-family: monospace;
          }

          .order-total {
            font-weight: 700;
            font-size: 16px;
            color: var(--color-accent);
          }

          .order-items {
            color: var(--color-text-muted);
            font-size: 14px;
          }

          .order-customer {
            color: var(--color-text-muted);
            font-size: 13px;
            font-family: monospace;
          }

          .order-expand {
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--color-bg-warm);
            border-radius: 8px;
            font-size: 18px;
            color: var(--color-text-muted);
          }

          .order-details {
            padding: 0 20px 20px;
            border-top: 1px solid var(--color-border);
            margin-top: 0;
          }

          .detail-divider {
            height: 1px;
            background: var(--color-border);
            margin: 16px 0;
          }

          .detail-row {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 0;
            border-bottom: 1px solid var(--color-border);
          }

          .detail-row:last-child {
            border-bottom: none;
          }

          .detail-qty {
            width: 36px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(232, 93, 4, 0.15);
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            color: var(--color-primary);
          }

          .detail-name {
            flex: 1;
            color: var(--color-text);
          }

          .detail-price {
            color: var(--color-text-muted);
            font-size: 14px;
          }
        `}</style>
        </main>
      </VendorAdminLayout>
    </>
  );
}
