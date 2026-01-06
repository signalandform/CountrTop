import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useState, useEffect } from 'react';

import { requireOpsAdmin } from '../lib/auth';

type Vendor = {
  id: string;
  slug: string;
  display_name: string;
  square_location_id: string;
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function VendorsPage({ userEmail: _userEmail }: Props) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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

  return (
    <>
      <Head>
        <title>Vendor Management – CountrTop Ops</title>
      </Head>
      <main className="page">
        <header className="page-header">
          <Link href="/" className="back-link">← Back to Dashboard</Link>
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
                    <th>Location ID</th>
                    <th>Status</th>
                    <th>Location</th>
                    <th>Timezone</th>
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
                        {vendor.timezone ? (
                          <span>{vendor.timezone}</span>
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
            background: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%);
            color: #e8e8e8;
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
          }

          .page-header {
            padding: 32px 48px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          }

          .back-link {
            display: inline-block;
            margin-bottom: 16px;
            color: #a78bfa;
            text-decoration: none;
            font-size: 14px;
            transition: color 0.2s;
          }

          .back-link:hover {
            color: #8b5cf6;
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
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
            border: 1px solid rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.05);
            color: #e8e8e8;
            font-size: 14px;
            font-family: inherit;
            width: 250px;
            transition: border-color 0.2s;
          }

          .search-input:focus {
            outline: none;
            border-color: #667eea;
          }

          .search-input::placeholder {
            color: #888;
          }

          .btn-refresh {
            padding: 8px 16px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.05);
            color: #e8e8e8;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            transition: background 0.2s;
            font-family: inherit;
          }

          .btn-refresh:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.1);
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
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
          }

          .loading-state p,
          .empty-state p {
            color: #888;
            margin: 0;
            font-size: 16px;
          }

          .vendors-table-container {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            overflow: hidden;
          }

          .vendors-table {
            width: 100%;
            border-collapse: collapse;
          }

          .vendors-table thead {
            background: rgba(255, 255, 255, 0.05);
          }

          .vendors-table th {
            padding: 16px;
            text-align: left;
            font-weight: 600;
            font-size: 14px;
            color: #e8e8e8;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          }

          .vendors-table td {
            padding: 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            font-size: 14px;
          }

          .vendors-table tbody tr:hover {
            background: rgba(255, 255, 255, 0.05);
          }

          .vendors-table tbody tr:last-child td {
            border-bottom: none;
          }

          .slug-code,
          .location-code {
            background: rgba(102, 126, 234, 0.2);
            padding: 4px 8px;
            border-radius: 4px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 12px;
            color: #a78bfa;
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
            color: #888;
          }

          .action-buttons {
            display: flex;
            gap: 8px;
          }

          .btn-link {
            padding: 6px 12px;
            border-radius: 6px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.05);
            color: #e8e8e8;
            text-decoration: none;
            font-size: 12px;
            font-weight: 600;
            transition: background 0.2s;
            display: inline-block;
          }

          .btn-link:hover {
            background: rgba(255, 255, 255, 0.1);
          }

          .search-results-info {
            padding: 16px;
            text-align: center;
            color: #888;
            font-size: 14px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
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
    </>
  );
}
