import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { CustomerLtvPoint } from '@countrtop/models';

type CustomerLtvChartProps = {
  data: CustomerLtvPoint[];
  loading?: boolean;
  limit?: number; // Show top N customers
};

/**
 * Customer lifetime value chart
 * Note: All data shown is for CountrTop online orders only
 */
export function CustomerLtvChart({ data, loading, limit = 20 }: CustomerLtvChartProps) {
  if (loading) {
    return (
      <div className="chart-container">
        <div className="chart-loading">Loading chart data...</div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="chart-container">
        <div className="chart-empty">No customer data available</div>
      </div>
    );
  }

  // Take top N customers
  const chartData = data.slice(0, limit).map((point) => ({
    userId: point.userId.substring(0, 8) + '...', // Truncate for display
    totalRevenue: point.totalRevenue,
    orderCount: point.orderCount,
    averageOrderValue: point.averageOrderValue
  }));

  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;

  return (
    <div className="chart-container">
      <div className="chart-header">
        <h3>Top Customers by Lifetime Value</h3>
        <span className="scope-label">CountrTop Online Only</span>
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="userId"
            stroke="var(--color-text-muted)"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
            angle={-45}
            textAnchor="end"
            height={100}
          />
          <YAxis
            yAxisId="left"
            stroke="var(--color-text-muted)"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
            label={{ value: 'Revenue ($)', angle: -90, position: 'insideLeft', fill: 'var(--color-text-muted)' }}
            tickFormatter={(value) => `$${value.toFixed(0)}`}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="var(--color-text-muted)"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
            label={{ value: 'Orders', angle: 90, position: 'insideRight', fill: 'var(--color-text-muted)' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              color: 'var(--color-text)'
            }}
            formatter={(value: number | undefined, name: string | undefined) => {
              if (value === undefined || value === null) return 'N/A';
              if (name === 'totalRevenue' || name === 'averageOrderValue') {
                return formatCurrency(value);
              }
              return value;
            }}
          />
          <Legend />
          <Bar
            yAxisId="left"
            dataKey="totalRevenue"
            fill="var(--color-primary)"
            name="Total Revenue ($)"
          />
          <Bar
            yAxisId="right"
            dataKey="orderCount"
            fill="var(--color-accent)"
            name="Order Count"
          />
        </BarChart>
      </ResponsiveContainer>
      {data.length > limit && (
        <div className="chart-footer">
          Showing top {limit} of {data.length} customers
        </div>
      )}

      <style jsx>{`
        .chart-container {
          width: 100%;
          background: var(--ct-bg-surface);
          border: 1px solid var(--color-border);
          border-radius: 12px;
          padding: 20px;
        }

        .chart-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .chart-header h3 {
          font-size: 18px;
          font-weight: 600;
          color: var(--color-text);
          margin: 0;
        }

        .scope-label {
          font-size: 12px;
          font-weight: 500;
          color: var(--color-accent);
          background: rgba(255, 182, 39, 0.18);
          padding: 4px 12px;
          border-radius: 4px;
          border: 1px solid rgba(255, 182, 39, 0.3);
        }

        .chart-loading,
        .chart-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 400px;
          color: var(--color-text-muted);
          font-size: 14px;
        }

        .chart-footer {
          margin-top: 12px;
          text-align: center;
          font-size: 12px;
          color: var(--color-text-muted);
        }
      `}</style>
    </div>
  );
}

