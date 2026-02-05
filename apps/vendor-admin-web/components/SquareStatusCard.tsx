import { useState, useEffect, useCallback } from 'react';

type SquareStatusData = {
  squareConnected: boolean;
  locationSelected: boolean;
  menuSynced: boolean;
  paymentsActivated: boolean | null;
  paymentsCheckedAt: string | null;
  paymentsError: string | null;
  paymentsLocationId: string | null;
};

type Props = {
  vendorSlug: string | null;
};

const SQUARE_DASHBOARD_URL = 'https://squareup.com/dashboard';

export function SquareStatusCard({ vendorSlug }: Props) {
  const [status, setStatus] = useState<SquareStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [rechecking, setRechecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!vendorSlug) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/vendors/${vendorSlug}/square-payments-status`, { credentials: 'include' });
      const data = await res.json();
      if (data.success && data.data) {
        setStatus(data.data);
      } else {
        setError(data.error ?? 'Failed to load status');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load status');
    } finally {
      setLoading(false);
    }
  }, [vendorSlug]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleRecheck = async () => {
    if (!vendorSlug || rechecking) return;
    setRechecking(true);
    setError(null);
    try {
      const res = await fetch(`/api/vendors/${vendorSlug}/square-payments-status`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success && data.data) {
        setStatus(data.data);
      } else {
        setError(data.error ?? 'Re-check failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Re-check failed');
    } finally {
      setRechecking(false);
    }
  };

  if (loading) {
    return (
      <section className="square-status-section">
        <h2 className="section-title">Getting Started</h2>
        <p className="muted">Loading Square status…</p>
        <style jsx>{statusCardStyles}</style>
      </section>
    );
  }

  if (error && !status) {
    return (
      <section className="square-status-section">
        <h2 className="section-title">Getting Started</h2>
        <div className="error-banner small">
          <p>{error}</p>
        </div>
        <style jsx>{statusCardStyles}</style>
      </section>
    );
  }

  if (!status) return null;

  const paymentsActionRequired =
    status.paymentsActivated === false || (status.paymentsActivated === null && status.squareConnected);

  return (
    <section className="square-status-section">
      <h2 className="section-title">Getting Started</h2>
      <p className="section-description">Complete these steps before going live with online ordering</p>

      <div className="readiness-list">
        <div className={`readiness-item ${status.squareConnected ? 'done' : ''}`}>
          <span className="readiness-icon">{status.squareConnected ? '✅' : '○'}</span>
          <span className="readiness-label">Square Connected</span>
        </div>
        <div className={`readiness-item ${status.locationSelected ? 'done' : ''}`}>
          <span className="readiness-icon">{status.locationSelected ? '✅' : '○'}</span>
          <span className="readiness-label">Location Selected</span>
        </div>
        <div className={`readiness-item ${status.menuSynced ? 'done' : ''}`}>
          <span className="readiness-icon">{status.menuSynced ? '✅' : '○'}</span>
          <span className="readiness-label">Menu Synced</span>
        </div>
        <div className={`readiness-item ${status.paymentsActivated === true ? 'done' : paymentsActionRequired ? 'action' : ''}`}>
          <span className="readiness-icon">
            {status.paymentsActivated === true ? '✅' : paymentsActionRequired ? '⚠️' : '○'}
          </span>
          <span className="readiness-label">
            {status.paymentsActivated === true
              ? 'Payments Activated'
              : paymentsActionRequired
                ? 'Payments Activated — Action Required'
                : 'Payments Activated'}
          </span>
        </div>
      </div>

      {paymentsActionRequired && status.squareConnected && (
        <div className="action-required-card">
          <p className="action-title">Your Square account isn&apos;t activated for taking card payments in production yet.</p>
          <p className="action-steps">
            Complete Square activation (business info + bank account) in your{' '}
            <a href={SQUARE_DASHBOARD_URL} target="_blank" rel="noopener noreferrer">
              Square Dashboard
            </a>
            , then click Re-check.
          </p>
          {status.paymentsError && (
            <p className="action-error">Last check: {status.paymentsError}</p>
          )}
          <button
            type="button"
            className="btn-recheck"
            onClick={handleRecheck}
            disabled={rechecking}
          >
            {rechecking ? 'Checking…' : 'Re-check Square Activation'}
          </button>
        </div>
      )}

      {status.paymentsActivated === true && (
        <p className="success-note">All set! Your Square account is ready for production payments.</p>
      )}

      {error && (
        <div className="error-banner small">
          <p>{error}</p>
        </div>
      )}

      <style jsx>{statusCardStyles}</style>
    </section>
  );
}

const statusCardStyles = `
  .square-status-section {
    background: var(--ct-bg-surface);
    border: 1px solid var(--color-border);
    border-radius: 20px;
    padding: 28px;
    margin-bottom: 32px;
  }

  .square-status-section .section-title {
    font-size: 20px;
    font-weight: 600;
    margin: 0 0 8px;
    color: var(--color-text);
  }

  .square-status-section .section-description {
    font-size: 14px;
    color: var(--color-text-muted);
    margin: 0 0 24px;
  }

  .readiness-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .readiness-item {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 15px;
    color: var(--color-text-muted);
  }

  .readiness-item.done {
    color: var(--color-text);
  }

  .readiness-item.action {
    color: #f59e0b;
    font-weight: 500;
  }

  .readiness-icon {
    font-size: 18px;
    width: 24px;
    text-align: center;
  }

  .readiness-label {
    flex: 1;
  }

  .action-required-card {
    margin-top: 24px;
    padding: 20px;
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 12px;
  }

  .action-title {
    font-weight: 600;
    font-size: 15px;
    margin: 0 0 8px;
    color: var(--color-text);
  }

  .action-steps {
    font-size: 14px;
    color: var(--color-text-muted);
    margin: 0 0 16px;
    line-height: 1.5;
  }

  .action-steps a {
    color: var(--color-accent);
    text-decoration: underline;
  }

  .action-steps a:hover {
    color: var(--color-primary);
  }

  .action-error {
    font-size: 13px;
    color: #f87171;
    margin: 0 0 16px;
  }

  .btn-recheck {
    padding: 12px 20px;
    border-radius: 10px;
    border: none;
    background: var(--ct-gradient-primary);
    color: white;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    font-family: inherit;
  }

  .btn-recheck:hover:not(:disabled) {
    opacity: 0.95;
  }

  .btn-recheck:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .success-note {
    margin-top: 16px;
    font-size: 14px;
    color: var(--color-success, #22c55e);
    font-weight: 500;
  }

  .error-banner.small {
    margin-top: 16px;
    padding: 12px 16px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
  }

  .error-banner.small p {
    margin: 0;
    font-size: 13px;
    color: #fca5a5;
  }

  .muted {
    color: var(--color-text-muted);
    font-size: 14px;
  }
`;
