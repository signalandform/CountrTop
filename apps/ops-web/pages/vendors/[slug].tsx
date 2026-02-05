import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useState, useEffect } from 'react';
import { OpsAdminLayout } from '../../components/OpsAdminLayout';

import { requireOpsAdmin } from '../../lib/auth';
import { getMilestoneLabel } from '../../lib/milestones';

type BillingInfo = {
  planId: string;
  status: string;
  currentPeriodEnd: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
};

type Vendor = {
  id: string;
  slug: string;
  display_name: string;
  square_location_id: string;
  square_credential_ref?: string | null;
  status?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  timezone?: string | null;
  pickup_instructions?: string | null;
  kds_active_limit_total?: number | null;
  kds_active_limit_ct?: number | null;
  admin_user_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  billing?: BillingInfo | null;
};

const PLAN_LABELS: Record<string, string> = {
  beta: 'Beta',
  trial: 'Trial',
  starter: 'Starter',
  pro: 'Pro'
};

type Props = {
  userEmail: string;
  vendorSlug: string;
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

  const slugParam = context.params?.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

  return {
    props: {
      userEmail: authResult.userEmail,
      vendorSlug: slug || ''
    }
  };
};

export default function VendorDetailPage({ userEmail, vendorSlug }: Props) {
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});
  const [flagsLoading, setFlagsLoading] = useState(false);
  const [togglingFlag, setTogglingFlag] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSuccess, setAdminSuccess] = useState(false);
  const [milestones, setMilestones] = useState<{ milestone: number; claimedAt: string | null }[]>([]);
  const [milestonesLoading, setMilestonesLoading] = useState(false);
  const [claimingMilestone, setClaimingMilestone] = useState<number | null>(null);

  const fetchVendor = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/vendors/${vendorSlug}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setVendor(data.vendor);
      } else {
        throw new Error(data.error || 'Failed to fetch vendor');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vendor');
    } finally {
      setLoading(false);
    }
  };

  const fetchFeatureFlags = async () => {
    if (!vendorSlug) return;
    try {
      setFlagsLoading(true);
      const response = await fetch(`/api/vendors/${vendorSlug}/feature-flags`, {
        credentials: 'include'
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to fetch feature flags:', data.error);
        return;
      }

      const data = await response.json();
      if (data.success) {
        setFeatureFlags(data.flags || {});
      }
    } catch (err) {
      console.error('Error fetching feature flags:', err);
    } finally {
      setFlagsLoading(false);
    }
  };

  const toggleFeatureFlag = async (featureKey: string, enabled: boolean) => {
    if (!vendorSlug) return;
    try {
      setTogglingFlag(featureKey);
      const response = await fetch(`/api/vendors/${vendorSlug}/feature-flags`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          featureKey,
          enabled
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      // Update local state
      setFeatureFlags(prev => ({
        ...prev,
        [featureKey]: enabled
      }));
    } catch (err) {
      alert(`Failed to update feature flag: ${err instanceof Error ? err.message : 'Unknown error'}`);
      // Revert by refetching
      fetchFeatureFlags();
    } finally {
      setTogglingFlag(null);
    }
  };

  const fetchMilestones = async () => {
    if (!vendorSlug) return;
    try {
      setMilestonesLoading(true);
      const response = await fetch(`/api/vendors/${vendorSlug}/milestones`, {
        credentials: 'include'
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to fetch milestones:', data.error);
        return;
      }

      const data = await response.json();
      if (data.success) {
        setMilestones(
          (data.milestones || []).map((m: { milestone: number; claimedAt: string | null }) => ({
            milestone: m.milestone,
            claimedAt: m.claimedAt
          }))
        );
      }
    } catch (err) {
      console.error('Error fetching milestones:', err);
    } finally {
      setMilestonesLoading(false);
    }
  };

  const handleClaimMilestone = async (milestone: number) => {
    if (!vendorSlug) return;
    try {
      setClaimingMilestone(milestone);
      const response = await fetch(`/api/vendors/${vendorSlug}/milestones/${milestone}/claim`, {
        method: 'PATCH',
        credentials: 'include'
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      await fetchMilestones();
    } catch (err) {
      alert(`Failed to mark claimed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setClaimingMilestone(null);
    }
  };

  const handleSetVendorAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorSlug) return;
    setAdminError(null);
    setAdminSuccess(false);
    const email = adminEmail.trim();
    const password = adminPassword;
    if (!email || password.length < 8) {
      setAdminError('Email and password (min 8 characters) are required.');
      return;
    }
    setAdminSubmitting(true);
    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ admin_email: email, admin_password: password })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      setAdminSuccess(true);
      setAdminEmail('');
      setAdminPassword('');
      fetchVendor();
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Failed to set vendor admin');
    } finally {
      setAdminSubmitting(false);
    }
  };

  useEffect(() => {
    if (vendorSlug) {
      fetchVendor();
      fetchFeatureFlags();
      fetchMilestones();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorSlug]);

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '—';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  return (
    <>
      <Head>
        <title>{vendor ? `${vendor.display_name} – Vendor Details` : 'Vendor Details – CountrTop Ops'}</title>
      </Head>
      <OpsAdminLayout userEmail={userEmail}>
        <main className="page">
          <header className="page-header">
            <h1>{vendor ? vendor.display_name : 'Vendor Details'}</h1>
          </header>

        <div className="page-content">
          {error && (
            <div className="error-banner">
              <p>{error}</p>
              <button onClick={fetchVendor} className="btn-retry">Retry</button>
            </div>
          )}

          {loading ? (
            <div className="loading-state">
              <p>Loading vendor details...</p>
            </div>
          ) : !vendor ? (
            <div className="empty-state">
              <p>Vendor not found.</p>
            </div>
          ) : (
            <div className="vendor-details">
              <div className="detail-section">
                <h2>Basic Information</h2>
                <div className="detail-grid">
                  <div className="detail-item">
                    <label>Display Name</label>
                    <div className="detail-value">{vendor.display_name}</div>
                  </div>
                  <div className="detail-item">
                    <label>Slug</label>
                    <div className="detail-value">
                      <code>{vendor.slug}</code>
                    </div>
                  </div>
                  <div className="detail-item">
                    <label>Status</label>
                    <div className="detail-value">
                      <span className={`status-badge ${vendor.status || 'active'}`}>
                        {vendor.status || 'active'}
                      </span>
                    </div>
                  </div>
                  <div className="detail-item">
                    <label>Square Location ID</label>
                    <div className="detail-value">
                      <code>{vendor.square_location_id}</code>
                    </div>
                  </div>
                  {vendor.square_credential_ref && (
                    <div className="detail-item">
                      <label>Square Credential Ref</label>
                      <div className="detail-value">
                        <code>{vendor.square_credential_ref}</code>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="detail-section">
                <h2>Location</h2>
                <div className="detail-grid">
                  {vendor.address_line1 && (
                    <div className="detail-item">
                      <label>Address Line 1</label>
                      <div className="detail-value">{vendor.address_line1}</div>
                    </div>
                  )}
                  {vendor.address_line2 && (
                    <div className="detail-item">
                      <label>Address Line 2</label>
                      <div className="detail-value">{vendor.address_line2}</div>
                    </div>
                  )}
                  {vendor.city && (
                    <div className="detail-item">
                      <label>City</label>
                      <div className="detail-value">{vendor.city}</div>
                    </div>
                  )}
                  {vendor.state && (
                    <div className="detail-item">
                      <label>State</label>
                      <div className="detail-value">{vendor.state}</div>
                    </div>
                  )}
                  {vendor.postal_code && (
                    <div className="detail-item">
                      <label>Postal Code</label>
                      <div className="detail-value">{vendor.postal_code}</div>
                    </div>
                  )}
                  {vendor.phone && (
                    <div className="detail-item">
                      <label>Phone</label>
                      <div className="detail-value">{vendor.phone}</div>
                    </div>
                  )}
                  {vendor.timezone && (
                    <div className="detail-item">
                      <label>Timezone</label>
                      <div className="detail-value">{vendor.timezone}</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="detail-section">
                <h2>Settings</h2>
                <div className="detail-grid">
                  {vendor.pickup_instructions && (
                    <div className="detail-item full-width">
                      <label>Pickup Instructions</label>
                      <div className="detail-value">{vendor.pickup_instructions}</div>
                    </div>
                  )}
                  {vendor.kds_active_limit_total !== null && (
                    <div className="detail-item">
                      <label>KDS Active Limit (Total)</label>
                      <div className="detail-value">{vendor.kds_active_limit_total}</div>
                    </div>
                  )}
                  {vendor.kds_active_limit_ct !== null && (
                    <div className="detail-item">
                      <label>KDS Active Limit (Count)</label>
                      <div className="detail-value">{vendor.kds_active_limit_ct}</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="detail-section">
                <h2>Feature Flags</h2>
                <p className="flags-context">
                  Feature flags are available on Starter and Pro plans. This vendor is on{' '}
                  <strong>{PLAN_LABELS[vendor.billing?.planId ?? 'beta'] ?? vendor.billing?.planId ?? 'Beta'}</strong>.
                </p>
                {flagsLoading ? (
                  <div className="flags-loading">
                    <p>Loading feature flags...</p>
                  </div>
                ) : Object.keys(featureFlags).length === 0 ? (
                  <div className="flags-empty">
                    <p>No feature flags configured for this vendor.</p>
                  </div>
                ) : (
                  <div className="flags-list">
                    {Object.entries(featureFlags).map(([key, enabled]) => (
                      <div key={key} className="flag-item">
                        <div className="flag-info">
                          <label className="flag-key">{key}</label>
                          <span className={`flag-status ${enabled ? 'enabled' : 'disabled'}`}>
                            {enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <label className="toggle-switch">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) => toggleFeatureFlag(key, e.target.checked)}
                            disabled={togglingFlag === key}
                          />
                          <span className="toggle-slider"></span>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flags-actions">
                  <button
                    onClick={fetchFeatureFlags}
                    className="btn-refresh-flags"
                    disabled={flagsLoading}
                  >
                    {flagsLoading ? 'Refreshing...' : 'Refresh Flags'}
                  </button>
                </div>
              </div>

              <div className="detail-section">
                <h2>Order Milestones</h2>
                <p className="milestones-context">
                  Incentive milestones (t-shirt at 500, plaque at 1,000) for CountrTop online orders.
                  Mark as claimed when the incentive has been fulfilled.
                </p>
                {milestonesLoading ? (
                  <div className="milestones-loading">
                    <p>Loading milestones...</p>
                  </div>
                ) : milestones.length === 0 ? (
                  <div className="milestones-empty">
                    <p>No incentive milestones for this vendor.</p>
                  </div>
                ) : (
                  <div className="milestones-list">
                    {milestones.map((m) => (
                      <div key={m.milestone} className="milestone-item">
                        <div className="milestone-info">
                          <label className="milestone-label">{getMilestoneLabel(m.milestone)}</label>
                          <span
                            className={`milestone-status ${m.claimedAt ? 'claimed' : 'pending'}`}
                          >
                            {m.claimedAt ? 'Claimed' : 'Pending'}
                          </span>
                        </div>
                        {!m.claimedAt && (
                          <button
                            type="button"
                            className="btn-claim-milestone"
                            onClick={() => handleClaimMilestone(m.milestone)}
                            disabled={claimingMilestone === m.milestone}
                          >
                            {claimingMilestone === m.milestone ? 'Claiming...' : 'Mark claimed'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="milestones-actions">
                  <button
                    onClick={fetchMilestones}
                    className="btn-refresh-milestones"
                    disabled={milestonesLoading}
                  >
                    {milestonesLoading ? 'Refreshing...' : 'Refresh Milestones'}
                  </button>
                </div>
              </div>

              <div className="detail-section">
                <h2>Metadata</h2>
                <div className="detail-grid">
                  {vendor.admin_user_id && (
                    <div className="detail-item">
                      <label>Admin User ID</label>
                      <div className="detail-value">
                        <code>{vendor.admin_user_id}</code>
                      </div>
                    </div>
                  )}
                  <div className="detail-item">
                    <label>Created At</label>
                    <div className="detail-value">{formatDate(vendor.created_at)}</div>
                  </div>
                  <div className="detail-item">
                    <label>Updated At</label>
                    <div className="detail-value">{formatDate(vendor.updated_at)}</div>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h2>Vendor Admin</h2>
                <p className="admin-context">
                  {vendor.admin_user_id
                    ? 'Change the vendor admin login. This creates a new Auth user and links it to this vendor (replacing the previous admin).'
                    : 'Set the vendor admin login so they can access vendor admin. Creates a Supabase Auth user and links it to this vendor.'}
                </p>
                {adminSuccess && (
                  <div className="admin-success">
                    Vendor admin set successfully. They can now sign in at vendor admin with the email and password you provided.
                  </div>
                )}
                {adminError && (
                  <div className="admin-error">
                    {adminError}
                  </div>
                )}
                <form onSubmit={handleSetVendorAdmin} className="admin-form">
                  <div className="form-row">
                    <label htmlFor="admin_email">Admin email</label>
                    <input
                      id="admin_email"
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="admin@vendor.com"
                      required
                      disabled={adminSubmitting}
                      className="admin-input"
                    />
                  </div>
                  <div className="form-row">
                    <label htmlFor="admin_password">Password (min 8 characters)</label>
                    <input
                      id="admin_password"
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={8}
                      disabled={adminSubmitting}
                      className="admin-input"
                    />
                  </div>
                  <button type="submit" className="btn-set-admin" disabled={adminSubmitting}>
                    {adminSubmitting ? 'Setting...' : vendor.admin_user_id ? 'Change vendor admin' : 'Set vendor admin'}
                  </button>
                </form>
              </div>

              <div className="action-section">
                <a
                  href={`https://${vendor.slug}.countrtop.com`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                >
                  View Customer Site
                </a>
                <a
                  href={`https://admin.countrtop.com/vendors/${vendor.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary"
                >
                  View Vendor Admin
                </a>
              </div>
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

          .page-header h1 {
            font-size: 32px;
            font-weight: 700;
            margin: 0;
            background: var(--ct-gradient-primary);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .page-content {
            max-width: 1200px;
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

          .vendor-details {
            display: flex;
            flex-direction: column;
            gap: 32px;
          }

          .detail-section {
            background: var(--ct-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 16px;
            padding: 32px;
          }

          .detail-section h2 {
            font-size: 20px;
            font-weight: 600;
            margin: 0 0 24px;
            color: var(--color-text);
            border-bottom: 1px solid var(--color-border);
            padding-bottom: 12px;
          }

          .detail-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 24px;
          }

          .detail-item {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .detail-item.full-width {
            grid-column: 1 / -1;
          }

          .detail-item label {
            font-size: 12px;
            font-weight: 600;
            color: var(--color-text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .detail-value {
            font-size: 16px;
            color: var(--color-text);
          }

          .detail-value code {
            background: rgba(232, 93, 4, 0.12);
            padding: 4px 8px;
            border-radius: 4px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 14px;
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

          .flags-context {
            margin: 0 0 20px;
            font-size: 14px;
            color: var(--color-text-muted);
          }

          .flags-context strong {
            color: var(--color-text);
          }

          .flags-loading,
          .flags-empty {
            text-align: center;
            padding: 32px;
            color: var(--color-text-muted);
          }

          .flags-loading p,
          .flags-empty p {
            margin: 0;
            font-size: 14px;
          }

          .flags-list {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }

          .flag-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px;
            background: var(--ct-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 8px;
            transition: background 0.2s;
          }

          .flag-item:hover {
            background: var(--color-bg-warm);
          }

          .flag-info {
            display: flex;
            flex-direction: column;
            gap: 4px;
            flex: 1;
          }

          .flag-key {
            font-size: 14px;
            font-weight: 600;
            color: var(--color-text);
            font-family: 'Monaco', 'Menlo', monospace;
          }

          .flag-status {
            font-size: 12px;
            font-weight: 500;
          }

          .flag-status.enabled {
            color: #86efac;
          }

          .flag-status.disabled {
            color: var(--color-text-muted);
          }

          .toggle-switch {
            position: relative;
            display: inline-block;
            width: 48px;
            height: 24px;
            margin: 0;
            cursor: pointer;
          }

          .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
          }

          .toggle-slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(255, 255, 255, 0.2);
            transition: 0.3s;
            border-radius: 24px;
          }

          .toggle-slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: 0.3s;
            border-radius: 50%;
          }

          .toggle-switch input:checked + .toggle-slider {
            background-color: var(--color-primary);
          }

          .toggle-switch input:checked + .toggle-slider:before {
            transform: translateX(24px);
          }

          .toggle-switch input:disabled + .toggle-slider {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .flags-actions {
            margin-top: 24px;
            padding-top: 24px;
            border-top: 1px solid var(--color-border);
          }

          .btn-refresh-flags {
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

          .btn-refresh-flags:hover:not(:disabled) {
            background: rgba(232, 93, 4, 0.12);
          }

          .btn-refresh-flags:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .milestones-context {
            margin: 0 0 20px;
            font-size: 14px;
            color: var(--color-text-muted);
          }

          .milestones-loading,
          .milestones-empty {
            text-align: center;
            padding: 32px;
            color: var(--color-text-muted);
          }

          .milestones-loading p,
          .milestones-empty p {
            margin: 0;
            font-size: 14px;
          }

          .milestones-list {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }

          .milestone-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px;
            background: var(--ct-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 12px;
          }

          .milestone-info {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .milestone-label {
            font-weight: 500;
            font-size: 15px;
          }

          .milestone-status {
            font-size: 13px;
            padding: 4px 10px;
            border-radius: 8px;
          }

          .milestone-status.claimed {
            background: rgba(34, 197, 94, 0.15);
            color: #22c55e;
          }

          .milestone-status.pending {
            background: rgba(232, 93, 4, 0.15);
            color: var(--color-accent);
          }

          .btn-claim-milestone {
            padding: 8px 16px;
            border-radius: 8px;
            border: 1px solid var(--color-accent);
            background: rgba(232, 93, 4, 0.12);
            color: var(--color-accent);
            font-weight: 500;
            cursor: pointer;
          }

          .btn-claim-milestone:hover:not(:disabled) {
            background: rgba(232, 93, 4, 0.2);
          }

          .btn-claim-milestone:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .milestones-actions {
            margin-top: 24px;
            padding-top: 24px;
            border-top: 1px solid var(--color-border);
          }

          .btn-refresh-milestones {
            padding: 8px 16px;
            border-radius: 8px;
            border: 1px solid var(--color-border);
            background: var(--color-bg-warm);
            color: var(--color-text);
            font-size: 14px;
            cursor: pointer;
          }

          .btn-refresh-milestones:hover:not(:disabled) {
            background: rgba(232, 93, 4, 0.12);
          }

          .btn-refresh-milestones:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .admin-context {
            margin: 0 0 16px;
            font-size: 14px;
            color: var(--color-text-muted);
          }

          .admin-success {
            margin-bottom: 16px;
            padding: 12px 16px;
            background: rgba(34, 197, 94, 0.1);
            border: 1px solid rgba(34, 197, 94, 0.3);
            border-radius: 8px;
            color: #86efac;
            font-size: 14px;
          }

          .admin-error {
            margin-bottom: 16px;
            padding: 12px 16px;
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 8px;
            color: #fca5a5;
            font-size: 14px;
          }

          .admin-form {
            display: flex;
            flex-direction: column;
            gap: 16px;
            max-width: 400px;
          }

          .admin-form .form-row {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }

          .admin-form .form-row label {
            font-size: 12px;
            font-weight: 600;
            color: var(--color-text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .admin-input {
            padding: 10px 12px;
            border: 1px solid var(--color-border);
            border-radius: 8px;
            background: var(--ct-bg-primary);
            color: var(--color-text);
            font-size: 14px;
            font-family: inherit;
          }

          .admin-input:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .btn-set-admin {
            padding: 10px 20px;
            border-radius: 8px;
            border: none;
            background: var(--ct-gradient-primary);
            color: white;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            align-self: flex-start;
            font-family: inherit;
          }

          .btn-set-admin:hover:not(:disabled) {
            opacity: 0.9;
          }

          .btn-set-admin:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .action-section {
            display: flex;
            gap: 16px;
            padding-top: 16px;
            border-top: 1px solid var(--color-border);
          }

          .btn-primary,
          .btn-secondary {
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            font-size: 14px;
            transition: opacity 0.2s;
            display: inline-block;
          }

          .btn-primary {
            background: var(--ct-gradient-primary);
            color: white;
          }

          .btn-primary:hover {
            opacity: 0.9;
          }

          .btn-secondary {
            border: 1px solid var(--color-border);
            background: var(--color-bg-warm);
            color: var(--color-text);
          }

          .btn-secondary:hover {
            background: rgba(232, 93, 4, 0.12);
          }

          @media (max-width: 768px) {
            .page-header {
              padding: 24px;
            }

            .page-content {
              padding: 24px;
            }

            .detail-section {
              padding: 24px;
            }

            .detail-grid {
              grid-template-columns: 1fr;
            }

            .action-section {
              flex-direction: column;
            }
          }
          `}</style>
        </main>
      </OpsAdminLayout>
    </>
  );
}

