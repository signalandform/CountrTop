import Link from 'next/link';
import { VendorInsights } from '@countrtop/models';

type Props = {
  vendorSlug: string | null;
  vendorName: string;
  insights: VendorInsights;
  statusMessage?: string | null;
};

const formatMetric = (value: number) => value.toLocaleString();

export function VendorInsightsDashboard({ vendorSlug, vendorName, insights, statusMessage }: Props) {
  return (
    <main className="page">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <p className="eyebrow">CountrTop Admin</p>
          <h1 className="title">{vendorName}</h1>
          <p className="subtitle">Vendor insights & analytics</p>
        </div>
        {vendorSlug && (
          <Link href={`/vendors/${vendorSlug}/orders`} className="btn-secondary">
            View Orders →
          </Link>
        )}
      </header>

      {statusMessage && <div className="error-banner">{statusMessage}</div>}

      {/* Stats Grid */}
      <section className="section">
        <div className="section-header">
          <h2>Performance Overview</h2>
          <span className="muted">Lifetime metrics</span>
        </div>
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Total Orders</span>
            <span className="stat-value">{formatMetric(insights.orders)}</span>
            <span className="stat-helper">via CountrTop</span>
          </div>
          <div className="stat-card accent">
            <span className="stat-label">Unique Customers</span>
            <span className="stat-value">{formatMetric(insights.uniqueCustomers)}</span>
            <span className="stat-helper">lifetime</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Repeat Customers</span>
            <span className="stat-value">{formatMetric(insights.repeatCustomers)}</span>
            <span className="stat-helper">2+ orders</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Points Issued</span>
            <span className="stat-value">{formatMetric(insights.pointsIssued)}</span>
            <span className="stat-helper">total rewards</span>
          </div>
        </div>
      </section>

      {/* Top Items */}
      <section className="section">
        <div className="section-header">
          <h2>Top Reordered Items</h2>
          <span className="muted">Most popular repeats</span>
        </div>
        {insights.topReorderedItems.length === 0 ? (
          <p className="muted">No reorder data yet.</p>
        ) : (
          <div className="items-list">
            {insights.topReorderedItems.map((item, index) => (
              <div key={item.label} className="item-row">
                <div className="item-rank">#{index + 1}</div>
                <div className="item-name">{item.label}</div>
                <div className="item-count">{item.count} reorders</div>
              </div>
            ))}
          </div>
        )}
      </section>

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
          font-size: 36px;
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

        .section {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 24px;
          margin-bottom: 24px;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .section-header h2 {
          font-size: 18px;
          margin: 0;
        }

        .muted {
          color: #666;
          font-size: 13px;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 16px;
        }

        .stat-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .stat-card.accent {
          background: linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%);
          border-color: rgba(102, 126, 234, 0.3);
        }

        .stat-label {
          color: #888;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .stat-value {
          font-size: 32px;
          font-weight: 700;
          background: linear-gradient(135deg, #fff 0%, #a78bfa 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .stat-helper {
          color: #555;
          font-size: 12px;
        }

        .items-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .item-row {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
        }

        .item-rank {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 10px;
          font-weight: 700;
          font-size: 13px;
        }

        .item-name {
          flex: 1;
          font-weight: 500;
        }

        .item-count {
          color: #a78bfa;
          font-weight: 600;
          font-size: 14px;
        }
      `}</style>
    </main>
  );
}
