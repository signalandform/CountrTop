import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { RevenueBySource } from '@countrtop/models';

type RevenueBySourceChartProps = {
  data: RevenueBySource;
  loading?: boolean;
};

/**
 * Revenue breakdown by source (online vs POS)
 */
export function RevenueBySourceChart({ data, loading }: RevenueBySourceChartProps) {
  if (loading) {
    return (
      <div className="comparison-container">
        <div className="comparison-loading">Loading comparison data...</div>
      </div>
    );
  }

  const chartData = [
    {
      source: 'Online',
      revenue: data.countrtop_online.revenue,
      orderCount: data.countrtop_online.orderCount,
      averageOrderValue: data.countrtop_online.averageOrderValue
    },
    {
      source: 'POS',
      revenue: data.square_pos.revenue,
      orderCount: data.square_pos.orderCount,
      averageOrderValue: data.square_pos.averageOrderValue
    },
    {
      source: 'Total',
      revenue: data.total.revenue,
      orderCount: data.total.orderCount,
      averageOrderValue: data.total.averageOrderValue
    }
  ];

  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;

  return (
    <div className="comparison-container">
      <div className="comparison-cards">
        <div className="comparison-card">
          <div className="comparison-label">Online Revenue</div>
          <div className="comparison-value">{formatCurrency(data.countrtop_online.revenue)}</div>
          <div className="comparison-metrics">
            <div className="metric">
              <span className="metric-label">Orders</span>
              <span className="metric-value">{data.countrtop_online.orderCount}</span>
            </div>
            <div className="metric">
              <span className="metric-label">Avg Order Value</span>
              <span className="metric-value">{formatCurrency(data.countrtop_online.averageOrderValue)}</span>
            </div>
          </div>
        </div>
        <div className="comparison-card">
          <div className="comparison-label">POS Revenue</div>
          <div className="comparison-value">{formatCurrency(data.square_pos.revenue)}</div>
          <div className="comparison-metrics">
            <div className="metric">
              <span className="metric-label">Orders</span>
              <span className="metric-value">{data.square_pos.orderCount}</span>
            </div>
            <div className="metric">
              <span className="metric-label">Avg Order Value</span>
              <span className="metric-value">{formatCurrency(data.square_pos.averageOrderValue)}</span>
            </div>
          </div>
        </div>
        <div className="comparison-card accent">
          <div className="comparison-label">Total Revenue</div>
          <div className="comparison-value">{formatCurrency(data.total.revenue)}</div>
          <div className="comparison-metrics">
            <div className="metric">
              <span className="metric-label">Orders</span>
              <span className="metric-value">{data.total.orderCount}</span>
            </div>
            <div className="metric">
              <span className="metric-label">Avg Order Value</span>
              <span className="metric-value">{formatCurrency(data.total.averageOrderValue)}</span>
            </div>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="source" stroke="var(--color-text-muted)" tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} />
          <YAxis
            stroke="var(--color-text-muted)"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
            tickFormatter={(value) => `$${value.toFixed(0)}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              color: 'var(--color-text)'
            }}
            formatter={(value: number | undefined) => {
              if (value === undefined || value === null) return 'N/A';
              return formatCurrency(value);
            }}
          />
          <Legend />
          <Bar dataKey="revenue" fill="var(--color-primary)" name="Revenue ($)" />
        </BarChart>
      </ResponsiveContainer>

      <style jsx>{`
        .comparison-container {
          background: var(--ct-bg-surface);
          border: 1px solid var(--color-border);
          border-radius: 12px;
          padding: 20px;
        }

        .comparison-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 250px;
          color: var(--color-text-muted);
          font-size: 14px;
        }

        .comparison-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .comparison-card {
          background: var(--ct-bg-surface);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 16px;
        }

        .comparison-card.accent {
          background: rgba(232, 93, 4, 0.12);
          border-color: rgba(232, 93, 4, 0.3);
        }

        .comparison-label {
          font-size: 12px;
          font-weight: 500;
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }

        .comparison-value {
          font-size: 32px;
          font-weight: 700;
          color: var(--color-text);
          margin-bottom: 12px;
        }

        .comparison-metrics {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .metric {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .metric-label {
          font-size: 12px;
          color: var(--color-text-muted);
        }

        .metric-value {
          font-size: 14px;
          font-weight: 600;
          color: var(--color-accent);
        }
      `}</style>
    </div>
  );
}

