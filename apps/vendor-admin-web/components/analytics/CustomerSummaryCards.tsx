import type { CustomerSummary } from '@countrtop/models';

type CustomerSummaryCardsProps = {
  data: CustomerSummary;
  loading?: boolean;
};

/**
 * Customer summary metrics cards
 * Note: All metrics shown are for CountrTop online orders only
 */
export function CustomerSummaryCards({ data, loading }: CustomerSummaryCardsProps) {
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

  return (
    <div className="summary-cards">
      <div className="summary-header">
        <h3>Customer Analytics</h3>
        <span className="scope-label">CountrTop Online Only</span>
      </div>
      <div className="cards-grid">
        <div className="summary-card">
          <div className="card-label">Total Customers</div>
          <div className="card-value">{data.totalCustomers.toLocaleString()}</div>
          <div className="card-meta">
            {data.newCustomers} new, {data.returningCustomers} returning
          </div>
        </div>

        <div className="summary-card">
          <div className="card-label">Repeat Customers</div>
          <div className="card-value">{data.repeatCustomers.toLocaleString()}</div>
          <div className="card-meta">
            {formatPercent(data.repeatCustomerRate)} repeat rate
          </div>
        </div>

        <div className="summary-card">
          <div className="card-label">Avg Orders/Customer</div>
          <div className="card-value">{data.averageOrdersPerCustomer.toFixed(1)}</div>
          <div className="card-meta">
            Across all customers
          </div>
        </div>

        <div className="summary-card accent">
          <div className="card-label">Avg Lifetime Value</div>
          <div className="card-value">{formatCurrency(data.averageLifetimeValue)}</div>
          <div className="card-meta">
            Per customer
          </div>
        </div>
      </div>

      <style jsx>{`
        .summary-cards {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 24px;
        }

        .summary-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .summary-header h3 {
          font-size: 18px;
          font-weight: 600;
          color: #e8e8e8;
          margin: 0;
        }

        .scope-label {
          font-size: 12px;
          font-weight: 500;
          color: #a78bfa;
          background: rgba(167, 139, 250, 0.1);
          padding: 4px 12px;
          border-radius: 4px;
          border: 1px solid rgba(167, 139, 250, 0.2);
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

