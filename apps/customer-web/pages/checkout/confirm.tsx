import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState, useCallback } from 'react';

import { resolveVendorSlugFromHost } from '@countrtop/data';

import { getServerDataClient } from '../../lib/dataClient';

type ConfirmProps = {
  vendorName: string;
};

type StoredSnapshot = {
  squareOrderId: string;
  items: { id: string; name: string; quantity: number; price: number }[];
  total: number;
  currency: string;
};

type OrderStatus = {
  status: 'placed' | 'preparing' | 'ready' | 'completed' | 'unknown';
  shortcode?: string | null;
  placedAt?: string;
  readyAt?: string | null;
  completedAt?: string | null;
  estimatedWaitMinutes?: number | null;
};

export const getServerSideProps: GetServerSideProps<ConfirmProps> = async ({ req }) => {
  const fallback = process.env.DEFAULT_VENDOR_SLUG;
  const vendorSlug = resolveVendorSlugFromHost(req.headers.host, fallback);
  const dataClient = getServerDataClient();
  const vendor = vendorSlug ? await dataClient.getVendorBySlug(vendorSlug) : null;

  return {
    props: {
      vendorName: vendor?.displayName ?? 'CountrTop'
    }
  };
};

export default function ConfirmPage({ vendorName }: ConfirmProps) {
  const router = useRouter();
  const orderId = useMemo(() => {
    const value = router.query.orderId;
    return Array.isArray(value) ? value[0] : value;
  }, [router.query.orderId]);
  const [status, setStatus] = useState<'idle' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<StoredSnapshot | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Fetch order status
  const fetchOrderStatus = useCallback(async () => {
    if (!orderId) return;
    
    setStatusLoading(true);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/status`);
      const data = await res.json();
      if (data.ok) {
        setOrderStatus(data.order);
      }
    } catch (err) {
      console.error('Failed to fetch order status:', err);
    } finally {
      setStatusLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!orderId || status !== 'idle') return;

    const raw = sessionStorage.getItem(`ct_order_${orderId}`);
    if (!raw) {
      setStatus('ready');
      return;
    }

    try {
      const parsed = JSON.parse(raw) as StoredSnapshot;
      setSnapshot(parsed);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid order snapshot');
      setStatus('error');
    }
  }, [orderId, status]);

  // Poll for order status updates
  useEffect(() => {
    if (!orderId || status !== 'ready') return;

    // Initial fetch
    fetchOrderStatus();

    // Poll every 10 seconds until order is ready or completed
    const interval = setInterval(() => {
      if (orderStatus?.status === 'ready' || orderStatus?.status === 'completed') {
        clearInterval(interval);
        return;
      }
      fetchOrderStatus();
    }, 10000);

    return () => clearInterval(interval);
  }, [orderId, status, fetchOrderStatus, orderStatus?.status]);

  useEffect(() => {
    if (!orderId) return;
    sessionStorage.setItem('ct_refresh_after_checkout', orderId);
  }, [orderId]);

  const formatCurrency = (cents: number, currency: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);

  const getStatusLabel = (s: OrderStatus['status']) => {
    switch (s) {
      case 'placed': return 'Order Received';
      case 'preparing': return 'Being Prepared';
      case 'ready': return 'Ready for Pickup!';
      case 'completed': return 'Completed';
      default: return 'Processing...';
    }
  };

  const getStatusIcon = (s: OrderStatus['status']) => {
    switch (s) {
      case 'placed': return '📋';
      case 'preparing': return '👨‍🍳';
      case 'ready': return '✅';
      case 'completed': return '🎉';
      default: return '⏳';
    }
  };

  return (
    <>
      <Head>
        <title>{`Order confirmed · ${vendorName}`}</title>
      </Head>
      <main className="page">
        <div className="hero">
          <div className="hero-card">
            <p className="eyebrow">Order confirmed</p>
            <h1 className="title">{vendorName}</h1>
            <p className="subtitle">Your order is in. We will notify you when it is ready.</p>
          </div>
        </div>

        <div className="content">
          {/* Order Status Tracker */}
          {status === 'ready' && (
            <section className="card status-card">
              <div className="status-header">
                <h2>Order Status</h2>
                {orderStatus?.shortcode && (
                  <div className="shortcode">#{orderStatus.shortcode}</div>
                )}
              </div>
              
              <div className="status-tracker">
                <div className={`status-step ${orderStatus?.status === 'placed' || orderStatus?.status === 'preparing' || orderStatus?.status === 'ready' || orderStatus?.status === 'completed' ? 'active' : ''} ${orderStatus?.status !== 'placed' && orderStatus?.status !== 'unknown' ? 'completed' : ''}`}>
                  <div className="status-icon">📋</div>
                  <div className="status-label">Received</div>
                </div>
                <div className="status-line"></div>
                <div className={`status-step ${orderStatus?.status === 'preparing' || orderStatus?.status === 'ready' || orderStatus?.status === 'completed' ? 'active' : ''} ${orderStatus?.status === 'ready' || orderStatus?.status === 'completed' ? 'completed' : ''}`}>
                  <div className="status-icon">👨‍🍳</div>
                  <div className="status-label">Preparing</div>
                </div>
                <div className="status-line"></div>
                <div className={`status-step ${orderStatus?.status === 'ready' || orderStatus?.status === 'completed' ? 'active completed' : ''}`}>
                  <div className="status-icon">✅</div>
                  <div className="status-label">Ready!</div>
                </div>
              </div>

              <div className="status-message">
                <span className="status-icon-large">{getStatusIcon(orderStatus?.status || 'unknown')}</span>
                <span className="status-text">{getStatusLabel(orderStatus?.status || 'unknown')}</span>
                {orderStatus?.estimatedWaitMinutes && orderStatus.status !== 'ready' && orderStatus.status !== 'completed' && (
                  <span className="estimated-time">~{orderStatus.estimatedWaitMinutes} min</span>
                )}
              </div>

              {statusLoading && !orderStatus && (
                <p className="muted">Loading status...</p>
              )}
            </section>
          )}

          <section className="card">
            {status === 'idle' && <p className="muted">Finalizing your order…</p>}
            {status === 'error' && <p className="error">{error}</p>}
            {snapshot && status === 'ready' && (
              <>
                <div className="card-header">
                  <h2>Order Summary</h2>
                </div>
                <div className="order-summary">
                  {snapshot.items.map((item) => (
                    <div key={item.id} className="order-summary-row">
                      <span>
                        {item.quantity} × {item.name}
                      </span>
                      <span>{formatCurrency(item.price * item.quantity, snapshot.currency)}</span>
                    </div>
                  ))}
                  <div className="order-summary-total">
                    <span>Total</span>
                    <strong>{formatCurrency(snapshot.total, snapshot.currency)}</strong>
                  </div>
                </div>
              </>
            )}
            <div style={{ marginTop: 20 }}>
              <button type="button" onClick={() => router.push('/')} className="btn-primary">
                Back to Home
              </button>
            </div>
          </section>
        </div>

        <style jsx>{`
          .page {
            min-height: 100vh;
            background: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%);
            color: #e8e8e8;
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
          }

          .hero {
            padding: 48px 24px 24px;
          }

          .hero-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 24px;
            padding: 32px;
            max-width: 600px;
            margin: 0 auto;
          }

          .eyebrow {
            text-transform: uppercase;
            letter-spacing: 3px;
            font-size: 11px;
            opacity: 0.8;
            margin: 0 0 8px;
          }

          .title {
            font-size: 36px;
            font-weight: 700;
            margin: 0 0 12px;
          }

          .subtitle {
            font-size: 16px;
            opacity: 0.9;
            margin: 0;
          }

          .content {
            padding: 0 24px 48px;
            max-width: 600px;
            margin: 0 auto;
          }

          .card {
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            padding: 20px;
          }

          .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
          }

          .card-header h2 {
            font-size: 18px;
            margin: 0;
          }

          .muted {
            color: #888;
            font-size: 13px;
            margin: 0;
          }

          .error {
            color: #f87171;
            font-size: 13px;
            margin: 8px 0 0;
          }

          .order-summary {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .order-summary-row {
            display: flex;
            justify-content: space-between;
            font-size: 14px;
            color: #e8e8e8;
          }

          .order-summary-total {
            display: flex;
            justify-content: space-between;
            margin-top: 8px;
            padding-top: 12px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            font-size: 16px;
          }

          .btn-primary {
            width: 100%;
            padding: 12px;
            border-radius: 12px;
            border: none;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #fff;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.1s, opacity 0.2s;
          }

          .btn-primary:hover {
            opacity: 0.9;
          }

          .btn-primary:active {
            transform: scale(0.98);
          }

          .status-card {
            margin-bottom: 16px;
          }

          .status-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
          }

          .status-header h2 {
            font-size: 18px;
            margin: 0;
          }

          .shortcode {
            font-size: 24px;
            font-weight: 700;
            color: #667eea;
            background: rgba(102, 126, 234, 0.1);
            padding: 8px 16px;
            border-radius: 12px;
          }

          .status-tracker {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 24px;
          }

          .status-step {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            opacity: 0.4;
            transition: opacity 0.3s, transform 0.3s;
          }

          .status-step.active {
            opacity: 1;
          }

          .status-step.completed .status-icon {
            background: linear-gradient(135deg, #34c759 0%, #30d158 100%);
          }

          .status-step .status-icon {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
          }

          .status-step.active .status-icon {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            animation: pulse-glow 2s infinite;
          }

          @keyframes pulse-glow {
            0%, 100% {
              box-shadow: 0 0 0 0 rgba(102, 126, 234, 0.4);
            }
            50% {
              box-shadow: 0 0 20px 10px rgba(102, 126, 234, 0);
            }
          }

          .status-step .status-label {
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .status-line {
            flex: 1;
            height: 3px;
            background: rgba(255, 255, 255, 0.1);
            margin: 0 8px;
            margin-bottom: 28px;
          }

          .status-message {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            padding: 16px;
            background: rgba(102, 126, 234, 0.1);
            border-radius: 12px;
          }

          .status-icon-large {
            font-size: 32px;
          }

          .status-text {
            font-size: 18px;
            font-weight: 600;
            color: #e8e8e8;
          }

          .estimated-time {
            font-size: 14px;
            color: #888;
            padding: 4px 12px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
          }
        `}</style>
      </main>
    </>
  );
}

