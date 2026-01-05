import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { KdsThroughputPoint } from '@countrtop/models';

type KdsThroughputChartProps = {
  data: KdsThroughputPoint[];
  loading?: boolean;
};

/**
 * KDS Throughput time series chart
 */
export function KdsThroughputChart({ data, loading }: KdsThroughputChartProps) {
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
    count: point.count,
    avgPrepTime: point.avgPrepTime !== null ? point.avgPrepTime : 0
  }));

  return (
    <div className="chart-container">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
          <XAxis
            dataKey="timestamp"
            stroke="#888"
            tick={{ fill: '#888', fontSize: 12 }}
          />
          <YAxis
            yAxisId="left"
            stroke="#888"
            tick={{ fill: '#888', fontSize: 12 }}
            label={{ value: 'Tickets', angle: -90, position: 'insideLeft', fill: '#888' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '8px',
              color: '#e8e8e8'
            }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="count"
            stroke="#667eea"
            strokeWidth={2}
            dot={{ fill: '#667eea', r: 4 }}
            name="Tickets"
          />
        </LineChart>
      </ResponsiveContainer>

      <style jsx>{`
        .chart-container {
          width: 100%;
          height: 300px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 20px;
        }

        .chart-loading,
        .chart-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #888;
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}

