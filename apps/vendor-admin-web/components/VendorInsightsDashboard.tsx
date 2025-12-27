import { VendorInsights } from '@countrtop/models';
import { Section, StatCard } from '@countrtop/ui';

type VendorInsightsDashboardProps = {
  vendorSlug: string | null;
  vendorName: string;
  insights: VendorInsights;
  statusMessage?: string | null;
};

const formatMetric = (value: number) => value.toLocaleString();

export function VendorInsightsDashboard({
  vendorSlug,
  vendorName,
  insights,
  statusMessage
}: VendorInsightsDashboardProps) {
  return (
    <main style={{ padding: '32px', fontFamily: 'Inter, sans-serif' }}>
      <h1 style={{ marginBottom: 8 }}>CountrTop Vendor Insights</h1>
      <p style={{ color: '#6b7280', marginBottom: statusMessage ? 8 : 24 }}>
        Read-only metrics for {vendorName}
        {vendorSlug ? ` (${vendorSlug})` : ''}.
      </p>
      {statusMessage && <p style={{ color: '#b91c1c', marginBottom: 24 }}>{statusMessage}</p>}

      {vendorSlug && (
        <div style={{ marginBottom: 20 }}>
          <a
            href={`/vendors/${vendorSlug}/orders`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 999,
              border: '1px solid #e2e8f0',
              color: '#0f172a',
              textDecoration: 'none',
              fontWeight: 600
            }}
          >
            View orders
          </a>
        </div>
      )}

      <Section title="CountrTop impact" subtitle="Read-only summary">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <StatCard label="Orders via CountrTop" value={formatMetric(insights.orders)} helperText="Total" />
          <StatCard label="Unique customers" value={formatMetric(insights.uniqueCustomers)} helperText="Lifetime" />
          <StatCard label="Repeat customers" value={formatMetric(insights.repeatCustomers)} helperText="2+ orders" />
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
  );
}
