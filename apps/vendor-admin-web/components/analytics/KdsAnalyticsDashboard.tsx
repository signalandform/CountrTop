import { useState, useEffect, useCallback } from 'react';
import type { KdsSummary, KdsThroughputPoint, KdsPrepTimePoint, KdsHeatmapCell, KdsSourceMetrics } from '@countrtop/models';
import { DateRangePicker, type DateRange } from './DateRangePicker';
import { KdsSummaryCards } from './KdsSummaryCards';
import { KdsThroughputChart } from './KdsThroughputChart';
import { KdsPrepTimeChart } from './KdsPrepTimeChart';
import { KdsSourceComparison } from './KdsSourceComparison';

type KdsAnalyticsDashboardProps = {
  vendorSlug: string;
  timezone?: string;
};

/**
 * KDS Analytics Dashboard
 */
export function KdsAnalyticsDashboard({ vendorSlug, timezone }: KdsAnalyticsDashboardProps) {
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  });

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<KdsSummary | null>(null);
  const [throughput, setThroughput] = useState<KdsThroughputPoint[]>([]);
  const [prepTime, setPrepTime] = useState<KdsPrepTimePoint[]>([]);
  const [bySource, setBySource] = useState<KdsSourceMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const startDate = dateRange.start.toISOString();
      const endDate = dateRange.end.toISOString();
      const tz = timezone || 'UTC';

      // Fetch all analytics in parallel
      const [summaryRes, throughputRes, prepTimeRes, bySourceRes] = await Promise.all([
        fetch(`/api/vendors/${vendorSlug}/analytics/kds-summary?startDate=${startDate}&endDate=${endDate}&timezone=${tz}`),
        fetch(`/api/vendors/${vendorSlug}/analytics/kds-throughput?startDate=${startDate}&endDate=${endDate}&granularity=day&timezone=${tz}`),
        fetch(`/api/vendors/${vendorSlug}/analytics/kds-prep-time?startDate=${startDate}&endDate=${endDate}&granularity=day&timezone=${tz}`),
        fetch(`/api/vendors/${vendorSlug}/analytics/kds-by-source?startDate=${startDate}&endDate=${endDate}`)
      ]);

      if (!summaryRes.ok) throw new Error('Failed to fetch summary');
      if (!throughputRes.ok) throw new Error('Failed to fetch throughput');
      if (!prepTimeRes.ok) throw new Error('Failed to fetch prep time');
      if (!bySourceRes.ok) throw new Error('Failed to fetch by source');

      const summaryData = await summaryRes.json();
      const throughputData = await throughputRes.json();
      const prepTimeData = await prepTimeRes.json();
      const bySourceData = await bySourceRes.json();

      if (!summaryData.success) throw new Error(summaryData.error || 'Failed to fetch summary');
      if (!throughputData.success) throw new Error(throughputData.error || 'Failed to fetch throughput');
      if (!prepTimeData.success) throw new Error(prepTimeData.error || 'Failed to fetch prep time');
      if (!bySourceData.success) throw new Error(bySourceData.error || 'Failed to fetch by source');

      setSummary(summaryData.data);
      setThroughput(throughputData.data);
      setPrepTime(prepTimeData.data);
      setBySource(bySourceData.data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error fetching analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [vendorSlug, dateRange, timezone]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return (
    <div className="kds-analytics-dashboard">
      <div className="dashboard-header">
        <div>
          <h2>KDS Performance Analytics</h2>
          <span className="muted">Kitchen operations metrics and insights</span>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} timezone={timezone} />
      </div>

      {error && (
        <div className="error-message">
          Error loading analytics: {error}
          <button onClick={fetchAnalytics}>Retry</button>
        </div>
      )}

      {summary && <KdsSummaryCards summary={summary} loading={loading} />}

      <div className="charts-grid">
        <div className="chart-section">
          <h3>Ticket Throughput</h3>
          <KdsThroughputChart data={throughput} loading={loading} />
        </div>

        <div className="chart-section">
          <h3>Prep Time Trends</h3>
          <KdsPrepTimeChart data={prepTime} loading={loading} />
        </div>
      </div>

      <div className="chart-section">
        <h3>Source Comparison (Online vs POS)</h3>
        {bySource && <KdsSourceComparison data={bySource} loading={loading} />}
      </div>

      <style jsx>{`
        .kds-analytics-dashboard {
          width: 100%;
        }

        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 32px;
          flex-wrap: wrap;
          gap: 20px;
        }

        .dashboard-header h2 {
          font-size: 24px;
          font-weight: 700;
          color: #e8e8e8;
          margin: 0 0 4px 0;
        }

        .dashboard-header .muted {
          font-size: 14px;
          color: #888;
        }

        .error-message {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 8px;
          padding: 16px;
          color: #fca5a5;
          margin-bottom: 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .error-message button {
          padding: 8px 16px;
          background: rgba(239, 68, 68, 0.2);
          border: 1px solid rgba(239, 68, 68, 0.4);
          border-radius: 6px;
          color: #fca5a5;
          cursor: pointer;
          font-size: 14px;
        }

        .error-message button:hover {
          background: rgba(239, 68, 68, 0.3);
        }

        .charts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 24px;
          margin-bottom: 32px;
        }

        .chart-section {
          margin-bottom: 32px;
        }

        .chart-section h3 {
          font-size: 18px;
          font-weight: 600;
          color: #e8e8e8;
          margin: 0 0 16px 0;
        }
      `}</style>
    </div>
  );
}

