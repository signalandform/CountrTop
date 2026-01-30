import { useState } from 'react';
import { Vendor, VendorInsights } from '@countrtop/models';
import { getBrowserSupabaseClient } from '../lib/supabaseBrowser';

type Props = {
  vendorSlug: string | null;
  vendorName: string;
  vendor: Vendor | null;
  insights: VendorInsights;
  statusMessage?: string | null;
};

const formatMetric = (value: number) => value.toLocaleString();

export function VendorInsightsDashboard({ vendorSlug, vendorName, vendor, insights, statusMessage }: Props) {
  const [supabase] = useState(() => getBrowserSupabaseClient());

  const handleSignOut = async () => {
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
      window.location.href = '/login';
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  return (
    <main className="dashboard-page">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-left">
          <p className="eyebrow">CountrTop Vendor Admin</p>
          <h1 className="dashboard-title">{vendorName}</h1>
          <p className="dashboard-subtitle">Manage your business</p>
        </div>
        <div className="header-actions">
          {vendor?.logoUrl && (
            <img src={vendor.logoUrl} alt="" className="vendor-logo" />
          )}
          <button onClick={handleSignOut} className="btn-signout">
            Sign out
          </button>
        </div>
      </header>

      {statusMessage && <div className="error-banner">{statusMessage}</div>}

      <div className="dashboard-content">
        {/* Quick Actions */}
        <section className="quick-actions">
          <h2 className="section-title">Quick Actions</h2>
          <div className="dashboard-grid">
            <a href={`/vendors/${vendorSlug}/analytics`} className="dashboard-card">
              <div className="card-icon">📊</div>
              <h3 className="card-title">Analytics</h3>
              <p className="card-description">
                View KDS performance, revenue trends, and customer insights
              </p>
            </a>

            <a href={`/vendors/${vendorSlug}/orders`} className="dashboard-card">
              <div className="card-icon">📦</div>
              <h3 className="card-title">Orders</h3>
              <p className="card-description">
                View and manage active customer orders
              </p>
            </a>

            <a href={`/vendors/${vendorSlug}/locations`} className="dashboard-card">
              <div className="card-icon">📍</div>
              <h3 className="card-title">Locations</h3>
              <p className="card-description">
                Manage multiple store locations and settings
              </p>
            </a>

            <a href={`/vendors/${vendorSlug}/settings`} className="dashboard-card">
              <div className="card-icon">⚙️</div>
              <h3 className="card-title">Settings</h3>
              <p className="card-description">
                Branding, theming, and configuration
              </p>
            </a>

            <a href={`/vendors/${vendorSlug}/workspace`} className="dashboard-card">
              <div className="card-icon">👥</div>
              <h3 className="card-title">Team</h3>
              <p className="card-description">
                Manage employees and permissions
              </p>
            </a>

            <a 
              href={`https://${vendorSlug}.countrtop.com`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="dashboard-card"
            >
              <div className="card-icon">🌐</div>
              <h3 className="card-title">View Store</h3>
              <p className="card-description">
                Open your customer-facing ordering page
              </p>
            </a>
          </div>
        </section>

        {/* Stats Overview */}
        <section className="stats-section">
          <div className="section-header">
            <h2 className="section-title">Performance Snapshot</h2>
            <a href={`/vendors/${vendorSlug}/analytics`} className="view-all-link">
              View detailed analytics →
            </a>
          </div>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">📋</div>
              <div className="stat-content">
                <span className="stat-value">{formatMetric(insights.orders)}</span>
                <span className="stat-label">Total Orders</span>
              </div>
            </div>

            <div className="stat-card accent">
              <div className="stat-icon">👤</div>
              <div className="stat-content">
                <span className="stat-value">{formatMetric(insights.uniqueCustomers)}</span>
                <span className="stat-label">Customers</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">🔄</div>
              <div className="stat-content">
                <span className="stat-value">{formatMetric(insights.repeatCustomers)}</span>
                <span className="stat-label">Repeat Customers</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">⭐</div>
              <div className="stat-content">
                <span className="stat-value">{formatMetric(insights.pointsIssued)}</span>
                <span className="stat-label">Points Issued</span>
              </div>
            </div>
          </div>
        </section>

        {/* Top Items */}
        {insights.topReorderedItems.length > 0 && (
          <section className="items-section">
            <div className="section-header">
              <h2 className="section-title">Popular Items</h2>
              <span className="section-subtitle">Most reordered</span>
            </div>
            <div className="items-list">
              {insights.topReorderedItems.slice(0, 5).map((item, index) => (
                <div key={item.label} className="item-row">
                  <div className="item-rank">{index + 1}</div>
                  <div className="item-info">
                    <span className="item-name">{item.label}</span>
                    <span className="item-count">{item.count} reorders</span>
                  </div>
                  <div className="item-bar">
                    <div 
                      className="item-bar-fill" 
                      style={{ 
                        width: `${(item.count / insights.topReorderedItems[0].count) * 100}%` 
                      }} 
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <style jsx>{`
        .dashboard-page {
          min-height: 100vh;
          background: var(--ct-bg-primary);
          color: var(--ct-text);
          font-family: var(--ct-font-body);
        }

        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 32px 48px;
          border-bottom: 1px solid var(--color-border);
        }

        .header-left {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .eyebrow {
          text-transform: uppercase;
          letter-spacing: 2px;
          font-size: 11px;
          color: var(--color-accent);
          margin: 0;
        }

        .dashboard-title {
          font-size: 32px;
          font-weight: 700;
          margin: 0;
          background: var(--ct-gradient-primary);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .dashboard-subtitle {
          font-size: 14px;
          color: var(--color-text-muted);
          margin: 0;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .vendor-logo {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          object-fit: cover;
        }

        .btn-signout {
          padding: 10px 18px;
          border-radius: 10px;
          border: 1px solid var(--color-border);
          background: var(--color-bg-warm);
          color: var(--color-text);
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
        }

        .btn-signout:hover {
          background: rgba(232, 93, 4, 0.12);
          border-color: rgba(232, 93, 4, 0.3);
        }

        .error-banner {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #fca5a5;
          padding: 16px 24px;
          margin: 24px 48px 0;
          border-radius: 12px;
        }

        .dashboard-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 48px;
        }

        .quick-actions {
          margin-bottom: 48px;
        }

        .section-title {
          font-size: 20px;
          font-weight: 600;
          margin: 0 0 24px;
          color: var(--color-text);
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 20px;
        }

        .dashboard-card {
          background: var(--ct-bg-surface);
          border: 1px solid var(--color-border);
          border-radius: 16px;
          padding: 28px;
          text-decoration: none;
          color: inherit;
          transition: all 0.2s;
          display: flex;
          flex-direction: column;
        }

        .dashboard-card:hover {
          background: var(--color-bg-warm);
          border-color: rgba(232, 93, 4, 0.35);
          transform: translateY(-3px);
          box-shadow: 0 12px 40px rgba(232, 93, 4, 0.18);
        }

        .card-icon {
          font-size: 36px;
          margin-bottom: 16px;
        }

        .card-title {
          font-size: 18px;
          font-weight: 600;
          margin: 0 0 8px;
          color: var(--color-text);
        }

        .card-description {
          font-size: 14px;
          color: var(--color-text-muted);
          margin: 0;
          line-height: 1.5;
        }

        .stats-section {
          margin-bottom: 48px;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .view-all-link {
          color: var(--color-accent);
          font-size: 14px;
          text-decoration: none;
          transition: color 0.2s;
        }

        .view-all-link:hover {
          color: var(--color-primary);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 20px;
        }

        .stat-card {
          background: var(--ct-bg-surface);
          border: 1px solid var(--color-border);
          border-radius: 16px;
          padding: 24px;
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .stat-card.accent {
          background: rgba(232, 93, 4, 0.12);
          border-color: rgba(232, 93, 4, 0.3);
        }

        .stat-icon {
          font-size: 28px;
          width: 50px;
          height: 50px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--color-bg-warm);
          border-radius: 12px;
        }

        .stat-content {
          display: flex;
          flex-direction: column;
        }

        .stat-value {
          font-size: 28px;
          font-weight: 700;
          color: var(--color-text);
        }

        .stat-label {
          font-size: 13px;
          color: var(--color-text-muted);
        }

        .items-section {
          background: var(--ct-bg-surface);
          border: 1px solid var(--color-border);
          border-radius: 20px;
          padding: 28px;
        }

        .section-subtitle {
          font-size: 13px;
          color: var(--color-text-muted);
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
          background: var(--color-bg-warm);
          border-radius: 12px;
          transition: background 0.2s;
        }

        .item-row:hover {
          background: rgba(232, 93, 4, 0.08);
        }

        .item-rank {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--ct-gradient-primary);
          border-radius: 8px;
          font-weight: 700;
          font-size: 14px;
          flex-shrink: 0;
        }

        .item-info {
          flex: 1;
          min-width: 0;
        }

        .item-name {
          display: block;
          font-weight: 500;
          font-size: 15px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .item-count {
          display: block;
          font-size: 13px;
          color: var(--color-text-muted);
          margin-top: 2px;
        }

        .item-bar {
          width: 100px;
          height: 6px;
          background: var(--color-border);
          border-radius: 3px;
          overflow: hidden;
          flex-shrink: 0;
        }

        .item-bar-fill {
          height: 100%;
          background: var(--ct-gradient-primary);
          border-radius: 3px;
          transition: width 0.3s;
        }

        @media (max-width: 768px) {
          .dashboard-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 20px;
            padding: 24px;
          }

          .dashboard-content {
            padding: 24px;
          }

          .dashboard-grid {
            grid-template-columns: 1fr;
          }

          .stats-grid {
            grid-template-columns: 1fr 1fr;
          }

          .section-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }

          .item-bar {
            display: none;
          }
        }
      `}</style>
    </main>
  );
}
