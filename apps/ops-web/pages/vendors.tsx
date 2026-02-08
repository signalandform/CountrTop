import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { OpsAdminLayout } from '../components/OpsAdminLayout';

import { requireOpsAdmin } from '../lib/auth';

type POSProvider = 'square' | 'clover' | 'toast';

type PlanId = 'trial' | 'starter' | 'pro' | 'kds_only' | 'online_only';

type Vendor = {
  id: string;
  slug: string;
  display_name: string;
  pos_provider: POSProvider;
  square_location_id: string; // Now serves as external_location_id
  square_credential_ref?: string | null;
  status?: string | null;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  timezone?: string | null;
  admin_user_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  planId?: string;
  billingStatus?: string | null;
  currentPeriodEnd?: string | null;
};

const PLAN_LABELS: Record<string, string> = {
  trial: 'Trial',
  starter: 'Starter',
  pro: 'Pro',
  kds_only: 'KDS only',
  online_only: 'Online only'
};

const POS_LABELS: Record<POSProvider, string> = {
  square: 'Square',
  clover: 'Clover',
  toast: 'Toast'
};

const POS_COLORS: Record<POSProvider, { bg: string; text: string }> = {
  square: { bg: 'rgba(0, 128, 255, 0.2)', text: '#60a5fa' },
  clover: { bg: 'rgba(34, 197, 94, 0.2)', text: '#86efac' },
  toast: { bg: 'rgba(249, 115, 22, 0.2)', text: '#fdba74' }
};

type Props = {
  userEmail: string;
};

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const authResult = await requireOpsAdmin(context);
  if (!authResult.authorized) {
    if (authResult.redirect) {
      return { redirect: authResult.redirect };
    }
    return {
      redirect: {
        destination: '/login',
        permanent: false
      }
    };
  }

  return {
    props: {
      userEmail: authResult.userEmail
    }
  };
};

export default function VendorsPage({ userEmail }: Props) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [posFilter, setPosFilter] = useState<POSProvider | 'all'>('all');
  const [planFilter, setPlanFilter] = useState<PlanId | 'all'>('all');

  useEffect(() => {
    fetchVendors();
  }, []);

  const fetchVendors = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/vendors', {
        credentials: 'include'
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setVendors(data.vendors);
      } else {
        throw new Error(data.error || 'Failed to fetch vendors');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vendors');
    } finally {
      setLoading(false);
    }
  };

  const filteredVendors = vendors.filter(vendor => {
    // POS filter
    if (posFilter !== 'all' && vendor.pos_provider !== posFilter) {
      return false;
    }
    // Plan filter
    if (planFilter !== 'all' && (vendor.planId ?? 'trial') !== planFilter) {
      return false;
    }
    // Search filter
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      vendor.display_name.toLowerCase().includes(query) ||
      vendor.slug.toLowerCase().includes(query) ||
      vendor.square_location_id.toLowerCase().includes(query) ||
      (vendor.city && vendor.city.toLowerCase().includes(query)) ||
      (vendor.state && vendor.state.toLowerCase().includes(query))
    );
  });

  // Calculate POS counts for summary
  const posCounts = vendors.reduce((acc, v) => {
    acc[v.pos_provider] = (acc[v.pos_provider] || 0) + 1;
    return acc;
  }, {} as Record<POSProvider, number>);

  // Calculate plan counts for summary
  const planCounts = vendors.reduce((acc, v) => {
    const plan = v.planId ?? 'trial';
    acc[plan] = (acc[plan] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <>
      <Head>
        <title>Vendor Management – CountrTop Ops</title>
      </Head>
      <OpsAdminLayout userEmail={userEmail}>
        <main className="page">
          <header className="page-header">
            <div className="header-content">
            <h1>Vendor Management</h1>
            <div className="header-actions">
              <Link href="/vendors/new" className="btn-new-vendor">
                + New Vendor
              </Link>
              <input
                type="text"
                placeholder="Search vendors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
              <button onClick={fetchVendors} className="btn-refresh" disabled={loading}>
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>
          
          {/* POS Filter Tabs */}
            <div className="pos-filter-tabs">
            <button
              className={`pos-tab ${posFilter === 'all' ? 'active' : ''}`}
              onClick={() => setPosFilter('all')}
            >
              All ({vendors.length})
            </button>
            <button
              className={`pos-tab pos-square ${posFilter === 'square' ? 'active' : ''}`}
              onClick={() => setPosFilter('square')}
            >
              <span className="pos-icon">■</span> Square ({posCounts.square || 0})
            </button>
            <button
              className={`pos-tab pos-clover ${posFilter === 'clover' ? 'active' : ''}`}
              onClick={() => setPosFilter('clover')}
            >
              <span className="pos-icon">☘</span> Clover ({posCounts.clover || 0})
            </button>
            <button
              className={`pos-tab pos-toast ${posFilter === 'toast' ? 'active' : ''}`}
              onClick={() => setPosFilter('toast')}
            >
              <span className="pos-icon">🍞</span> Toast ({posCounts.toast || 0})
            </button>
            </div>

          {/* Plan Filter Tabs */}
            <div className="plan-filter-tabs">
            <button
              className={`plan-tab ${planFilter === 'all' ? 'active' : ''}`}
              onClick={() => setPlanFilter('all')}
            >
              All plans ({vendors.length})
            </button>
            <button
              className={`plan-tab ${planFilter === 'trial' ? 'active' : ''}`}
              onClick={() => setPlanFilter('trial')}
            >
              Trial ({planCounts.trial ?? 0})
            </button>
            <button
              className={`plan-tab ${planFilter === 'starter' ? 'active' : ''}`}
              onClick={() => setPlanFilter('starter')}
            >
              Starter ({planCounts.starter ?? 0})
            </button>
            <button
              className={`plan-tab ${planFilter === 'pro' ? 'active' : ''}`}
              onClick={() => setPlanFilter('pro')}
            >
              Pro ({planCounts.pro ?? 0})
            </button>
            </div>
          </header>

        <div className="page-content">
          {error && (
            <div className="error-banner">
              <p>{error}</p>
              <button onClick={fetchVendors} className="btn-retry">Retry</button>
            </div>
          )}

          {loading && vendors.length === 0 ? (
            <div className="loading-state">
              <p>Loading vendors...</p>
            </div>
          ) : filteredVendors.length === 0 ? (
            <div className="empty-state">
              <p>{searchQuery ? 'No vendors match your search.' : 'No vendors found.'}</p>
            </div>
          ) : (
            <div className="vendors-table-container">
              <table className="vendors-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Slug</th>
                    <th>Plan</th>
                    <th>POS</th>
                    <th>External ID</th>
                    <th>Status</th>
                    <th>Location</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVendors.map((vendor) => (
                    <tr key={vendor.id}>
                      <td>
                        <strong>{vendor.display_name}</strong>
                      </td>
                      <td>
                        <code className="slug-code">{vendor.slug}</code>
                      </td>
                      <td>
                        <span className="plan-badge">
                          {PLAN_LABELS[vendor.planId ?? 'trial'] ?? vendor.planId ?? 'Trial'}
                        </span>
                      </td>
                      <td>
                        <span 
                          className="pos-badge"
                          style={{
                            background: POS_COLORS[vendor.pos_provider]?.bg || 'rgba(255,255,255,0.1)',
                            color: POS_COLORS[vendor.pos_provider]?.text || 'var(--color-text)'
                          }}
                        >
                          {POS_LABELS[vendor.pos_provider] || vendor.pos_provider}
                        </span>
                      </td>
                      <td>
                        <code className="location-code">{vendor.square_location_id}</code>
                      </td>
                      <td>
                        <span className={`status-badge ${vendor.status || 'active'}`}>
                          {vendor.status || 'active'}
                        </span>
                      </td>
                      <td>
                        {vendor.city && vendor.state ? (
                          <span>{vendor.city}, {vendor.state}</span>
                        ) : vendor.address_line1 ? (
                          <span>{vendor.address_line1}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        <div className="action-buttons">
                          <Link href={`/vendors/${vendor.slug}`} className="btn-link">
                            View
                          </Link>
                          <a
                            href={`https://${vendor.slug}.countrtop.com`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-link"
                          >
                            Site
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {searchQuery && (
                <div className="search-results-info">
                  Showing {filteredVendors.length} of {vendors.length} vendors
                </div>
              )}
            </div>
          )}
        </div>

          <style jsx global>{`
          .page {
            min-height: 100vh;
            background: var(--ct-bg-primary);
            color: var(--ct-text);
            font-family: var(--ct-font-body);
          }

          .page-header {
            padding: 32px 48px;
            border-bottom: 1px solid var(--color-border);
          }

          .header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 16px;
          }

          .page-header h1 {
            font-size: 32px;
            font-weight: 700;
            margin: 0;
            background: var(--ct-gradient-primary);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .header-actions {
            display: flex;
            gap: 12px;
            align-items: center;
          }

          .btn-new-vendor {
            padding: 8px 16px;
            border-radius: 8px;
            border: none;
            background: var(--ct-gradient-primary);
            color: white;
            text-decoration: none;
            font-weight: 600;
            font-size: 14px;
            transition: opacity 0.2s;
            display: inline-block;
          }

          .btn-new-vendor:hover {
            opacity: 0.9;
          }

          .search-input {
            padding: 8px 16px;
            border-radius: 8px;
            border: 1px solid var(--color-border);
            background: var(--ct-bg-surface);
            color: var(--color-text);
            font-size: 14px;
            font-family: inherit;
            width: 250px;
            transition: border-color 0.2s;
          }

          .search-input:focus {
            outline: none;
            border-color: var(--color-primary);
          }

          .search-input::placeholder {
            color: var(--color-text-muted);
          }

          .btn-refresh {
            padding: 8px 16px;
            border-radius: 8px;
            border: 1px solid var(--color-border);
            background: var(--color-bg-warm);
            color: var(--color-text);
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            transition: background 0.2s;
            font-family: inherit;
          }

          .btn-refresh:hover:not(:disabled) {
            background: rgba(232, 93, 4, 0.12);
          }

          .btn-refresh:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .page-content {
            max-width: 1400px;
            margin: 0 auto;
            padding: 48px;
          }

          .error-banner {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .error-banner p {
            margin: 0;
            color: #fca5a5;
          }

          .btn-retry {
            padding: 6px 12px;
            border-radius: 6px;
            border: 1px solid rgba(239, 68, 68, 0.3);
            background: rgba(239, 68, 68, 0.1);
            color: #fca5a5;
            font-size: 14px;
            cursor: pointer;
            font-family: inherit;
          }

          .btn-retry:hover {
            background: rgba(239, 68, 68, 0.2);
          }

          .loading-state,
          .empty-state {
            text-align: center;
            padding: 64px 32px;
            background: var(--ct-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 16px;
          }

          .loading-state p,
          .empty-state p {
            color: var(--color-text-muted);
            margin: 0;
            font-size: 16px;
          }

          .vendors-table-container {
            background: var(--ct-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 16px;
            overflow: hidden;
          }

          .vendors-table {
            width: 100%;
            border-collapse: collapse;
          }

          .vendors-table thead {
            background: var(--color-bg-warm);
          }

          .vendors-table th {
            padding: 16px;
            text-align: left;
            font-weight: 600;
            font-size: 14px;
            color: var(--color-text);
            border-bottom: 1px solid var(--color-border);
          }

          .vendors-table td {
            padding: 16px;
            border-bottom: 1px solid var(--color-border);
            font-size: 14px;
          }

          .vendors-table tbody tr:hover {
            background: var(--color-bg-warm);
          }

          .vendors-table tbody tr:last-child td {
            border-bottom: none;
          }

          .slug-code,
          .location-code {
            background: rgba(232, 93, 4, 0.12);
            padding: 4px 8px;
            border-radius: 4px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 12px;
            color: var(--color-primary);
          }

          .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            text-transform: capitalize;
          }

          .status-badge.active {
            background: rgba(34, 197, 94, 0.2);
            color: #86efac;
          }

          .status-badge.inactive {
            background: rgba(239, 68, 68, 0.2);
            color: #fca5a5;
          }

          .text-muted {
            color: var(--color-text-muted);
          }

          .action-buttons {
            display: flex;
            gap: 8px;
          }

          .btn-link {
            padding: 6px 12px;
            border-radius: 6px;
            border: 1px solid var(--color-border);
            background: var(--color-bg-warm);
            color: var(--color-text);
            text-decoration: none;
            font-size: 12px;
            font-weight: 600;
            transition: background 0.2s;
            display: inline-block;
          }

          .btn-link:hover {
            background: rgba(232, 93, 4, 0.12);
          }

          .search-results-info {
            padding: 16px;
            text-align: center;
            color: var(--color-text-muted);
            font-size: 14px;
            border-top: 1px solid var(--color-border);
          }

          /* POS Filter Tabs */
          .pos-filter-tabs {
            display: flex;
            gap: 8px;
            margin-top: 24px;
            padding-top: 16px;
            border-top: 1px solid var(--color-border);
          }

          .pos-tab {
            padding: 8px 16px;
            border-radius: 8px;
            border: 1px solid var(--color-border);
            background: var(--ct-bg-surface);
            color: var(--color-text-muted);
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            font-family: inherit;
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .pos-tab:hover {
            background: var(--color-bg-warm);
            color: var(--color-text);
          }

          .pos-tab.active {
            background: rgba(232, 93, 4, 0.15);
            border-color: var(--color-primary);
            color: var(--color-primary);
          }

          .pos-tab.pos-square.active {
            background: rgba(0, 128, 255, 0.2);
            border-color: #60a5fa;
            color: #60a5fa;
          }

          .pos-tab.pos-clover.active {
            background: rgba(34, 197, 94, 0.2);
            border-color: #86efac;
            color: #86efac;
          }

          .pos-tab.pos-toast.active {
            background: rgba(249, 115, 22, 0.2);
            border-color: #fdba74;
            color: #fdba74;
          }

          .pos-icon {
            font-size: 12px;
          }

          /* Plan Filter Tabs */
          .plan-filter-tabs {
            display: flex;
            gap: 8px;
            margin-top: 16px;
            padding-top: 16px;
            border-top: 1px solid var(--color-border);
          }

          .plan-tab {
            padding: 8px 16px;
            border-radius: 8px;
            border: 1px solid var(--color-border);
            background: var(--ct-bg-surface);
            color: var(--color-text-muted);
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            font-family: inherit;
          }

          .plan-tab:hover {
            background: var(--color-bg-warm);
            color: var(--color-text);
          }

          .plan-tab.active {
            background: rgba(232, 93, 4, 0.15);
            border-color: var(--color-primary);
            color: var(--color-primary);
          }

          .plan-badge {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            background: rgba(232, 93, 4, 0.12);
            color: var(--color-primary);
          }

          /* POS Badge in table */
          .pos-badge {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
          }

          @media (max-width: 768px) {
            .page-header {
              padding: 24px;
            }

            .header-content {
              flex-direction: column;
              align-items: flex-start;
            }

            .search-input {
              width: 100%;
            }

            .page-content {
              padding: 24px;
            }

            .vendors-table-container {
              overflow-x: auto;
            }

            .vendors-table {
              min-width: 800px;
            }
          }
          `}</style>
        </main>
      </OpsAdminLayout>
    </>
  );
}
