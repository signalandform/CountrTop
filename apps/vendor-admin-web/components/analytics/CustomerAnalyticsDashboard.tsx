import { useState, useEffect, useCallback } from 'react';
import type { CustomerSummary, CustomerLtvPoint, RepeatCustomerMetrics } from '@countrtop/models';
import { DateRangePicker, type DateRange } from './DateRangePicker';
import { CustomerSummaryCards } from './CustomerSummaryCards';
import { CustomerLtvChart } from './CustomerLtvChart';
import { RepeatCustomerChart } from './RepeatCustomerChart';

type CustomerAnalyticsDashboardProps = {
  vendorSlug: string;
};

/**
 * Customer Analytics Dashboard
 * Note: All metrics shown are for CountrTop online orders only
 */
export function CustomerAnalyticsDashboard({ vendorSlug }: CustomerAnalyticsDashboardProps) {
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  });

  const [loading, setLoading] = useState(true);
  const [customerSummary, setCustomerSummary] = useState<CustomerSummary | null>(null);
  const [customerLtv, setCustomerLtv] = useState<CustomerLtvPoint[]>([]);
  const [repeatCustomerMetrics, setRepeatCustomerMetrics] = useState<RepeatCustomerMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const startDate = dateRange.start.toISOString();
      const endDate = dateRange.end.toISOString();

      // Fetch all customer analytics in parallel
      const [summaryRes, ltvRes, repeatRes] = await Promise.all([
        fetch(`/api/vendors/${vendorSlug}/analytics/customers?startDate=${startDate}&endDate=${endDate}`),
        fetch(`/api/vendors/${vendorSlug}/analytics/customer-ltv`),
        fetch(`/api/vendors/${vendorSlug}/analytics/repeat-customers?startDate=${startDate}&endDate=${endDate}`)
      ]);

      if (!summaryRes.ok) throw new Error('Failed to fetch customer summary');
      if (!ltvRes.ok) throw new Error('Failed to fetch customer LTV');
      if (!repeatRes.ok) throw new Error('Failed to fetch repeat customer metrics');

      const summaryData = await summaryRes.json();
      const ltvData = await ltvRes.json();
      const repeatData = await repeatRes.json();

      if (!summaryData.success) throw new Error(summaryData.error || 'Failed to fetch customer summary');
      if (!ltvData.success) throw new Error(ltvData.error || 'Failed to fetch customer LTV');
      if (!repeatData.success) throw new Error(repeatData.error || 'Failed to fetch repeat customer metrics');

      setCustomerSummary(summaryData.data);
      setCustomerLtv(ltvData.data);
      setRepeatCustomerMetrics(repeatData.data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error fetching customer analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [vendorSlug, dateRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return (
    <div className="customer-analytics-dashboard">
      <div className="dashboard-header">
        <div>
          <h2>Customer Analytics</h2>
          <span className="muted">Customer insights and lifetime value (CountrTop online orders only)</span>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {error && (
        <div className="error-message">
          Error loading analytics: {error}
          <button onClick={fetchAnalytics}>Retry</button>
        </div>
      )}

      {customerSummary && (
        <div className="section">
          <CustomerSummaryCards data={customerSummary} loading={loading} />
        </div>
      )}

      <div className="charts-grid">
        {repeatCustomerMetrics && (
          <div className="chart-section">
            <RepeatCustomerChart data={repeatCustomerMetrics} loading={loading} />
          </div>
        )}

        <div className="chart-section">
          <CustomerLtvChart data={customerLtv} loading={loading} limit={20} />
        </div>
      </div>

      <style jsx>{`
        .customer-analytics-dashboard {
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

        .section {
          margin-bottom: 32px;
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
      `}</style>
    </div>
  );
}

