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
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="source" stroke="var(--color-text-muted)" tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} />
          <YAxis stroke="var(--color-text-muted)" tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              color: 'var(--color-text)'
            }}
          />
          <Legend />
          <Bar dataKey="count" fill="var(--color-primary)" name="Ticket Count" />
          <Bar dataKey="avgPrepTime" fill="var(--color-accent)" name="Avg Prep Time (min)" />
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

