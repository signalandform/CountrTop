import Head from 'next/head';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { addRecentVendor } from '../lib/recents';

type PairResult = {
  sessionToken: string;
  vendorSlug: string;
  locationId: string;
  vendorId: string;
  expiresAt: string;
};

export default function PairPage() {
  const router = useRouter();
  const token = useMemo(() => {
    const value = router.query.token;
    return Array.isArray(value) ? value[0] : value;
  }, [router.query.token]);

  const [status, setStatus] = useState<'idle' | 'pairing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const pairDevice = useCallback(async () => {
    if (!token) {
      setError('Pairing token is missing.');
      setStatus('error');
      return;
    }
    setStatus('pairing');
    setError(null);
    try {
      const response = await fetch('/api/kds/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Unable to pair device');
      }

      const session = data.data as PairResult;
      localStorage.setItem('kds_session', JSON.stringify(session));

      const expiresAt = new Date(session.expiresAt);
      const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
      const sessionDataBase64 = btoa(JSON.stringify(session));
      document.cookie = `kds_session=${sessionDataBase64}; path=/; max-age=${maxAge}; SameSite=Lax`;

      addRecentVendor({ slug: session.vendorSlug });
      setStatus('success');

      router.replace(`/vendors/${session.vendorSlug}?locationId=${session.locationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to pair device');
      setStatus('error');
    }
  }, [router, token]);

  useEffect(() => {
    if (!router.isReady) return;
    if (!token) {
      setError('Pairing token is missing.');
      setStatus('error');
      return;
    }
    pairDevice();
  }, [router.isReady, token, pairDevice]);

  return (
    <>
      <Head>
        <title>Pair KDS Device · CountrTop</title>
      </Head>
      <main className="page">
        <div className="container">
          <h1 className="title">Pair KDS Device</h1>
          <p className="subtitle">We&apos;re connecting this device to your kitchen.</p>

          <div className="card">
            {status === 'pairing' && (
              <div className="status-row">
                <span className="spinner" />
                <span>Pairing in progress…</span>
              </div>
            )}
            {status === 'success' && (
              <div className="status-row success">
                <span>✅ Paired successfully. Redirecting…</span>
              </div>
            )}
            {status === 'error' && (
              <div className="status-row error">
                <span>{error}</span>
                <button type="button" onClick={pairDevice} className="button">
                  Retry
                </button>
              </div>
            )}
            {status === 'idle' && (
              <div className="status-row">
                <span>Waiting for pairing token…</span>
              </div>
            )}
          </div>
        </div>

        <style jsx>{`
          .page {
            min-height: 100vh;
            background: var(--ct-bg-primary);
            color: var(--ct-text);
            font-family: var(--ct-font-body);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
          }

          .container {
            max-width: 420px;
            width: 100%;
            text-align: center;
          }

          .title {
            font-size: 32px;
            font-weight: 700;
            margin: 0 0 8px;
            background: var(--ct-gradient-primary);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .subtitle {
            font-size: 15px;
            color: var(--color-text-muted);
            margin: 0 0 24px;
          }

          .card {
            background: var(--ct-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 16px;
            padding: 20px;
            text-align: left;
          }

          .status-row {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 15px;
          }

          .status-row.error {
            color: #ef4444;
            justify-content: space-between;
          }

          .status-row.success {
            color: #10b981;
          }

          .spinner {
            width: 16px;
            height: 16px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-top-color: #fff;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }

          .button {
            padding: 8px 16px;
            border-radius: 10px;
            border: none;
            background: var(--ct-gradient-primary);
            color: white;
            font-weight: 600;
            cursor: pointer;
          }

          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </main>
    </>
  );
}
