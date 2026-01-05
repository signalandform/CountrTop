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
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
          <XAxis
            dataKey="userId"
            stroke="#888"
            tick={{ fill: '#888', fontSize: 12 }}
            angle={-45}
            textAnchor="end"
            height={100}
          />
          <YAxis
            yAxisId="left"
            stroke="#888"
            tick={{ fill: '#888', fontSize: 12 }}
            label={{ value: 'Revenue ($)', angle: -90, position: 'insideLeft', fill: '#888' }}
            tickFormatter={(value) => `$${value.toFixed(0)}`}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#888"
            tick={{ fill: '#888', fontSize: 12 }}
            label={{ value: 'Orders', angle: 90, position: 'insideRight', fill: '#888' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '8px',
              color: '#e8e8e8'
            }}
            formatter={(value: number | undefined, name: string) => {
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
            fill="#667eea"
            name="Total Revenue ($)"
          />
          <Bar
            yAxisId="right"
            dataKey="orderCount"
            fill="#a78bfa"
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
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
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

        .chart-loading,
        .chart-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 400px;
          color: #888;
          font-size: 14px;
        }

        .chart-footer {
          margin-top: 12px;
          text-align: center;
          font-size: 12px;
          color: #666;
        }
      `}</style>
    </div>
  );
}

