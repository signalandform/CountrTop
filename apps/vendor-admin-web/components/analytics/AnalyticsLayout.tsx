import Link from 'next/link';
import { useRouter } from 'next/router';

type AnalyticsLayoutProps = {
  vendorSlug: string;
  vendorName: string;
  children: React.ReactNode;
  currentTab?: 'kds' | 'revenue' | 'customers' | 'items';
};

/**
 * Shared layout for analytics pages with navigation tabs
 */
export function AnalyticsLayout({ vendorSlug, vendorName, children, currentTab }: AnalyticsLayoutProps) {
  const router = useRouter();
  const currentPath = router.asPath;

  const tabs = [
    { href: `/vendors/${vendorSlug}/analytics`, label: 'KDS Performance', id: 'kds' as const },
    { href: `/vendors/${vendorSlug}/analytics/revenue`, label: 'Revenue', id: 'revenue' as const },
    { href: `/vendors/${vendorSlug}/analytics/customers`, label: 'Customers', id: 'customers' as const },
    { href: `/vendors/${vendorSlug}/analytics/items`, label: 'Items', id: 'items' as const }
  ];

  const isActiveTab = (tabId: string) => {
    if (currentTab) {
      return currentTab === tabId;
    }
    // Fallback to path-based detection
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return false;
    if (tab.id === 'kds') {
      return currentPath === tab.href || currentPath === `${tab.href}/`;
    }
    return currentPath.startsWith(tab.href);
  };

  return (
    <div className="page">
      <div className="page-content">
        <div className="header">
          <div className="header-content">
            <div className="eyebrow">Vendor Analytics</div>
            <h1 className="title">{vendorName}</h1>
            <p className="subtitle">Performance insights and trends</p>
          </div>
          <Link href={`/vendors/${vendorSlug}`} className="back-button">
            ← Back to Dashboard
          </Link>
        </div>

        {/* Navigation Tabs */}
        <nav className="analytics-nav">
          {tabs.map((tab) => {
            const isActive = isActiveTab(tab.id);
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={`analytics-nav-item ct-card ${isActive ? 'active' : ''}`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {/* Content Area */}
        <div className="analytics-content">
          {children}
        </div>
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%);
          color: #e8e8e8;
          font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
          padding: 0 24px 48px;
        }

        .page-content {
          width: 100%;
        }

        @media (min-width: 1000px) {
          .page-content {
            max-width: 80vw;
            margin: 0 auto;
          }
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 48px 0 32px;
          flex-wrap: wrap;
          gap: 20px;
          position: relative;
        }

        .header-content {
          max-width: 500px;
        }

        .back-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          font-size: 14px;
          font-weight: 500;
          color: #888;
          text-decoration: none;
          border-radius: 8px;
          transition: all 0.2s ease;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          align-self: flex-start;
        }

        .back-button:hover {
          color: #e8e8e8;
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(102, 126, 234, 0.3);
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
          font-weight: 800;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0 0 8px;
          line-height: 1.2;
        }

        .subtitle {
          font-size: 16px;
          color: #888;
          margin: 0;
        }

        .analytics-nav {
          display: flex;
          gap: 16px;
          margin-bottom: 32px;
          flex-wrap: wrap;
        }

        .analytics-nav-item {
          padding: 12px 24px;
          font-size: 14px;
          font-weight: 500;
          color: #e8e8e8;
          text-decoration: none !important;
          transition: all 0.2s ease;
          cursor: pointer;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        .analytics-nav-item:link,
        .analytics-nav-item:visited,
        .analytics-nav-item:active {
          color: #e8e8e8;
          text-decoration: none !important;
        }

        .analytics-nav-item:hover {
          color: #e8e8e8;
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.2);
          text-decoration: none !important;
        }

        .analytics-nav-item.active {
          color: #a78bfa;
          border-color: #667eea;
          background: rgba(102, 126, 234, 0.2);
          text-decoration: none !important;
        }

        .analytics-nav-item.active:link,
        .analytics-nav-item.active:visited,
        .analytics-nav-item.active:active {
          color: #a78bfa;
          text-decoration: none !important;
        }

        .analytics-content {
          width: 100%;
        }
      `}</style>
    </div>
  );
}

