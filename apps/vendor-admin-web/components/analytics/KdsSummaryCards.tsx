import type { KdsSummary } from '@countrtop/models';

type KdsSummaryCardsProps = {
  summary: KdsSummary;
  loading?: boolean;
};

/**
 * KDS Summary KPI cards
 */
export function KdsSummaryCards({ summary, loading }: KdsSummaryCardsProps) {
  if (loading) {
    return (
      <div className="summary-cards">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="stat-card loading">
            <div className="stat-label">Loading...</div>
            <div className="stat-value">-</div>
          </div>
        ))}
      </div>
    );
  }

  const formatNumber = (num: number | null, decimals = 1): string => {
    if (num === null || num === undefined || isNaN(num)) return 'N/A';
    return num.toFixed(decimals);
  };

  return (
    <div className="summary-cards">
      <div className="stat-card">
        <span className="stat-label">Tickets Placed</span>
        <span className="stat-value">{summary.totals.ticketsPlaced}</span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Tickets Ready</span>
        <span className="stat-value">{summary.totals.ticketsReady}</span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Tickets Completed</span>
        <span className="stat-value">{summary.totals.ticketsCompleted}</span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Avg Prep Time</span>
        <span className="stat-value">
          {summary.averages.prepTimeMinutes !== null
            ? `${formatNumber(summary.averages.prepTimeMinutes)} min`
            : 'N/A'}
        </span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Avg Total Time</span>
        <span className="stat-value">
          {summary.averages.totalTimeMinutes !== null
            ? `${formatNumber(summary.averages.totalTimeMinutes)} min`
            : 'N/A'}
        </span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Throughput</span>
        <span className="stat-value">
          {formatNumber(summary.throughput.ticketsPerDay)}/day
        </span>
        <span className="stat-helper">
          {formatNumber(summary.throughput.ticketsPerHour)}/hour
        </span>
      </div>

      <style jsx>{`
        .summary-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 16px;
          margin-bottom: 32px;
        }

        .stat-card {
          background: var(--ct-bg-surface);
          border: 1px solid var(--color-border);
          border-radius: 12px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .stat-card.loading {
          opacity: 0.5;
          pointer-events: none;
        }

        .stat-label {
          font-size: 12px;
          font-weight: 500;
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .stat-value {
          font-size: 24px;
          font-weight: 700;
          color: var(--color-text);
          line-height: 1.2;
        }

        .stat-helper {
          font-size: 12px;
          color: var(--color-text-muted);
          margin-top: 4px;
        }
      `}</style>
    </div>
  );
}

