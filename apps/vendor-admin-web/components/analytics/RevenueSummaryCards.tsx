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
    : revenueBySource.countrtopRevenue + revenueBySource.squarePosRevenue;

  const totalOrders = revenueSeries
    ? revenueSeries.reduce((sum, point) => sum + point.orderCount, 0)
    : revenueBySource.countrtopOrders + revenueBySource.squarePosOrders;

  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const onlinePercent = totalRevenue > 0
    ? (revenueBySource.countrtopRevenue / totalRevenue) * 100
    : 0;

  const posPercent = totalRevenue > 0
    ? (revenueBySource.squarePosRevenue / totalRevenue) * 100
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
          <div className="card-value">{formatCurrency(revenueBySource.countrtopRevenue)}</div>
          <div className="card-meta">
            {formatPercent(onlinePercent)} of total
          </div>
        </div>

        <div className="summary-card">
          <div className="card-label">POS Revenue</div>
          <div className="card-value">{formatCurrency(revenueBySource.squarePosRevenue)}</div>
          <div className="card-meta">
            {formatPercent(posPercent)} of total
          </div>
        </div>
      </div>

      <style jsx>{`
        .summary-cards {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
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
          color: #e8e8e8;
          margin: 0;
        }

        .cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
        }

        .summary-card {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 20px;
        }

        .summary-card.accent {
          background: linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%);
          border-color: rgba(102, 126, 234, 0.3);
        }

        .card-label {
          font-size: 12px;
          font-weight: 500;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }

        .card-value {
          font-size: 32px;
          font-weight: 700;
          color: #e8e8e8;
          margin-bottom: 8px;
        }

        .card-meta {
          font-size: 14px;
          color: #666;
        }

        .card-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100px;
          color: #888;
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}

