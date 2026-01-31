import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { getBrowserSupabaseClient } from '../lib/supabaseBrowser';

export default function MfaChallengePage() {
  const router = useRouter();
  const factorId = typeof router.query.factorId === 'string' ? router.query.factorId : null;
  const [supabase, setSupabase] = useState<ReturnType<typeof getBrowserSupabaseClient>>(null);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidSession, setInvalidSession] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setSupabase(getBrowserSupabaseClient());
  }, []);

  useEffect(() => {
    if (!factorId || !supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) setInvalidSession(true);
    });
  }, [factorId, supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !factorId) return;
    const trimmedCode = code.trim().replace(/\s/g, '');
    if (!trimmedCode) {
      setError('Enter the code from your authenticator app.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) {
        setError(challengeError.message);
        setSubmitting(false);
        return;
      }
      const challengeId = (challengeData as { id: string })?.id;
      if (!challengeId) {
        setError('Failed to create challenge');
        setSubmitting(false);
        return;
      }
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: trimmedCode
      });
      if (verifyError) {
        setError(verifyError.message);
        setSubmitting(false);
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || !session?.refresh_token) {
        setError('Verification succeeded but session is missing. Please sign in again.');
        setSubmitting(false);
        return;
      }
      const setSessionRes = await fetch('/api/auth/set-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token
        })
      });
      if (!setSessionRes.ok) {
        setError('Failed to set session. Please try again.');
        setSubmitting(false);
        return;
      }
      await new Promise((r) => setTimeout(r, 300));
      const vendorRes = await fetch('/api/me/vendor', { credentials: 'include' });
      if (!vendorRes.ok) {
        setError('Vendor lookup failed. Please try again.');
        setSubmitting(false);
        return;
      }
      const { slug } = await vendorRes.json();
      if (slug) {
        window.location.replace(`/vendors/${slug}`);
      } else {
        window.location.replace('/access-denied');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      setSubmitting(false);
    }
  };

  if (!factorId || invalidSession) {
    return (
      <>
        <Head>
          <title>Sign In Required – CountrTop Admin</title>
        </Head>
        <main className="mfa-page">
          <div className="mfa-container">
            <h1>Sign in required</h1>
            <p>This page requires an active sign-in. Please sign in first.</p>
            <Link href="/login" className="mfa-link">Go to sign in</Link>
          </div>
        </main>
        <style jsx>{`
          .mfa-page {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--ct-bg-primary);
            color: var(--ct-text);
            font-family: var(--ct-font-body);
          }
          .mfa-container {
            max-width: 400px;
            text-align: center;
            padding: 24px;
          }
          .mfa-container h1 { font-size: 24px; margin: 0 0 16px; }
          .mfa-container p { margin: 0 0 24px; color: var(--ct-text-muted); font-size: 14px; }
          .mfa-link { color: var(--color-primary, #e85d04); font-weight: 600; text-decoration: none; }
          .mfa-link:hover { text-decoration: underline; }
        `}</style>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Two-Factor Authentication – CountrTop Admin</title>
      </Head>
      <main className="mfa-page">
        <div className="mfa-container">
          <h1>Two-factor authentication</h1>
          <p className="mfa-muted">Enter the code from your authenticator app to continue.</p>
          {error && <div className="mfa-error">{error}</div>}
          <form onSubmit={handleSubmit} className="mfa-form">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="mfa-input"
              maxLength={6}
              disabled={submitting}
            />
            <button type="submit" className="mfa-submit" disabled={submitting}>
              {submitting ? 'Verifying…' : 'Verify'}
            </button>
          </form>
          <Link href="/login" className="mfa-link back-link">Use a different account</Link>
        </div>
      </main>
      <style jsx>{`
        .mfa-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--ct-bg-primary);
          color: var(--ct-text);
          font-family: var(--ct-font-body);
        }
        .mfa-container {
          max-width: 400px;
          width: 100%;
          padding: 24px;
        }
        .mfa-container h1 {
          font-size: 24px;
          margin: 0 0 8px;
        }
        .mfa-muted {
          margin: 0 0 24px;
          color: var(--ct-text-muted);
          font-size: 14px;
        }
        .mfa-error {
          padding: 12px 16px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 8px;
          color: #fca5a5;
          font-size: 14px;
          margin-bottom: 20px;
        }
        .mfa-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .mfa-input {
          padding: 14px 20px;
          border: 1px solid var(--ct-card-border, #e5e7eb);
          border-radius: 8px;
          background: var(--ct-bg-primary);
          color: var(--ct-text);
          font-size: 20px;
          font-family: ui-monospace, monospace;
          letter-spacing: 0.3em;
          text-align: center;
          max-width: 200px;
          margin: 0 auto;
        }
        .mfa-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .mfa-submit {
          padding: 12px 24px;
          border-radius: 8px;
          border: none;
          background: var(--ct-gradient-primary, linear-gradient(135deg, #e85d04, #f48c06));
          color: white;
          font-weight: 600;
          font-size: 16px;
          cursor: pointer;
          font-family: inherit;
        }
        .mfa-submit:hover:not(:disabled) {
          opacity: 0.9;
        }
        .mfa-submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .mfa-link {
          color: var(--color-primary, #e85d04);
          font-weight: 600;
          font-size: 14px;
          text-decoration: none;
        }
        .mfa-link:hover {
          text-decoration: underline;
        }
        .back-link {
          display: inline-block;
          margin-top: 24px;
        }
      `}</style>
    </>
  );
}
