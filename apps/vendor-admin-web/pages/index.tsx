import Head from 'next/head';
import type { GetServerSideProps } from 'next';

import { resolveVendorSlugFromHost } from '@countrtop/data';
import { OrderSnapshot, Vendor, VendorInsights } from '@countrtop/models';
import { Section, StatCard } from '@countrtop/ui';

import { getServerDataClient } from '../lib/dataClient';

type VendorAdminProps = {
  vendorSlug: string | null;
  vendorName: string;
  insights: VendorInsights;
};

const formatMetric = (value: number) => value.toLocaleString();

const summarizeInsights = async (
  vendor: Vendor | null,
  orders: OrderSnapshot[],
  dataClient: ReturnType<typeof getServerDataClient>
): Promise<VendorInsights> => {
  if (!vendor) {
    return {
      orders: 0,
      uniqueCustomers: 0,
      repeatCustomers: 0,
      pointsIssued: 0,
      topReorderedItems: []
    };
  }

  const counts = new Map<string, number>();
  orders.forEach((order) => {
    if (!order.userId) return;
    counts.set(order.userId, (counts.get(order.userId) ?? 0) + 1);
  });

  let pointsIssued = 0;
  for (const userId of counts.keys()) {
    const entries = await dataClient.listLoyaltyEntriesForUser(vendor.id, userId);
    pointsIssued += entries.reduce((sum, entry) => sum + Math.max(0, entry.pointsDelta), 0);
  }

  const itemCounts = new Map<string, number>();
  orders.forEach((order) => {
    const items = Array.isArray(order.snapshotJson?.items) ? order.snapshotJson.items : [];
    items.forEach((item: any) => {
      const label = typeof item?.name === 'string' ? item.name : 'Item';
      const quantity = typeof item?.quantity === 'number' ? item.quantity : 1;
      itemCounts.set(label, (itemCounts.get(label) ?? 0) + quantity);
    });
  });

  const topReorderedItems = [...itemCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    orders: orders.length,
    uniqueCustomers: counts.size,
    repeatCustomers: [...counts.values()].filter((count) => count > 1).length,
    pointsIssued,
    topReorderedItems
  };
};

export const getServerSideProps: GetServerSideProps<VendorAdminProps> = async ({ req }) => {
  const fallback = process.env.DEFAULT_VENDOR_SLUG;
  const vendorSlug = resolveVendorSlugFromHost(req.headers.host, fallback);
  const dataClient = getServerDataClient();

  const vendor = vendorSlug ? await dataClient.getVendorBySlug(vendorSlug) : null;
  const orders = vendor ? await dataClient.listOrderSnapshotsForVendor(vendor.id) : [];
  const insights = await summarizeInsights(vendor, orders, dataClient);

  return {
    props: {
      vendorSlug: vendorSlug ?? null,
      vendorName: vendor?.displayName ?? 'Unknown vendor',
      insights
    }
  };
};

export default function VendorAdminDashboard({ vendorSlug, vendorName, insights }: VendorAdminProps) {
  return (
    <>
      <Head>
        <title>CountrTop Vendor Insights</title>
      </Head>
      <main style={{ padding: '32px', fontFamily: 'Inter, sans-serif' }}>
        <h1 style={{ marginBottom: 8 }}>CountrTop Vendor Insights</h1>
        <p style={{ color: '#6b7280', marginBottom: 24 }}>
          Read-only metrics for {vendorName}
          {vendorSlug ? ` (${vendorSlug})` : ''}.
        </p>

        <Section title="CountrTop impact" subtitle="Read-only summary">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <StatCard label="Orders via CountrTop" value={formatMetric(insights.orders)} helperText="Total" />
            <StatCard label="Unique customers" value={formatMetric(insights.uniqueCustomers)} helperText="Lifetime" />
            <StatCard
              label="Repeat customers"
              value={formatMetric(insights.repeatCustomers)}
              helperText="2+ orders"
            />
            <StatCard label="Points issued" value={formatMetric(insights.pointsIssued)} helperText="Total" />
          </div>
        </Section>

        <Section title="Top reordered items" subtitle="Most repeated items">
          {insights.topReorderedItems.length === 0 ? (
            <p style={{ color: '#6b7280' }}>No reorder data yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {insights.topReorderedItems.map((item) => (
                <li
                  key={item.label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    padding: '12px 16px',
                    marginBottom: 12
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{item.label}</div>
                  <span style={{ color: '#111827', fontWeight: 600 }}>{item.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </main>
    </>
  );
}
