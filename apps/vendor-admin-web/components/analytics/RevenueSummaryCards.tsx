import type { RevenueBySource, RevenuePoint } from '@countrtop/models';

type RevenueSummaryCardsProps = {
  revenueBySource: RevenueBySource;
  revenueSeries?: RevenuePoint[];
  loading?: boolean;
};

/**
 * Revenue Summary Cards
 * Displays key revenue KPIs
 */
export function RevenueSummaryCards({ revenueBySource, revenueSeries, loading }: RevenueSummaryCardsProps) {
  if (loading) {
    return (
      <div className="summary-cards">
        <div className="summary-card">
          <div className="card-loading">Loading...</div>
        </div>
      </div>
    );
  }

  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;
  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

  // Calculate totals from revenue series if provided
  const totalRevenue = revenueSeries
    ? revenueSeries.reduce((sum, point) => sum + point.revenue, 0)
    : revenueBySource.countrtop_online.revenue + revenueBySource.square_pos.revenue;

  const totalOrders = revenueSeries
    ? revenueSeries.reduce((sum, point) => sum + point.orderCount, 0)
    : revenueBySource.countrtop_online.orderCount + revenueBySource.square_pos.orderCount;

  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const onlinePercent = totalRevenue > 0
    ? (revenueBySource.countrtop_online.revenue / totalRevenue) * 100
    : 0;

  const posPercent = totalRevenue > 0
    ? (revenueBySource.square_pos.revenue / totalRevenue) * 100
    : 0;

  return (
    <div className="summary-cards">
      <div className="summary-header">
        <h3>Revenue Summary</h3>
      </div>
      <div className="cards-grid">
        <div className="summary-card accent">
          <div className="card-label">Total Revenue</div>
          <div className="card-value">{formatCurrency(totalRevenue)}</div>
          <div className="card-meta">
            {totalOrders} orders
          </div>
        </div>

        <div className="summary-card">
          <div className="card-label">Average Order Value</div>
          <div className="card-value">{formatCurrency(avgOrderValue)}</div>
          <div className="card-meta">
            Across all orders
          </div>
        </div>

        <div className="summary-card">
          <div className="card-label">Online Revenue</div>
          <div className="card-value">{formatCurrency(revenueBySource.countrtop_online.revenue)}</div>
          <div className="card-meta">
            {formatPercent(onlinePercent)} of total
          </div>
        </div>

        <div className="summary-card">
          <div className="card-label">POS Revenue</div>
          <div className="card-value">{formatCurrency(revenueBySource.square_pos.revenue)}</div>
          <div className="card-meta">
            {formatPercent(posPercent)} of total
          </div>
        </div>
      </div>

      <style jsx>{`
        .summary-cards {
          background: var(--ct-bg-surface);
          border: 1px solid var(--color-border);
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 32px;
        }

        .summary-header {
          margin-bottom: 20px;
        }

        .summary-header h3 {
          font-size: 18px;
          font-weight: 600;
          color: var(--color-text);
          margin: 0;
        }

        .cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
        }

        .summary-card {
          background: var(--ct-bg-surface);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 20px;
        }

        .summary-card.accent {
          background: rgba(232, 93, 4, 0.12);
          border-color: rgba(232, 93, 4, 0.3);
        }

        .card-label {
          font-size: 12px;
          font-weight: 500;
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }

        .card-value {
          font-size: 32px;
          font-weight: 700;
          color: var(--color-text);
          margin-bottom: 8px;
        }

        .card-meta {
          font-size: 14px;
          color: var(--color-text-muted);
        }

        .card-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100px;
          color: var(--color-text-muted);
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}

