import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';

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

  useEffect(() => {
    if (!orderId) return;
    sessionStorage.setItem('ct_refresh_after_checkout', orderId);
  }, [orderId]);

  const formatCurrency = (cents: number, currency: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);

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
                <div style={{ marginTop: 20 }}>
                  <button type="button" onClick={() => router.push('/')} className="btn-primary">
                    Back to Home
                  </button>
                </div>
              </>
            )}
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
        `}</style>
      </main>
    </>
  );
}

