import Head from 'next/head';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

const ERROR_MESSAGES: Record<string, string> = {
  denied: 'Square connection was denied. You can try again.',
  invalid_state: 'Invalid or expired session. Please start over.',
  session_expired: 'Your session expired. Please try again.',
  no_locations: 'No Square locations found. Ensure your Square account has at least one location.',
  email_exists: 'An account with this email already exists. Sign in instead.',
  slug_conflict: 'Could not create your store. Please try again.',
  missing_params: 'Missing required parameters. Please start over.',
  csrf_mismatch: 'Security validation failed. Please start over.',
  token_exchange: 'Square connection failed. Please try again.',
  no_tokens: 'Square did not return tokens. Please try again.',
  not_configured: 'Signup is not configured. Please contact support.'
};

export default function SignupPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const err = router.query.error;
    if (typeof err === 'string' && err) {
      setError(ERROR_MESSAGES[err] ?? 'Something went wrong. Please try again.');
    }
  }, [router.query.error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password || password.length < 8) {
      setError('Email and password (min 8 characters) are required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/signup/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: email.trim(),
          password,
          businessName: businessName.trim() || undefined
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      window.location.href = data.redirect ?? '/api/signup/square-oauth/authorize';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to continue');
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Create Account – CountrTop Admin</title>
      </Head>
      <main className="login-page">
        <div className="login-container">
          <h1>Create Vendor Account</h1>
          <p className="subtitle">Connect Square to get started with CountrTop</p>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                required
                disabled={submitting}
                autoComplete="email"
              />
            </div>
            <div className="form-group">
              <input
                type="password"
                placeholder="Password (min 8 characters)"
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
                type="text"
                placeholder="Business name (optional)"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="input-field"
                disabled={submitting}
                autoComplete="organization"
              />
            </div>
            {error && (
              <div className="error-container">
                <p className="error">{error}</p>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="error-dismiss"
                  aria-label="Dismiss error"
                >
                  ×
                </button>
              </div>
            )}
            <button type="submit" className="btn-signin" disabled={submitting}>
              {submitting ? 'Continuing...' : 'Continue with Square'}
            </button>
            <p className="signup-link">
              Already have an account? <Link href="/login">Sign in</Link>
            </p>
          </form>
        </div>

        <style jsx>{`
          .login-page {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--ct-bg-primary);
            color: var(--ct-text);
            font-family: var(--ct-font-body);
            padding: 24px;
          }

          .login-container {
            background: var(--ct-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 16px;
            padding: 48px;
            text-align: center;
            max-width: 400px;
            width: 100%;
          }

          h1 {
            font-size: 28px;
            font-weight: 700;
            margin: 0 0 8px;
            background: var(--ct-gradient-primary);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .subtitle {
            color: var(--color-text-muted);
            margin: 0 0 32px;
            font-size: 16px;
          }

          .btn-signin {
            width: 100%;
            padding: 14px 24px;
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

          .btn-signin:hover:not(:disabled) {
            opacity: 0.9;
          }

          .btn-signin:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .login-form {
            width: 100%;
          }

          .form-group {
            margin-bottom: 16px;
          }

          .input-field {
            width: 100%;
            padding: 12px 16px;
            border-radius: 8px;
            border: 1px solid var(--color-border);
            background: var(--ct-bg-surface);
            color: var(--color-text);
            font-size: 16px;
            font-family: inherit;
            transition: border-color 0.2s;
          }

          .input-field:focus {
            outline: none;
            border-color: var(--color-primary);
          }

          .input-field:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .input-field::placeholder {
            color: var(--color-text-muted);
          }

          .signup-link {
            margin-top: 20px;
            color: var(--color-text-muted);
            font-size: 14px;
          }

          .signup-link a {
            color: var(--color-primary);
            text-decoration: none;
          }

          .signup-link a:hover {
            text-decoration: underline;
          }

          .error-container {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            margin: 16px 0;
            padding: 12px 16px;
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 8px;
            text-align: left;
          }

          .error {
            color: #fca5a5;
            margin: 0;
            flex: 1;
            font-size: 14px;
            line-height: 1.5;
            word-break: break-word;
          }

          .error-dismiss {
            background: none;
            border: none;
            color: #fca5a5;
            font-size: 24px;
            line-height: 1;
            cursor: pointer;
            padding: 0;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            opacity: 0.7;
            transition: opacity 0.2s;
          }

          .error-dismiss:hover {
            opacity: 1;
          }

          @media (max-width: 768px) {
            .login-page {
              padding: 16px;
              align-items: flex-start;
              padding-top: 24px;
            }
            .login-container {
              padding: 28px 20px;
              max-width: 100%;
            }
            h1 {
              font-size: 24px;
            }
            .input-field,
            .btn-signin {
              min-height: 48px;
            }
          }
        `}</style>
      </main>
    </>
  );
}
