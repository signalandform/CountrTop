import Head from 'next/head';
import type { GetServerSideProps } from 'next';

import { OrderSnapshot } from '@countrtop/models';

import { getServerDataClient } from '../../../lib/dataClient';

type OrderPageProps = {
  vendorSlug: string;
  vendorName: string;
  statusMessage?: string | null;
  orders: OrderSnapshot[];
};

type SnapshotItem = {
  name?: unknown;
  quantity?: unknown;
  price?: unknown;
};

type NormalizedSnapshot = {
  total: number;
  currency: string;
  items: { name: string; quantity: number; price: number }[];
};

const formatCurrency = (value: number, currency: string) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(value / 100);

const formatPlacedAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
};

const shortenId = (value: string | null | undefined) => {
  if (!value) return 'Guest';
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
};

const normalizeSnapshot = (snapshot: Record<string, unknown>): NormalizedSnapshot => {
  const total = typeof snapshot.total === 'number' ? snapshot.total : 0;
  const currency = typeof snapshot.currency === 'string' ? snapshot.currency : 'USD';
  const rawItems = Array.isArray(snapshot.items) ? snapshot.items : [];
  const items = rawItems.map((item) => {
    const raw = item as SnapshotItem;
    const name = typeof raw.name === 'string' ? raw.name : 'Item';
    const quantity = typeof raw.quantity === 'number' ? raw.quantity : 1;
    const price = typeof raw.price === 'number' ? raw.price : 0;
    return { name, quantity, price };
  });
  return { total, currency, items };
};

export const getServerSideProps: GetServerSideProps<OrderPageProps> = async ({ params }) => {
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
    .slice(0, 30);

  return {
    props: {
      vendorSlug: vendor.slug,
      vendorName: vendor.displayName,
      orders: sortedOrders
    }
  };
};

export default function VendorOrdersPage({
  vendorSlug,
  vendorName,
  orders,
  statusMessage
}: OrderPageProps) {
  return (
    <>
      <Head>
        <title>{`Orders – ${vendorName}`}</title>
      </Head>
      <main style={{ padding: '32px', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ marginBottom: 8 }}>{vendorName} Orders</h1>
            <p style={{ color: '#6b7280', margin: 0 }}>Recent order snapshots</p>
          </div>
          <a
            href={`/vendors/${vendorSlug}`}
            style={{
              alignSelf: 'center',
              padding: '8px 12px',
              borderRadius: 999,
              border: '1px solid #e2e8f0',
              color: '#0f172a',
              textDecoration: 'none',
              fontWeight: 600
            }}
          >
            Back to insights
          </a>
        </div>

        {statusMessage && <p style={{ color: '#b91c1c', marginTop: 16 }}>{statusMessage}</p>}

        {!statusMessage && orders.length === 0 && (
          <p style={{ color: '#6b7280', marginTop: 16 }}>No orders yet.</p>
        )}

        <div style={{ display: 'grid', gap: 12, marginTop: 20 }}>
          {orders.map((order) => {
            const normalized = normalizeSnapshot(order.snapshotJson);
            const itemCount = normalized.items.reduce((sum, item) => sum + item.quantity, 0);
            const previewItems = normalized.items.slice(0, 2).map((item) => item.name).join(', ');
            return (
              <details
                key={order.id}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 16,
                  padding: '12px 16px',
                  background: '#fff'
                }}
              >
                <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1.2fr',
                      gap: 12,
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{formatPlacedAt(order.placedAt)}</div>
                      <div style={{ color: '#94a3b8', fontSize: 12 }}>
                        {order.squareOrderId}
                      </div>
                    </div>
                    <div style={{ fontWeight: 600 }}>
                      {formatCurrency(normalized.total, normalized.currency)}
                    </div>
                    <div style={{ color: '#475569' }}>{itemCount} items</div>
                    <div style={{ color: '#475569' }}>{previewItems || '—'}</div>
                    <div style={{ color: '#475569' }}>{shortenId(order.userId)}</div>
                  </div>
                </summary>
                {normalized.items.length > 0 && (
                  <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                    {normalized.items.map((item, index) => (
                      <div
                        key={`${order.id}-${index}`}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          borderTop: '1px solid #f1f5f9',
                          paddingTop: 8,
                          color: '#475569'
                        }}
                      >
                        <span>
                          {item.quantity} × {item.name}
                        </span>
                        <span>{formatCurrency(item.price * item.quantity, normalized.currency)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </details>
            );
          })}
        </div>
      </main>
    </>
  );
}
