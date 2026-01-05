import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { KdsSourceMetrics } from '@countrtop/models';

type KdsSourceComparisonProps = {
  data: KdsSourceMetrics;
  loading?: boolean;
};

/**
 * KDS Source comparison (online vs POS)
 */
export function KdsSourceComparison({ data, loading }: KdsSourceComparisonProps) {
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
      count: data.countrtop_online.count,
      avgPrepTime: data.countrtop_online.avgPrepTimeMinutes ?? 0,
      avgTotalTime: data.countrtop_online.avgTotalTimeMinutes ?? 0
    },
    {
      source: 'POS',
      count: data.square_pos.count,
      avgPrepTime: data.square_pos.avgPrepTimeMinutes ?? 0,
      avgTotalTime: data.square_pos.avgTotalTimeMinutes ?? 0
    }
  ];

  return (
    <div className="comparison-container">
      <div className="comparison-cards">
        <div className="comparison-card">
          <div className="comparison-label">Online Orders</div>
          <div className="comparison-value">{data.countrtop_online.count}</div>
          <div className="comparison-metrics">
            <div className="metric">
              <span className="metric-label">Avg Prep Time</span>
              <span className="metric-value">
                {data.countrtop_online.avgPrepTimeMinutes !== null
                  ? `${data.countrtop_online.avgPrepTimeMinutes.toFixed(1)} min`
                  : 'N/A'}
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">Avg Total Time</span>
              <span className="metric-value">
                {data.countrtop_online.avgTotalTimeMinutes !== null
                  ? `${data.countrtop_online.avgTotalTimeMinutes.toFixed(1)} min`
                  : 'N/A'}
              </span>
            </div>
          </div>
        </div>
        <div className="comparison-card">
          <div className="comparison-label">POS Orders</div>
          <div className="comparison-value">{data.square_pos.count}</div>
          <div className="comparison-metrics">
            <div className="metric">
              <span className="metric-label">Avg Prep Time</span>
              <span className="metric-value">
                {data.square_pos.avgPrepTimeMinutes !== null
                  ? `${data.square_pos.avgPrepTimeMinutes.toFixed(1)} min`
                  : 'N/A'}
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">Avg Total Time</span>
              <span className="metric-value">
                {data.square_pos.avgTotalTimeMinutes !== null
                  ? `${data.square_pos.avgTotalTimeMinutes.toFixed(1)} min`
                  : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
          <XAxis dataKey="source" stroke="#888" tick={{ fill: '#888', fontSize: 12 }} />
          <YAxis stroke="#888" tick={{ fill: '#888', fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '8px',
              color: '#e8e8e8'
            }}
          />
          <Legend />
          <Bar dataKey="count" fill="#667eea" name="Ticket Count" />
          <Bar dataKey="avgPrepTime" fill="#a78bfa" name="Avg Prep Time (min)" />
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

