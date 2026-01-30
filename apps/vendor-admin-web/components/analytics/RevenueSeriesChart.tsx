import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { RevenuePoint } from '@countrtop/models';

type RevenueSeriesChartProps = {
  data: RevenuePoint[];
  loading?: boolean;
};

/**
 * Revenue time series chart
 */
export function RevenueSeriesChart({ data, loading }: RevenueSeriesChartProps) {
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
        <div className="chart-empty">No data available for selected date range</div>
      </div>
    );
  }

  // Format data for chart
  const chartData = data.map((point) => ({
    timestamp: new Date(point.timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: data.length > 24 ? undefined : 'numeric'
    }),
    revenue: point.revenue,
    orderCount: point.orderCount,
    averageOrderValue: point.averageOrderValue
  }));

  return (
    <div className="chart-container">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="timestamp"
            stroke="var(--color-text-muted)"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
          />
          <YAxis
            yAxisId="left"
            stroke="var(--color-text-muted)"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
            label={{ value: 'Revenue ($)', angle: -90, position: 'insideLeft', fill: 'var(--color-text-muted)' }}
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
              return `$${value.toFixed(2)}`;
            }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="revenue"
            stroke="var(--color-primary)"
            strokeWidth={2}
            dot={{ fill: 'var(--color-primary)', r: 4 }}
            name="Revenue"
          />
        </LineChart>
      </ResponsiveContainer>

      <style jsx>{`
        .chart-container {
          width: 100%;
          height: 300px;
          background: var(--ct-bg-surface);
          border: 1px solid var(--color-border);
          border-radius: 12px;
          padding: 20px;
        }

        .chart-loading,
        .chart-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--color-text-muted);
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}

