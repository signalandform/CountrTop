import Head from 'next/head';
import React from 'react';
import { LoyaltySnapshot, OrderSummary, VendorProfile } from '@countrtop/models';
import { Section, StatCard } from '@countrtop/ui';

const vendors: VendorProfile[] = [
  { id: 'v1', name: 'Hilltop Tacos', cuisine: 'Mexican', location: 'Mission Bay' },
  { id: 'v2', name: 'Sunset Coffee Cart', cuisine: 'Cafe', location: 'Sunset Park' }
];

const loyalty: LoyaltySnapshot = {
  points: 420,
  tier: 'gold',
  nextRewardAt: 500
};

const recentOrders: OrderSummary[] = [
  { id: 'o1', status: 'pending', total: 120, etaMinutes: 12 },
  { id: 'o2', status: 'ready', total: 84.5, etaMinutes: 3 }
];

export default function Dashboard() {
  return (
    <>
      <Head>
        <title>CountrTop Dashboard</title>
      </Head>
      <main style={{ padding: '32px', fontFamily: 'Inter, sans-serif' }}>
        <h1 style={{ marginBottom: 8 }}>CountrTop Vendor Console</h1>
        <p style={{ color: '#6b7280', marginBottom: 24 }}>
          Track orders, loyalty performance, and keep menus fresh for your customers.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <StatCard label="Active orders" value={recentOrders.length} helperText="Across all trucks" />
          <StatCard label="Loyalty points today" value={loyalty.points} helperText="Earned by fans" />
          <StatCard label="Vendors live" value={vendors.length} helperText="Linked to your org" />
        </div>

        <Section title="Live orders" subtitle="Fulfillment">
          <ul style={{ padding: 0, margin: 0, listStyle: 'none' }}>
            {recentOrders.map((order) => (
              <li key={order.id} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600 }}>Order {order.id}</div>
                <div style={{ color: '#6b7280' }}>
                  Status: {order.status} • Total ${order.total.toFixed(2)} • ETA {order.etaMinutes}m
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Vendor lineup" subtitle="Fleet">
          <ul style={{ padding: 0, margin: 0, listStyle: 'none' }}>
            {vendors.map((vendor) => (
              <li key={vendor.id} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600 }}>{vendor.name}</div>
                <div style={{ color: '#6b7280' }}>
                  {vendor.cuisine} • {vendor.location}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </main>
    </>
  );
}
