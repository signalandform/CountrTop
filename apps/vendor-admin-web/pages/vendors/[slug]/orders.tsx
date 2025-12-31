import Head from 'next/head';
import Link from 'next/link';
import type { GetServerSideProps } from 'next';
import { useState } from 'react';

import { OrderSnapshot } from '@countrtop/models';
import { getServerDataClient } from '../../../lib/dataClient';

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

export const getServerSideProps: GetServerSideProps<Props> = async ({ params }) => {
  const slugParam = params?.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

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
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const updateOrderStatus = async (orderId: string, status: 'READY' | 'COMPLETE') => {
    setUpdatingOrderId(orderId);
    setError(null);

    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/orders/${orderId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to update order status');
      }

      // Update local state
      setOrders((prevOrders) =>
        prevOrders.map((order) => {
          if (order.id === orderId) {
            return {
              ...order,
              fulfillmentStatus: status,
              readyAt: status === 'READY' ? new Date().toISOString() : order.readyAt,
              completedAt: status === 'COMPLETE' ? new Date().toISOString() : order.completedAt,
              updatedAt: new Date().toISOString()
            };
          }
          return order;
        })
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update order status';
      setError(message);
      setTimeout(() => setError(null), 5000);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  return (
    <>
      <Head>
        <title>{`Orders – ${vendorName}`}</title>
      </Head>
      <main className="page">
        {/* Header */}
        <header className="header">
          <div className="header-content">
            <p className="eyebrow">CountrTop Admin</p>
            <h1 className="title">{vendorName} Orders</h1>
            <p className="subtitle">Recent order snapshots</p>
          </div>
          <Link href={`/vendors/${vendorSlug}`} className="btn-secondary">
            ← Back to Insights
          </Link>
        </header>

        {statusMessage && <div className="error-banner">{statusMessage}</div>}

        {error && <div className="error-banner">{error}</div>}

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

            const currentStatus = order.fulfillmentStatus ?? 'PLACED';
            const isUpdating = updatingOrderId === order.id;
            const canMarkReady = currentStatus === 'PLACED';
            const canMarkComplete = currentStatus === 'READY';

            return (
              <div key={order.id} className={`order-card ${isExpanded ? 'expanded' : ''}`}>
                <button className="order-header" onClick={() => toggleExpand(order.id)}>
                  <div className="order-main">
                    <div className="order-date">{formatDate(order.placedAt)}</div>
                    <div className="order-id">{order.squareOrderId}</div>
                  </div>
                  <div className="order-total">{formatCurrency(data.total, data.currency)}</div>
                  <div className="order-items">{itemCount} items</div>
                  <div className="order-status">
                    <span className={`status-badge status-${currentStatus.toLowerCase()}`}>
                      {currentStatus}
                    </span>
                  </div>
                  <div className="order-customer">{shortenId(order.userId)}</div>
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
                    <div className="order-actions">
                      {canMarkReady && (
                        <button
                          className="btn-action btn-ready"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateOrderStatus(order.id, 'READY');
                          }}
                          disabled={isUpdating}
                        >
                          {isUpdating ? 'Updating...' : 'Mark Ready'}
                        </button>
                      )}
                      {canMarkComplete && (
                        <button
                          className="btn-action btn-complete"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateOrderStatus(order.id, 'COMPLETE');
                          }}
                          disabled={isUpdating}
                        >
                          {isUpdating ? 'Updating...' : 'Mark Complete'}
                        </button>
                      )}
                      {currentStatus === 'COMPLETE' && (
                        <span className="status-complete-text">Order completed</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <style jsx>{`
          .page {
            min-height: 100vh;
            background: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%);
            color: #e8e8e8;
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
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
            color: #a78bfa;
            margin: 0 0 8px;
          }

          .title {
            font-size: 32px;
            font-weight: 700;
            margin: 0 0 8px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .subtitle {
            font-size: 16px;
            color: #888;
            margin: 0;
          }

          .btn-secondary {
            padding: 12px 20px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.05);
            color: #e8e8e8;
            font-weight: 600;
            text-decoration: none;
            transition: background 0.2s;
          }

          .btn-secondary:hover {
            background: rgba(255, 255, 255, 0.1);
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
            color: #666;
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
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 16px;
            overflow: hidden;
            transition: border-color 0.2s;
          }

          .order-card:hover {
            border-color: rgba(255, 255, 255, 0.15);
          }

          .order-card.expanded {
            border-color: rgba(102, 126, 234, 0.4);
          }

          .order-header {
            width: 100%;
            display: grid;
            grid-template-columns: 2fr 1fr 1fr 1fr 1fr 40px;
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
            .order-header {
              grid-template-columns: 1fr 1fr;
              gap: 12px;
            }
            .order-items,
            .order-customer,
            .order-status {
              display: none;
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
            color: #666;
            font-size: 12px;
            font-family: monospace;
          }

          .order-total {
            font-weight: 700;
            font-size: 16px;
            color: #a78bfa;
          }

          .order-items {
            color: #888;
            font-size: 14px;
          }

          .order-customer {
            color: #666;
            font-size: 13px;
            font-family: monospace;
          }

          .order-status {
            display: flex;
            align-items: center;
          }

          .status-badge {
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .status-badge.status-placed {
            background: rgba(102, 126, 234, 0.2);
            color: #a78bfa;
            border: 1px solid rgba(102, 126, 234, 0.3);
          }

          .status-badge.status-ready {
            background: rgba(251, 191, 36, 0.2);
            color: #fbbf24;
            border: 1px solid rgba(251, 191, 36, 0.3);
          }

          .status-badge.status-complete {
            background: rgba(34, 197, 94, 0.2);
            color: #4ade80;
            border: 1px solid rgba(34, 197, 94, 0.3);
          }

          .order-expand {
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            font-size: 18px;
            color: #888;
          }

          .order-details {
            padding: 0 20px 20px;
            border-top: 1px solid rgba(255, 255, 255, 0.06);
            margin-top: 0;
          }

          .detail-divider {
            height: 1px;
            background: rgba(255, 255, 255, 0.06);
            margin: 16px 0;
          }

          .detail-row {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.04);
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
            background: rgba(102, 126, 234, 0.2);
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            color: #a78bfa;
          }

          .detail-name {
            flex: 1;
            color: #ccc;
          }

          .detail-price {
            color: #888;
            font-size: 14px;
          }

          .order-actions {
            display: flex;
            gap: 12px;
            align-items: center;
            padding-top: 8px;
          }

          .btn-action {
            padding: 10px 20px;
            border-radius: 8px;
            border: none;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
            font-family: inherit;
          }

          .btn-action:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .btn-ready {
            background: rgba(251, 191, 36, 0.2);
            color: #fbbf24;
            border: 1px solid rgba(251, 191, 36, 0.3);
          }

          .btn-ready:hover:not(:disabled) {
            background: rgba(251, 191, 36, 0.3);
            border-color: rgba(251, 191, 36, 0.5);
          }

          .btn-complete {
            background: rgba(34, 197, 94, 0.2);
            color: #4ade80;
            border: 1px solid rgba(34, 197, 94, 0.3);
          }

          .btn-complete:hover:not(:disabled) {
            background: rgba(34, 197, 94, 0.3);
            border-color: rgba(34, 197, 94, 0.5);
          }

          .status-complete-text {
            color: #4ade80;
            font-size: 14px;
            font-weight: 600;
          }
        `}</style>
      </main>
    </>
  );
}
