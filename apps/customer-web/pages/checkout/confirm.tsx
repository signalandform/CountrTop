import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';

import { resolveVendorSlugFromHost } from '@countrtop/data';

import { getServerDataClient } from '../../lib/dataClient';
import { OrderStatusTracker, OrderStatusState } from '../../components/OrderStatusTracker';

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

  // Track if polling should continue (use ref to avoid effect dependency issues)
  const shouldPollRef = useRef(true);
  
  // Update ref when status changes
  useEffect(() => {
    shouldPollRef.current = !(orderStatus?.status === 'ready' || orderStatus?.status === 'completed');
  }, [orderStatus?.status]);

  // Poll for order status updates
  useEffect(() => {
    if (!orderId || status !== 'ready') return;

    // Initial fetch
    fetchOrderStatus();

    // Poll every 10 seconds until order is ready or completed
    const interval = setInterval(() => {
      if (!shouldPollRef.current) {
        return; // Don't clear interval, just skip - cleanup handles it
      }
      fetchOrderStatus();
    }, 10000);

    return () => clearInterval(interval);
  }, [orderId, status, fetchOrderStatus]);

  useEffect(() => {
    if (!orderId) return;
    sessionStorage.setItem('ct_refresh_after_checkout', orderId);
  }, [orderId]);


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
          {status === 'idle' && (
            <div className="card">
              <p className="muted">Finalizing your order…</p>
            </div>
          )}
          {status === 'error' && (
            <div className="card">
              <p className="error">{error}</p>
            </div>
          )}
          {status === 'ready' && (
            <OrderStatusTracker
              status={(orderStatus?.status || 'placed') as OrderStatusState}
              shortcode={orderStatus?.shortcode}
              estimatedWaitMinutes={orderStatus?.estimatedWaitMinutes}
              orderId={orderId}
              items={snapshot?.items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                price: item.price
              }))}
              total={snapshot?.total}
              currency={snapshot?.currency}
              placedAt={orderStatus?.placedAt}
            />
          )}

          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <button type="button" onClick={() => router.push('/')} className="btn-primary">
              Back to Home
            </button>
          </div>
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

          .btn-primary {
            padding: 14px 32px;
            border-radius: 12px;
            border: none;
            background: var(--theme-button, #667eea);
            color: #fff;
            font-weight: 600;
            font-size: 16px;
            cursor: pointer;
            transition: transform 0.1s, opacity 0.2s;
          }

          .btn-primary:hover {
            opacity: 0.9;
          }

          .btn-primary:active {
            transform: scale(0.98);
          }
        `}</style>
      </main>
    </>
  );
}

