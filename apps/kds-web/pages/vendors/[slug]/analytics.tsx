import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createDataClient, type Database } from '@countrtop/data';
import { requireKDSSession } from '../../../lib/auth';

type QueueHealth = {
  activeTickets: number;
  heldTickets: number;
  avgWaitMinutes: number | null;
  oldestTicketMinutes: number | null;
  status: 'healthy' | 'busy' | 'overloaded';
};

type ItemCount = {
  name: string;
  count: number;
};

type HourlyData = {
  hour: number;
  count: number;
  avgPrepTime: number | null;
};

type TodayStats = {
  completed: number;
  avgPrepTime: number | null;
  peakHour: number | null;
  peakCount: number;
};

type AnalyticsPageProps = {
  vendorSlug: string;
  vendorName: string;
  locationId: string;
  locationName: string;
};

export const getServerSideProps: GetServerSideProps<AnalyticsPageProps> = async (context) => {
  const slugParam = context.params?.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const locationIdParam = context.query.locationId as string | undefined;

  // Check KDS session
  const authResult = await requireKDSSession(context, slug ?? null, locationIdParam ?? null);
  if (!authResult.authorized) {
    const loginDestination = slug
      ? `/login?vendorSlug=${encodeURIComponent(slug)}`
      : '/login';
    return {
      redirect: {
        destination: loginDestination,
        permanent: false
      }
    };
  }

  const locationId = locationIdParam || authResult.session.locationId;

  // Fetch vendor and location names
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  
  let vendorName = 'Kitchen';
  let locationName = 'Main';

  if (supabaseUrl && supabaseKey && slug) {
    const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
    const dataClient = createDataClient({ supabase });
    
    const vendor = await dataClient.getVendorBySlug(slug);
    if (vendor) {
      vendorName = vendor.displayName;
      
      const { data: locationData } = await supabase
        .from('vendor_locations')
        .select('name')
        .eq('square_location_id', locationId)
        .maybeSingle();
      
      if (locationData) {
        locationName = locationData.name;
      }
    }
  }

  return {
    props: {
      vendorSlug: slug ?? 'unknown',
      vendorName,
      locationId,
      locationName
    }
  };
};

export default function KdsAnalyticsPage({ vendorSlug, vendorName, locationId, locationName }: AnalyticsPageProps) {
  const [queueHealth, setQueueHealth] = useState<QueueHealth | null>(null);
  const [itemCounts, setItemCounts] = useState<ItemCount[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [todayStats, setTodayStats] = useState<TodayStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchAnalytics = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/vendors/${vendorSlug}/analytics/realtime?locationId=${locationId}`
      );
      const data = await response.json();
      
      if (data.ok) {
        setQueueHealth(data.queueHealth);
        setItemCounts(data.itemCounts);
        setHourlyData(data.hourlyData);
        setTodayStats(data.todayStats);
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [vendorSlug, locationId]);

  useEffect(() => {
    fetchAnalytics();
    // Refresh every 30 seconds
    const interval = setInterval(fetchAnalytics, 30000);
    return () => clearInterval(interval);
  }, [fetchAnalytics]);

  const getHealthColor = (status: QueueHealth['status']) => {
    switch (status) {
      case 'healthy': return '#34c759';
      case 'busy': return '#ff9f0a';
      case 'overloaded': return '#ff3b30';
    default: return '#64748B';
    }
  };

  const getHealthEmoji = (status: QueueHealth['status']) => {
    switch (status) {
      case 'healthy': return '✅';
      case 'busy': return '⚡';
      case 'overloaded': return '🔥';
      default: return '📊';
    }
  };

  const formatTime = (minutes: number | null) => {
    if (minutes === null) return '--';
    if (minutes < 1) return '<1m';
    return `${Math.round(minutes)}m`;
  };

  const currentHour = currentTime.getHours();

  return (
    <>
      <Head>
        <title>Analytics | {vendorName} KDS</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="analytics-page">
        <header className="header">
          <div className="header-left">
            <Link href={`/vendors/${vendorSlug}?locationId=${locationId}`} className="back-link">
              ← Back to Queue
            </Link>
            <div>
              <h1 className="title">Kitchen Analytics</h1>
              <p className="subtitle">{locationName} • Live View</p>
            </div>
          </div>
          <div className="header-right">
            <div className="live-badge">
              <span className="live-dot">●</span>
              Live
            </div>
          </div>
        </header>

        {loading ? (
          <div className="loading-state">
            <div className="spinner">📊</div>
            <p>Loading analytics...</p>
          </div>
        ) : (
          <div className="analytics-grid">
            {/* Queue Health Card */}
            <div className="card queue-health-card">
              <div className="card-header">
                <h2>Queue Health</h2>
                {queueHealth && (
                  <span 
                    className="health-badge"
                    style={{ backgroundColor: getHealthColor(queueHealth.status) }}
                  >
                    {getHealthEmoji(queueHealth.status)} {queueHealth.status.toUpperCase()}
                  </span>
                )}
              </div>
              {queueHealth && (
                <div className="health-metrics">
                  <div className="metric">
                    <span className="metric-value">{queueHealth.activeTickets}</span>
                    <span className="metric-label">Active</span>
                  </div>
                  <div className="metric">
                    <span className="metric-value">{queueHealth.heldTickets}</span>
                    <span className="metric-label">On Hold</span>
                  </div>
                  <div className="metric">
                    <span className="metric-value">{formatTime(queueHealth.avgWaitMinutes)}</span>
                    <span className="metric-label">Avg Wait</span>
                  </div>
                  <div className="metric">
                    <span className="metric-value" style={{ color: queueHealth.oldestTicketMinutes && queueHealth.oldestTicketMinutes > 10 ? '#ff3b30' : undefined }}>
                      {formatTime(queueHealth.oldestTicketMinutes)}
                    </span>
                    <span className="metric-label">Oldest</span>
                  </div>
                </div>
              )}
            </div>

            {/* Today's Stats Card */}
            <div className="card today-stats-card">
              <div className="card-header">
                <h2>Today&apos;s Performance</h2>
              </div>
              {todayStats && (
                <div className="today-metrics">
                  <div className="big-metric">
                    <span className="big-value">{todayStats.completed}</span>
                    <span className="big-label">Orders Completed</span>
                  </div>
                  <div className="stat-row">
                    <div className="stat">
                      <span className="stat-value">{formatTime(todayStats.avgPrepTime)}</span>
                      <span className="stat-label">Avg Prep Time</span>
                    </div>
                    <div className="stat">
                      <span className="stat-value">
                        {todayStats.peakHour !== null ? `${todayStats.peakHour}:00` : '--'}
                      </span>
                      <span className="stat-label">Peak Hour ({todayStats.peakCount})</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Items in Queue Card */}
            <div className="card items-card">
              <div className="card-header">
                <h2>📦 In Queue Now</h2>
              </div>
              {itemCounts.length === 0 ? (
                <div className="empty-items">Queue is empty</div>
              ) : (
                <div className="items-list">
                  {itemCounts.slice(0, 8).map((item, idx) => (
                    <div key={idx} className="item-row">
                      <span className="item-count">{item.count}×</span>
                      <span className="item-name">{item.name}</span>
                    </div>
                  ))}
                  {itemCounts.length > 8 && (
                    <div className="more-items">+{itemCounts.length - 8} more items</div>
                  )}
                </div>
              )}
            </div>

            {/* Hourly Heatmap Card */}
            <div className="card heatmap-card">
              <div className="card-header">
                <h2>📈 Today by Hour</h2>
              </div>
              <div className="heatmap">
                {Array.from({ length: 24 }, (_, hour) => {
                  const data = hourlyData.find(h => h.hour === hour);
                  const count = data?.count ?? 0;
                  const maxCount = Math.max(...hourlyData.map(h => h.count), 1);
                  const intensity = count / maxCount;
                  const isCurrentHour = hour === currentHour;
                  const isPast = hour < currentHour;
                  
                  return (
                    <div 
                      key={hour}
                      className={`heatmap-cell ${isCurrentHour ? 'current' : ''} ${!isPast && !isCurrentHour ? 'future' : ''}`}
                      style={{
                        backgroundColor: isPast || isCurrentHour
                          ? `rgba(102, 126, 234, ${0.2 + intensity * 0.8})`
                          : 'rgba(255,255,255,0.05)'
                      }}
                      title={`${hour}:00 - ${count} orders${data?.avgPrepTime ? `, avg ${Math.round(data.avgPrepTime)}m` : ''}`}
                    >
                      <span className="cell-hour">{hour}</span>
                      {(isPast || isCurrentHour) && count > 0 && (
                        <span className="cell-count">{count}</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="heatmap-legend">
                <span>Less</span>
                <div className="legend-gradient" />
                <span>More</span>
              </div>
            </div>
          </div>
        )}

        <style jsx>{`
          .analytics-page {
            min-height: 100vh;
            background: var(--ct-bg-primary);
            color: var(--ct-text);
            font-family: var(--ct-font-body);
            padding: 24px;
          }

          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 32px;
            padding-bottom: 24px;
            border-bottom: 1px solid var(--color-border);
          }

          .header-left {
            display: flex;
            align-items: flex-start;
            gap: 24px;
          }

          .back-link {
            color: var(--color-primary);
            text-decoration: none;
            font-size: 14px;
            padding: 8px 12px;
            background: rgba(232, 93, 4, 0.12);
            border-radius: 8px;
            transition: background 0.2s;
          }

          .back-link:hover {
            background: rgba(232, 93, 4, 0.2);
          }

          .title {
            font-size: 28px;
            font-weight: 700;
            margin: 0 0 4px;
            background: var(--ct-gradient-primary);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .subtitle {
            font-size: 14px;
            color: var(--color-text-muted);
            margin: 0;
          }

          .live-badge {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 14px;
            background: rgba(52, 199, 89, 0.15);
            border: 1px solid rgba(52, 199, 89, 0.3);
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            color: #34c759;
          }

          .live-dot {
            animation: pulse 2s infinite;
          }

          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }

          .loading-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 80px 20px;
          }

          .spinner {
            font-size: 48px;
            margin-bottom: 16px;
            animation: bounce 1s infinite;
          }

          @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
          }

          .analytics-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 24px;
            max-width: 1400px;
            margin: 0 auto;
          }

          .card {
            background: var(--ct-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 16px;
            padding: 24px;
          }

          .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
          }

          .card-header h2 {
            font-size: 18px;
            font-weight: 600;
            margin: 0;
            color: var(--color-text);
          }

          .health-badge {
            padding: 6px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 700;
            color: white;
          }

          .health-metrics {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
          }

          .metric {
            text-align: center;
          }

          .metric-value {
            display: block;
            font-size: 32px;
            font-weight: 700;
            color: var(--color-text);
          }

          .metric-label {
            display: block;
            font-size: 12px;
            color: var(--color-text-muted);
            margin-top: 4px;
          }

          .today-metrics {
            text-align: center;
          }

          .big-metric {
            margin-bottom: 24px;
          }

          .big-value {
            display: block;
            font-size: 64px;
            font-weight: 700;
            background: var(--ct-gradient-primary);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .big-label {
            display: block;
            font-size: 14px;
            color: var(--color-text-muted);
            margin-top: 8px;
          }

          .stat-row {
            display: flex;
            justify-content: center;
            gap: 48px;
          }

          .stat {
            text-align: center;
          }

          .stat-value {
            display: block;
            font-size: 24px;
            font-weight: 600;
            color: var(--color-text);
          }

          .stat-label {
            display: block;
            font-size: 12px;
            color: var(--color-text-muted);
            margin-top: 4px;
          }

          .items-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .item-row {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 8px 12px;
            background: var(--color-bg-warm);
            border-radius: 8px;
          }

          .item-count {
            font-size: 18px;
            font-weight: 700;
            color: var(--color-accent);
            min-width: 40px;
          }

          .item-name {
            font-size: 15px;
            color: var(--color-text);
          }

          .empty-items {
            text-align: center;
            padding: 32px;
            color: var(--color-text-muted);
            font-size: 14px;
          }

          .more-items {
            text-align: center;
            padding: 8px;
            color: var(--color-text-muted);
            font-size: 13px;
          }

          .heatmap {
            display: grid;
            grid-template-columns: repeat(12, 1fr);
            gap: 4px;
          }

          .heatmap-cell {
            aspect-ratio: 1;
            border-radius: 6px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            position: relative;
            transition: transform 0.2s;
          }

          .heatmap-cell:hover {
            transform: scale(1.1);
            z-index: 1;
          }

          .heatmap-cell.current {
            border: 2px solid var(--color-primary);
          }

          .heatmap-cell.future {
            opacity: 0.5;
          }

          .cell-hour {
            font-size: 9px;
            color: var(--color-text-muted);
          }

          .cell-count {
            font-size: 12px;
            font-weight: 700;
            color: white;
          }

          .heatmap-legend {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-top: 16px;
            font-size: 11px;
            color: var(--color-text-muted);
          }

          .legend-gradient {
            width: 80px;
            height: 8px;
            border-radius: 4px;
            background: linear-gradient(to right, rgba(232, 93, 4, 0.2), rgba(232, 93, 4, 1));
          }

          @media (max-width: 900px) {
            .analytics-grid {
              grid-template-columns: 1fr;
            }

            .health-metrics {
              grid-template-columns: repeat(2, 1fr);
            }

            .heatmap {
              grid-template-columns: repeat(8, 1fr);
            }
          }
        `}</style>
      </div>
    </>
  );
}

