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
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
          <XAxis dataKey="source" stroke="#888" tick={{ fill: '#888', fontSize: 12 }} />
          <YAxis
            stroke="#888"
            tick={{ fill: '#888', fontSize: 12 }}
            tickFormatter={(value) => `$${value.toFixed(0)}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '8px',
              color: '#e8e8e8'
            }}
            formatter={(value: number | undefined) => {
              if (value === undefined || value === null) return 'N/A';
              return formatCurrency(value);
            }}
          />
          <Legend />
          <Bar dataKey="revenue" fill="#667eea" name="Revenue ($)" />
        </BarChart>
      </ResponsiveContainer>

      <style jsx>{`
        .comparison-container {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 20px;
        }

        .comparison-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 250px;
          color: #888;
          font-size: 14px;
        }

        .comparison-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .comparison-card {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 16px;
        }

        .comparison-card.accent {
          background: linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%);
          border-color: rgba(102, 126, 234, 0.3);
        }

        .comparison-label {
          font-size: 12px;
          font-weight: 500;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }

        .comparison-value {
          font-size: 32px;
          font-weight: 700;
          color: #e8e8e8;
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
          color: #666;
        }

        .metric-value {
          font-size: 14px;
          font-weight: 600;
          color: #a78bfa;
        }
      `}</style>
    </div>
  );
}

