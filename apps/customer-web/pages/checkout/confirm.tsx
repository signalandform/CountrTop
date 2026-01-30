import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';

import { resolveVendorSlugFromHost } from '@countrtop/data';

import { getServerDataClient } from '../../lib/dataClient';
import { OrderStatusTracker, OrderStatusState } from '../../components/OrderStatusTracker';

type ConfirmProps = {
  vendorName: string;
  vendorPhone?: string | null;
  vendorAddress?: string | null;
  vendorTimezone?: string | null;
  vendorPickupInstructions?: string | null;
};

type StoredSnapshot = {
  squareOrderId: string;
  items: { id: string; name: string; quantity: number; price: number }[];
  total: number;
  currency: string;
  pickupLocationName?: string;
  pickupAddress?: string | null;
  pickupInstructions?: string | null;
  contactPhone?: string | null;
  leadTimeMinutes?: number | null;
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
  const vendorAddress = vendor
    ? [vendor.addressLine1, vendor.city, vendor.state, vendor.postalCode].filter(Boolean).join(', ')
    : null;

  return {
    props: {
      vendorName: vendor?.displayName ?? 'CountrTop',
      vendorPhone: vendor?.phone ?? null,
      vendorAddress: vendorAddress || null,
      vendorTimezone: vendor?.timezone ?? null,
      vendorPickupInstructions: vendor?.pickupInstructions ?? null
    }
  };
};

const buildMapsUrl = (query: string): string => {
  const trimmed = query.trim();
  if (!trimmed) return 'https://www.google.com/maps';
  const isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
  return isIOS
    ? `https://maps.apple.com/?q=${encodeURIComponent(trimmed)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
};

const normalizePhone = (phone: string): string =>
  phone.replace(/[^\d+]/g, '').trim();

export default function ConfirmPage({
  vendorName,
  vendorPhone,
  vendorAddress,
  vendorPickupInstructions
}: ConfirmProps) {
  const router = useRouter();
  const orderId = useMemo(() => {
    const value = router.query.orderId;
    return Array.isArray(value) ? value[0] : value;
  }, [router.query.orderId]);
  const [status, setStatus] = useState<'idle' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<StoredSnapshot | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);
  const [, setStatusLoading] = useState(false);

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

  const pickupName = snapshot?.pickupLocationName ?? vendorName;
  const pickupAddress = snapshot?.pickupAddress ?? vendorAddress ?? null;
  const pickupInstructions = snapshot?.pickupInstructions ?? vendorPickupInstructions ?? null;
  const contactPhone = snapshot?.contactPhone ?? vendorPhone ?? null;
  const etaMinutes = orderStatus?.estimatedWaitMinutes ?? snapshot?.leadTimeMinutes ?? null;
  const etaLabel = etaMinutes
    ? `Estimated pickup in ~${etaMinutes} min`
    : 'Pickup time will be shown once the kitchen confirms your order.';
  const mapsUrl = buildMapsUrl(pickupAddress || pickupName);

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
            <>
              <div className="card confirm-details">
                <div className="confirm-row">
                  <div>
                    <div className="label">Order</div>
                    <div className="value">
                      {orderId ? `#${orderId.slice(-6).toUpperCase()}` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="label">Pickup ETA</div>
                    <div className="value">{etaLabel}</div>
                  </div>
                </div>
                <div className="confirm-row">
                  <div>
                    <div className="label">Pickup location</div>
                    <div className="value">{pickupName}</div>
                    {pickupAddress && <div className="muted">{pickupAddress}</div>}
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="link">
                      Open in Maps
                    </a>
                  </div>
                  <div>
                    <div className="label">Contact</div>
                    {contactPhone ? (
                      <a href={`tel:${normalizePhone(contactPhone)}`} className="link">
                        {contactPhone}
                      </a>
                    ) : (
                      <div className="muted">Contact the restaurant directly</div>
                    )}
                  </div>
                </div>
                {pickupInstructions && (
                  <div className="confirm-row">
                    <div>
                      <div className="label">Pickup instructions</div>
                      <div className="value">{pickupInstructions}</div>
                    </div>
                  </div>
                )}
              </div>

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
            </>
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
            background: var(--ct-bg-primary);
            color: var(--ct-text);
            font-family: var(--theme-font, var(--font-body));
          }

          .hero {
            padding: 48px 24px 24px;
          }

          .hero-card {
            background: var(--ct-gradient-primary);
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
            background: var(--ct-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 20px;
            padding: 20px;
          }

          .confirm-details {
            display: flex;
            flex-direction: column;
            gap: 16px;
            margin-bottom: 20px;
          }

          .confirm-row {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
          }

          .label {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            color: var(--color-text-muted);
            font-weight: 700;
          }

          .value {
            font-size: 14px;
            color: var(--color-text);
          }

          .link {
            display: inline-block;
            margin-top: 6px;
            color: var(--theme-accent, var(--color-accent));
            text-decoration: none;
            font-size: 13px;
          }

          .link:hover {
            text-decoration: underline;
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
            color: var(--color-text-muted);
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
            background: var(--theme-button, var(--color-primary));
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

