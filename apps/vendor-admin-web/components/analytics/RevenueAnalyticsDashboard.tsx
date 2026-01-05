import { useState, useEffect, useCallback } from 'react';
import type { RevenuePoint, RevenueBySource, AovPoint } from '@countrtop/models';
import { DateRangePicker, type DateRange } from './DateRangePicker';
import { RevenueSeriesChart } from './RevenueSeriesChart';
import { RevenueBySourceChart } from './RevenueBySourceChart';
import { AovSeriesChart } from './AovSeriesChart';

type RevenueAnalyticsDashboardProps = {
  vendorSlug: string;
  timezone?: string;
};

/**
 * Revenue Analytics Dashboard
 */
export function RevenueAnalyticsDashboard({ vendorSlug, timezone }: RevenueAnalyticsDashboardProps) {
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  });

  const [loading, setLoading] = useState(true);
  const [revenueSeries, setRevenueSeries] = useState<RevenuePoint[]>([]);
  const [revenueBySource, setRevenueBySource] = useState<RevenueBySource | null>(null);
  const [aovSeries, setAovSeries] = useState<AovPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const startDate = dateRange.start.toISOString();
      const endDate = dateRange.end.toISOString();
      const tz = timezone || 'UTC';

      // Fetch all revenue analytics in parallel
      const [revenueSeriesRes, revenueBySourceRes, aovSeriesRes] = await Promise.all([
        fetch(`/api/vendors/${vendorSlug}/analytics/revenue-series?startDate=${startDate}&endDate=${endDate}&granularity=day&timezone=${tz}`),
        fetch(`/api/vendors/${vendorSlug}/analytics/revenue-by-source?startDate=${startDate}&endDate=${endDate}`),
        fetch(`/api/vendors/${vendorSlug}/analytics/aov-series?startDate=${startDate}&endDate=${endDate}&granularity=day&timezone=${tz}`)
      ]);

      if (!revenueSeriesRes.ok) throw new Error('Failed to fetch revenue series');
      if (!revenueBySourceRes.ok) throw new Error('Failed to fetch revenue by source');
      if (!aovSeriesRes.ok) throw new Error('Failed to fetch AOV series');

      const revenueSeriesData = await revenueSeriesRes.json();
      const revenueBySourceData = await revenueBySourceRes.json();
      const aovSeriesData = await aovSeriesRes.json();

      if (!revenueSeriesData.success) throw new Error(revenueSeriesData.error || 'Failed to fetch revenue series');
      if (!revenueBySourceData.success) throw new Error(revenueBySourceData.error || 'Failed to fetch revenue by source');
      if (!aovSeriesData.success) throw new Error(aovSeriesData.error || 'Failed to fetch AOV series');

      setRevenueSeries(revenueSeriesData.data);
      setRevenueBySource(revenueBySourceData.data);
      setAovSeries(aovSeriesData.data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error fetching revenue analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [vendorSlug, dateRange, timezone]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return (
    <div className="revenue-analytics-dashboard">
      <div className="dashboard-header">
        <div>
          <h2>Revenue Analytics</h2>
          <span className="muted">Revenue trends and source attribution</span>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} timezone={timezone} />
      </div>

      {error && (
        <div className="error-message">
          Error loading analytics: {error}
          <button onClick={fetchAnalytics}>Retry</button>
        </div>
      )}

      <div className="charts-grid">
        <div className="chart-section">
          <h3>Revenue Trends</h3>
          <RevenueSeriesChart data={revenueSeries} loading={loading} />
        </div>

        <div className="chart-section">
          <h3>Average Order Value</h3>
          <AovSeriesChart data={aovSeries} loading={loading} />
        </div>
      </div>

      <div className="chart-section">
        <h3>Revenue by Source (Online vs POS)</h3>
        {revenueBySource && <RevenueBySourceChart data={revenueBySource} loading={loading} />}
      </div>

      <style jsx>{`
        .revenue-analytics-dashboard {
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

