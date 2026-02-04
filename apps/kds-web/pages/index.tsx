import Head from 'next/head';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';

import {
  addRecentVendor,
  clearRecentVendors,
  getRecentVendors,
  type RecentVendor
} from '../lib/recents';

export default function KDSHome() {
  const router = useRouter();
  const [vendorSlug, setVendorSlug] = useState('');
  const [error, setError] = useState<{
    title: string;
    message: string;
    primaryLabel: string;
    onPrimary: () => void;
    secondaryLabel?: string;
    onSecondary?: () => void;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [recentVendors, setRecentVendors] = useState<RecentVendor[]>([]);

  useEffect(() => {
    setRecentVendors(getRecentVendors());
  }, []);

  const refreshRecents = useCallback(() => {
    setRecentVendors(getRecentVendors());
  }, []);

  const verifySlug = useCallback(async (slug: string) => {
    setChecking(true);
    setError(null);
    try {
      const response = await fetch(`/api/kds/vendors/${encodeURIComponent(slug)}/locations`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        const message = data?.error || 'Failed to load vendor';
        if (response.status === 404) {
          setError({
            title: 'Vendor not found',
            message: 'We could not find that vendor slug. Please check and try again.',
            primaryLabel: 'Try again',
            onPrimary: () => setError(null)
          });
        } else {
          setError({
            title: 'Unable to load vendor',
            message,
            primaryLabel: 'Try again',
            onPrimary: () => verifySlug(slug)
          });
        }
        return;
      }

      if (!data.data || data.data.length === 0) {
        setError({
          title: 'No locations available',
          message: 'This vendor has no active locations. KDS may be disabled.',
          primaryLabel: 'Back',
          onPrimary: () => setError(null)
        });
        return;
      }

      addRecentVendor({ slug });
      refreshRecents();
      router.push(`/login?vendorSlug=${encodeURIComponent(slug)}`);
    } catch (err) {
      setError({
        title: 'Network error',
        message: 'We could not verify that vendor. Please check your connection.',
        primaryLabel: 'Try again',
        onPrimary: () => verifySlug(slug)
      });
    } finally {
      setChecking(false);
    }
  }, [refreshRecents, router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const rawSlug = vendorSlug.trim().toLowerCase();
    if (!rawSlug) {
      setError({
        title: 'Missing vendor slug',
        message: 'Please enter a vendor slug to continue.',
        primaryLabel: 'Try again',
        onPrimary: () => setError(null)
      });
      return;
    }
    if (!/^[a-z0-9-]+$/.test(rawSlug)) {
      setError({
        title: 'Invalid vendor slug',
        message: 'Slugs only include letters, numbers, and dashes.',
        primaryLabel: 'Try again',
        onPrimary: () => setError(null)
      });
      return;
    }
    verifySlug(rawSlug);
  };

  const handleRecentClick = (slug: string) => {
    setVendorSlug(slug);
    verifySlug(slug);
  };

  const handleClearRecents = () => {
    clearRecentVendors();
    refreshRecents();
  };

  return (
    <>
      <Head>
        <title>CountrTop KDS</title>
      </Head>
      <main className="page">
        <div className="container">
          <h1 className="title">CountrTop KDS</h1>
          <p className="subtitle">Kitchen Display System</p>
          
          <div className="pwa-banner">
            <p>💡 Tap Share → Add to Home Screen for the best experience</p>
          </div>

          {error && (
            <div className="error-panel">
              <h2>{error.title}</h2>
              <p>{error.message}</p>
              <div className="error-actions">
                <button type="button" onClick={error.onPrimary} className="button">
                  {error.primaryLabel}
                </button>
                {error.secondaryLabel && error.onSecondary && (
                  <button type="button" onClick={error.onSecondary} className="button button-secondary">
                    {error.secondaryLabel}
                  </button>
                )}
              </div>
            </div>
          )}

          {recentVendors.length > 0 && (
            <div className="recents">
              <div className="recents-header">
                <h2>Recent vendors</h2>
                <button type="button" onClick={handleClearRecents} className="link-button">
                  Clear recents
                </button>
              </div>
              <div className="recents-list">
                {recentVendors.map((vendor) => (
                  <button
                    key={vendor.slug}
                    type="button"
                    className="recent-item"
                    onClick={() => handleRecentClick(vendor.slug)}
                  >
                    <span className="recent-name">{vendor.name ?? vendor.slug}</span>
                    <span className="recent-slug">/{vendor.slug}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="form">
            <div className="form-group">
              <label htmlFor="vendorSlug">Enter Vendor Slug</label>
              <input
                id="vendorSlug"
                type="text"
                value={vendorSlug}
                onChange={(e) => {
                  setVendorSlug(e.target.value);
                  setError(null);
                }}
                placeholder="e.g., sunset"
                className="input"
                autoFocus
                disabled={checking}
              />
            </div>
            <button type="submit" className="button" disabled={checking}>
              {checking ? 'Checking…' : 'Continue →'}
            </button>
          </form>
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
            max-width: 400px;
            width: 100%;
            text-align: center;
          }

          .title {
            font-size: 48px;
            font-weight: 700;
            margin: 0 0 8px;
            background: var(--ct-gradient-primary);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .subtitle {
            font-size: 18px;
            color: var(--color-text-muted);
            margin: 0 0 32px;
          }

          .pwa-banner {
            background: rgba(232, 93, 4, 0.12);
            border: 1px solid rgba(232, 93, 4, 0.3);
            border-radius: 12px;
            padding: 12px 16px;
            margin-bottom: 32px;
            font-size: 14px;
            color: var(--color-primary);
          }

          .error-panel {
            border: 1px solid rgba(239, 68, 68, 0.4);
            background: rgba(239, 68, 68, 0.08);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 24px;
            text-align: left;
          }

          .error-panel h2 {
            font-size: 16px;
            margin: 0 0 6px;
            color: #ef4444;
          }

          .error-panel p {
            font-size: 14px;
            margin: 0 0 12px;
            color: var(--color-text);
          }

          .error-actions {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
          }

          .button-secondary {
            background: transparent;
            border: 1px solid var(--color-border);
            color: var(--color-text);
          }

          .recents {
            text-align: left;
            margin-bottom: 24px;
          }

          .recents-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
          }

          .recents-header h2 {
            font-size: 14px;
            margin: 0;
            color: var(--color-text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .link-button {
            background: none;
            border: none;
            color: var(--color-primary);
            font-size: 12px;
            cursor: pointer;
            padding: 0;
          }

          .recents-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .recent-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border: 1px solid var(--color-border);
            border-radius: 12px;
            padding: 10px 12px;
            background: var(--ct-bg-surface);
            cursor: pointer;
            font-size: 14px;
            color: var(--color-text);
          }

          .recent-item:hover {
            background: var(--color-bg-warm);
          }

          .recent-name {
            font-weight: 600;
          }

          .recent-slug {
            color: var(--color-text-muted);
            font-size: 12px;
          }

          .form {
            display: flex;
            flex-direction: column;
            gap: 20px;
          }

          .form-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
            text-align: left;
          }

          .form-group label {
            font-size: 14px;
            font-weight: 600;
            color: var(--color-accent);
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .input {
            padding: 16px;
            border-radius: 12px;
            border: 1px solid var(--color-border);
            background: var(--ct-bg-surface);
            color: var(--color-text);
            font-size: 16px;
            font-family: inherit;
            transition: border-color 0.2s;
          }

          .input:focus {
            outline: none;
            border-color: var(--color-primary);
          }

          .error {
            color: #fca5a5;
            font-size: 14px;
            margin: 0;
          }

          .button {
            padding: 16px 24px;
            border-radius: 12px;
            border: none;
            background: var(--ct-gradient-primary);
            color: white;
            font-weight: 600;
            font-size: 16px;
            cursor: pointer;
            transition: opacity 0.2s;
            font-family: inherit;
          }

          .button:hover {
            opacity: 0.9;
          }

          .button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .button:active {
            opacity: 0.8;
          }
        `}</style>
      </main>
    </>
  );
}

