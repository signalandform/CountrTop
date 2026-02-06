import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { requireKDSSession } from '../../../lib/auth';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@countrtop/data';
import { createDataClient } from '@countrtop/data';

type SettingsPageProps = {
  vendorSlug: string;
  vendorName: string;
  locationId: string;
  kdsNavView: 'full' | 'minimized';
};

export const getServerSideProps: GetServerSideProps<SettingsPageProps> = async (context) => {
  const slugParam = context.params?.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const locationIdParam = context.query.locationId as string | undefined;

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
  let kdsNavView: 'full' | 'minimized' = 'full';

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseKey && slug) {
    const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
    const dataClient = createDataClient({ supabase });
    const vendor = await dataClient.getVendorBySlug(slug);
    if (vendor?.kdsNavView === 'minimized') kdsNavView = 'minimized';
  }

  return {
    props: {
      vendorSlug: slug ?? 'unknown',
      vendorName: 'KDS',
      locationId,
      kdsNavView
    }
  };
};

export default function KDSSettingsPage({ vendorSlug, vendorName, locationId, kdsNavView: initialKdsNavView }: SettingsPageProps) {
  const router = useRouter();
  const backHref = `/vendors/${vendorSlug}${locationId ? `?locationId=${locationId}` : ''}`;
  const [kdsNavView, setKdsNavView] = useState<'full' | 'minimized'>(initialKdsNavView);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const url = `/api/vendors/${vendorSlug}/kds-settings${locationId ? `?locationId=${locationId}` : ''}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ kdsNavView })
      });
      const data = await res.json();
      if (data.ok) {
        setSaved(true);
        setTimeout(() => {
          router.push(backHref);
        }, 600);
      } else {
        setError(data.error || 'Failed to save');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Head>
        <title>Settings · {vendorName} - KDS</title>
      </Head>
      <main className="page">
        <div className="container">
          <h1 className="title">Settings</h1>
          <div className="settings-section">
            <label className="settings-label">Nav view</label>
            <div className="settings-options">
              <label className="settings-option">
                <input
                  type="radio"
                  name="kdsNavView"
                  value="full"
                  checked={kdsNavView === 'full'}
                  onChange={() => setKdsNavView('full')}
                  disabled={saving}
                />
                <span>Full</span>
              </label>
              <label className="settings-option">
                <input
                  type="radio"
                  name="kdsNavView"
                  value="minimized"
                  checked={kdsNavView === 'minimized'}
                  onChange={() => setKdsNavView('minimized')}
                  disabled={saving}
                />
                <span>Minimized</span>
              </label>
            </div>
            <p className="settings-hint">Minimized shows icon-only buttons in the header.</p>
            <div className="settings-actions">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || kdsNavView === initialKdsNavView}
                className="settings-save-btn"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              {saved && <span className="settings-saved">Saved.</span>}
              {error && <span className="settings-error">{error}</span>}
            </div>
          </div>
          <Link href={backHref} className="back-link">
            Back to KDS
          </Link>
        </div>
        <style jsx>{`
          .page {
            min-height: 100vh;
            background: var(--ct-bg-primary);
            color: var(--ct-text);
            font-family: var(--ct-font-body);
            padding: 32px;
            display: flex;
            align-items: flex-start;
            justify-content: center;
          }
          .container {
            max-width: 560px;
            width: 100%;
          }
          .title {
            font-size: 28px;
            font-weight: 700;
            margin: 0 0 24px;
            background: var(--ct-gradient-primary);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }
          .settings-section {
            margin-bottom: 24px;
            padding: 20px;
            background: var(--ct-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 12px;
          }
          .settings-label {
            display: block;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 12px;
          }
          .settings-options {
            display: flex;
            gap: 24px;
            margin-bottom: 8px;
          }
          .settings-option {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
          }
          .settings-option input {
            cursor: pointer;
          }
          .settings-hint {
            font-size: 13px;
            color: var(--color-text-muted);
            margin: 0 0 16px;
          }
          .settings-actions {
            display: flex;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
          }
          .settings-save-btn {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            background: var(--ct-gradient-primary);
            color: white;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: opacity 0.2s;
            font-family: inherit;
          }
          .settings-save-btn:hover:not(:disabled) {
            opacity: 0.9;
          }
          .settings-save-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
          .settings-saved {
            font-size: 13px;
            color: var(--color-success, #10B981);
            font-weight: 500;
          }
          .settings-error {
            font-size: 13px;
            color: #ef4444;
            font-weight: 500;
          }
          .back-link {
            display: inline-block;
            padding: 12px 20px;
            border-radius: 12px;
            border: 1px solid var(--color-border);
            background: var(--ct-bg-surface);
            color: var(--ct-text);
            font-weight: 600;
            font-size: 14px;
            text-decoration: none;
            transition: background 0.2s, border-color 0.2s;
          }
          .back-link:hover {
            background: var(--color-bg-warm);
            border-color: var(--color-primary);
          }
        `}</style>
      </main>
    </>
  );
}
