import { useState, useEffect, useCallback } from 'react';
import type { ItemPerformance } from '@countrtop/models';
import { DateRangePicker, type DateRange } from './DateRangePicker';
import { ItemPerformanceTable } from './ItemPerformanceTable';

type ItemPerformanceDashboardProps = {
  vendorSlug: string;
};

/**
 * Item Performance Dashboard
 * Note: All metrics shown are for CountrTop online orders only
 */
export function ItemPerformanceDashboard({ vendorSlug }: ItemPerformanceDashboardProps) {
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  });

  const [loading, setLoading] = useState(true);
  const [itemPerformance, setItemPerformance] = useState<ItemPerformance[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const startDate = dateRange.start.toISOString();
      const endDate = dateRange.end.toISOString();

      const response = await fetch(`/api/vendors/${vendorSlug}/analytics/items?startDate=${startDate}&endDate=${endDate}`);

      if (!response.ok) throw new Error('Failed to fetch item performance');

      const data = await response.json();

      if (!data.success) throw new Error(data.error || 'Failed to fetch item performance');

      setItemPerformance(data.data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error fetching item performance:', err);
    } finally {
      setLoading(false);
    }
  }, [vendorSlug, dateRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return (
    <div className="item-performance-dashboard">
      <div className="dashboard-header">
        <div>
          <h2>Item Performance</h2>
          <span className="muted">Item sales and revenue metrics (CountrTop online orders only)</span>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {error && (
        <div className="error-message">
          Error loading analytics: {error}
          <button onClick={fetchAnalytics}>Retry</button>
        </div>
      )}

      <div className="section">
        <ItemPerformanceTable data={itemPerformance} loading={loading} limit={50} />
      </div>

      <style jsx>{`
        .item-performance-dashboard {
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
          color: var(--color-text);
          margin: 0 0 4px 0;
        }

        .dashboard-header .muted {
          font-size: 14px;
          color: var(--color-text-muted);
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

        .section {
          margin-bottom: 32px;
        }
      `}</style>
    </div>
  );
}

