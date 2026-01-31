import Head from 'next/head';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getBrowserSupabaseClient } from '../lib/supabaseBrowser';

export default function ResetPasswordPage() {
  const [supabase, setSupabase] = useState<ReturnType<typeof getBrowserSupabaseClient>>(null);
  const [loading, setLoading] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const client = getBrowserSupabaseClient();
    setSupabase(client);
    if (!client) {
      setLoading(false);
      return;
    }
    // Supabase client has detectSessionInUrl: true, so it will exchange the hash for a session on load.
    const checkSession = () => {
      client.auth.getSession().then(({ data: { session }, error: sessionError }) => {
        if (sessionError) {
          setLoading(false);
          return;
        }
        const hash = window.location.hash || '';
        const hasRecoveryHash = hash.includes('type=recovery') || hash.includes('access_token=');
        if (session?.user) {
          setHasRecoverySession(true);
          setLoading(false);
          return;
        }
        if (hasRecoveryHash) {
          // Hash present but session not yet set; give client time to process the hash
          setTimeout(() => {
            client.auth.getSession().then(({ data: { session: retrySession } }) => {
              setHasRecoverySession(!!retrySession?.user);
              setLoading(false);
            });
          }, 500);
        } else {
          setHasRecoverySession(false);
          setLoading(false);
        }
      });
    };
    checkSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setError(null);
    const newPassword = password.trim();
    const confirm = confirmPassword.trim();
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setError(updateError.message);
        setSubmitting(false);
        return;
      }
      setSuccess(true);
      setPassword('');
      setConfirmPassword('');
      // Redirect to login after a short delay
      setTimeout(() => {
        window.location.href = '/login?reset=success';
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <>
        <Head>
          <title>Reset Password – CountrTop Admin</title>
        </Head>
        <main className="reset-page">
          <div className="reset-container">
            <p>Loading…</p>
          </div>
        </main>
        <style jsx>{`
          .reset-page {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--ct-bg-primary);
            color: var(--ct-text);
            font-family: var(--ct-font-body);
          }
          .reset-container {
            text-align: center;
            padding: 24px;
          }
        `}</style>
      </>
    );
  }

  if (!hasRecoverySession) {
    return (
      <>
        <Head>
          <title>Reset Password – CountrTop Admin</title>
        </Head>
        <main className="reset-page">
          <div className="reset-container">
            <h1>Invalid or expired link</h1>
            <p className="reset-muted">
              This password reset link is invalid or has expired. Please request a new one from the login page.
            </p>
            <Link href="/login" className="reset-link">
              Back to sign in
            </Link>
          </div>
        </main>
        <style jsx>{`
          .reset-page {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--ct-bg-primary);
            color: var(--ct-text);
            font-family: var(--ct-font-body);
          }
          .reset-container {
            max-width: 400px;
            text-align: center;
            padding: 24px;
          }
          .reset-container h1 {
            font-size: 24px;
            margin: 0 0 16px;
          }
          .reset-muted {
            color: var(--ct-text-muted);
            font-size: 14px;
            margin: 0 0 24px;
          }
          .reset-link {
            color: var(--color-primary, #e85d04);
            text-decoration: none;
            font-weight: 600;
          }
          .reset-link:hover {
            text-decoration: underline;
          }
        `}</style>
      </>
    );
  }

  if (success) {
    return (
      <>
        <Head>
          <title>Password Updated – CountrTop Admin</title>
        </Head>
        <main className="reset-page">
          <div className="reset-container">
            <h1>Password updated</h1>
            <p className="reset-muted">
              Your password has been updated. Redirecting you to sign in…
            </p>
            <Link href="/login" className="reset-link">
              Sign in now
            </Link>
          </div>
        </main>
        <style jsx>{`
          .reset-page {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--ct-bg-primary);
            color: var(--ct-text);
            font-family: var(--ct-font-body);
          }
          .reset-container {
            max-width: 400px;
            text-align: center;
            padding: 24px;
          }
          .reset-container h1 {
            font-size: 24px;
            margin: 0 0 16px;
          }
          .reset-muted {
            color: var(--ct-text-muted);
            font-size: 14px;
            margin: 0 0 24px;
          }
          .reset-link {
            color: var(--color-primary, #e85d04);
            text-decoration: none;
            font-weight: 600;
          }
          .reset-link:hover {
            text-decoration: underline;
          }
        `}</style>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Set New Password – CountrTop Admin</title>
      </Head>
      <main className="reset-page">
        <div className="reset-container">
          <h1>Set new password</h1>
          <p className="reset-muted">
            Enter your new password below (at least 8 characters).
          </p>
          {error && (
            <div className="reset-error">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="reset-form">
            <div className="form-group">
              <input
                type="password"
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                required
                minLength={8}
                disabled={submitting}
                autoComplete="new-password"
              />
            </div>
            <div className="form-group">
              <input
                type="password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-field"
                required
                minLength={8}
                disabled={submitting}
                autoComplete="new-password"
              />
            </div>
            <button type="submit" className="btn-submit" disabled={submitting}>
              {submitting ? 'Updating…' : 'Update password'}
            </button>
          </form>
          <Link href="/login" className="reset-link back-link">
            Back to sign in
          </Link>
        </div>
      </main>
      <style jsx>{`
        .reset-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--ct-bg-primary);
          color: var(--ct-text);
          font-family: var(--ct-font-body);
        }
        .reset-container {
          max-width: 400px;
          width: 100%;
          padding: 24px;
        }
        .reset-container h1 {
          font-size: 24px;
          margin: 0 0 8px;
        }
        .reset-muted {
          color: var(--ct-text-muted);
          font-size: 14px;
          margin: 0 0 24px;
        }
        .reset-error {
          padding: 12px 16px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 8px;
          color: #fca5a5;
          font-size: 14px;
          margin-bottom: 20px;
        }
        .reset-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .input-field {
          padding: 12px 16px;
          border: 1px solid var(--ct-card-border, #e5e7eb);
          border-radius: 8px;
          background: var(--ct-bg-primary);
          color: var(--ct-text);
          font-size: 16px;
          font-family: inherit;
        }
        .input-field:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .btn-submit {
          padding: 12px 20px;
          border-radius: 8px;
          border: none;
          background: var(--ct-gradient-primary, linear-gradient(135deg, #e85d04, #f48c06));
          color: white;
          font-weight: 600;
          font-size: 16px;
          cursor: pointer;
          font-family: inherit;
        }
        .btn-submit:hover:not(:disabled) {
          opacity: 0.9;
        }
        .btn-submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .reset-link {
          color: var(--color-primary, #e85d04);
          text-decoration: none;
          font-weight: 600;
          font-size: 14px;
        }
        .reset-link:hover {
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
