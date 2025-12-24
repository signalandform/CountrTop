import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { CSSProperties, useEffect, useMemo, useState } from 'react';

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

  return (
    <>
      <Head>
        <title>{`Order confirmed · ${vendorName}`}</title>
      </Head>
      <main style={styles.page}>
        <div style={styles.card}>
          <p style={styles.eyebrow}>Order confirmed</p>
          <h1 style={styles.title}>{vendorName}</h1>
          <p style={styles.subtitle}>
            Your order is in. We will notify you when it is ready.
          </p>
          {snapshot && (
            <div style={styles.summary}>
              <div style={styles.summaryHeader}>Order summary</div>
              {snapshot.items.map((item) => (
                <div key={item.id} style={styles.summaryRow}>
                  <span>
                    {item.quantity} × {item.name}
                  </span>
                  <span>
                    ${(item.price * item.quantity / 100).toFixed(2)}
                  </span>
                </div>
              ))}
              <div style={styles.summaryTotal}>
                <span>Total</span>
                <strong>${(snapshot.total / 100).toFixed(2)}</strong>
              </div>
            </div>
          )}
          {status === 'idle' && <p style={styles.helper}>Finalizing your order…</p>}
          {status === 'error' && <p style={{ ...styles.helper, color: '#b91c1c' }}>{error}</p>}
        </div>
      </main>
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'radial-gradient(circle at top, #f1f5f9, #e2e8f0)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    fontFamily: '"Space Grotesk", "Segoe UI", sans-serif'
  },
  card: {
    background: '#fff',
    borderRadius: 24,
    padding: 32,
    width: 'min(520px, 100%)',
    boxShadow: '0 24px 48px rgba(15, 23, 42, 0.15)'
  },
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontSize: 12,
    color: '#64748b',
    margin: 0
  },
  title: {
    margin: '8px 0 12px',
    fontSize: 32
  },
  subtitle: {
    margin: 0,
    color: '#475569'
  },
  summary: {
    marginTop: 24,
    borderTop: '1px solid #e2e8f0',
    paddingTop: 16
  },
  summaryHeader: {
    fontWeight: 600,
    marginBottom: 12
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 14,
    color: '#475569',
    marginBottom: 6
  },
  summaryTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: 12,
    fontSize: 16
  },
  helper: {
    marginTop: 16,
    color: '#64748b'
  }
};
