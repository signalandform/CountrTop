import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { KdsPrepTimePoint } from '@countrtop/models';

type KdsPrepTimeChartProps = {
  data: KdsPrepTimePoint[];
  loading?: boolean;
};

/**
 * KDS Prep Time time series chart
 */
export function KdsPrepTimeChart({ data, loading }: KdsPrepTimeChartProps) {
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
    avgPrepTime: point.avgPrepTimeMinutes !== null ? point.avgPrepTimeMinutes : 0,
    count: point.count
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
            stroke="#888"
            tick={{ fill: '#888', fontSize: 12 }}
            label={{ value: 'Minutes', angle: -90, position: 'insideLeft', fill: '#888' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '8px',
              color: '#e8e8e8'
            }}
            formatter={(value: number | undefined) => {
              if (value === undefined || value === null) return ['N/A', 'Avg Prep Time'];
              return [`${value.toFixed(1)} min`, 'Avg Prep Time'];
            }}
          />
          <Line
            type="monotone"
            dataKey="avgPrepTime"
            stroke="#a78bfa"
            strokeWidth={2}
            dot={{ fill: '#a78bfa', r: 4 }}
            name="Avg Prep Time"
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

