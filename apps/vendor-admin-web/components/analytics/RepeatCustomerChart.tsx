import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import type { RepeatCustomerMetrics } from '@countrtop/models';

type RepeatCustomerChartProps = {
  data: RepeatCustomerMetrics;
  loading?: boolean;
};

const COLORS = ['#667eea', '#a78bfa', '#f093fb'];

/**
 * Repeat customer metrics chart
 * Note: All data shown is for CountrTop online orders only
 */
export function RepeatCustomerChart({ data, loading }: RepeatCustomerChartProps) {
  if (loading) {
    return (
      <div className="chart-container">
        <div className="chart-loading">Loading chart data...</div>
      </div>
    );
  }

  const chartData = [
    {
      name: 'Repeat Customers',
      value: data.repeatCustomers
    },
    {
      name: 'Single Order Customers',
      value: data.singleOrderCustomers
    }
  ];

  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

  return (
    <div className="chart-container">
      <div className="chart-header">
        <h3>Customer Breakdown</h3>
        <span className="scope-label">CountrTop Online Only</span>
      </div>
      <div className="chart-content">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => {
                if (percent === undefined || percent === null) return `${name}: 0%`;
                return `${name}: ${(percent * 100).toFixed(0)}%`;
              }}
              outerRadius={100}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#e8e8e8'
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
        <div className="metrics-summary">
          <div className="metric">
            <div className="metric-label">Total Customers</div>
            <div className="metric-value">{data.totalCustomers.toLocaleString()}</div>
          </div>
          <div className="metric">
            <div className="metric-label">Repeat Rate</div>
            <div className="metric-value">{formatPercent(data.repeatCustomerRate)}</div>
          </div>
        </div>
      </div>

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

        .chart-content {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .metrics-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 16px;
        }

        .metric {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 16px;
          text-align: center;
        }

        .metric-label {
          font-size: 12px;
          color: #888;
          margin-bottom: 8px;
        }

        .metric-value {
          font-size: 24px;
          font-weight: 700;
          color: #e8e8e8;
        }

        .chart-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 300px;
          color: #888;
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}

