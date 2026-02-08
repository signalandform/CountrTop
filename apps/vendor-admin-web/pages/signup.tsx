import Head from 'next/head';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

type PosProvider = 'square' | 'clover';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_state: 'Invalid or expired session. Please start over.',
  session_expired: 'Your session expired. Please try again.',
  email_exists: 'An account with this email already exists. Sign in instead.',
  slug_conflict: 'Could not create your store. Please try again.',
  missing_params: 'Missing required parameters. Please start over.',
  csrf_mismatch: 'Security validation failed. Please start over.',
  use_signup_form: 'Please create your account using the form below (choose your POS and needs first). Connect your POS in Settings after signup.'
};

const STEPS = [
  { id: 1, label: 'POS' },
  { id: 2, label: 'Needs' },
  { id: 3, label: 'Account' }
] as const;

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [posProvider, setPosProvider] = useState<PosProvider | null>(null);
  const [locationsCount, setLocationsCount] = useState<number>(1);
  const [needsKds, setNeedsKds] = useState(true);
  const [needsOnlineOrdering, setNeedsOnlineOrdering] = useState(true);
  const [needsScheduledOrders, setNeedsScheduledOrders] = useState(false);
  const [needsLoyalty, setNeedsLoyalty] = useState(false);
  const [needsCrm, setNeedsCrm] = useState(false);
  const [needsTimeTracking, setNeedsTimeTracking] = useState(false);
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

  const canProceedFromStep1 = posProvider !== null;
  const handleStep1Next = () => {
    if (!canProceedFromStep1) return;
    setError(null);
    setStep(2);
  };

  const handleStep2Next = () => {
    setError(null);
    setStep(3);
  };

  const handleStep2Back = () => {
    setError(null);
    setStep(1);
  };

  const handleStep3Back = () => {
    setError(null);
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!posProvider) {
      setError('Please select your POS system.');
      return;
    }
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
          businessName: businessName.trim() || undefined,
          pos_provider: posProvider,
          locations_count: locationsCount,
          needs_kds: needsKds,
          needs_online_ordering: needsOnlineOrdering,
          needs_scheduled_orders: needsScheduledOrders,
          needs_loyalty: needsLoyalty,
          needs_crm: needsCrm,
          needs_time_tracking: needsTimeTracking
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      window.location.href = data.redirect ?? '/login';
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
          <div className="step-indicator">
            {STEPS.map((s) => (
              <span
                key={s.id}
                className={`step-dot ${step === s.id ? 'active' : ''} ${step > s.id ? 'done' : ''}`}
                aria-current={step === s.id ? 'step' : undefined}
              >
                {s.id}
              </span>
            ))}
          </div>

          {step === 1 && (
            <>
              <p className="subtitle">Which POS system do you use?</p>
              <p className="hint">You will connect your POS after account creation.</p>
              <div className="pos-options">
                <button
                  type="button"
                  className={`pos-option ${posProvider === 'square' ? 'selected' : ''}`}
                  onClick={() => setPosProvider('square')}
                >
                  <span className="pos-name">Square</span>
                </button>
                <button
                  type="button"
                  className={`pos-option ${posProvider === 'clover' ? 'selected' : ''}`}
                  onClick={() => setPosProvider('clover')}
                >
                  <span className="pos-name">Clover</span>
                </button>
              </div>
              {error && (
                <div className="error-container">
                  <p className="error">{error}</p>
                  <button type="button" onClick={() => setError(null)} className="error-dismiss" aria-label="Dismiss error">
                    ×
                  </button>
                </div>
              )}
              <button
                type="button"
                className="btn-signin"
                onClick={handleStep1Next}
                disabled={!canProceedFromStep1}
              >
                Next
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <p className="subtitle">What do you need?</p>
              <form onSubmit={(e) => { e.preventDefault(); handleStep2Next(); }} className="login-form">
                <div className="form-group">
                  <label htmlFor="locations_count">How many locations?</label>
                  <input
                    id="locations_count"
                    type="number"
                    min={1}
                    max={99}
                    value={locationsCount}
                    onChange={(e) => setLocationsCount(Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1)))}
                    className="input-field"
                  />
                </div>
                <div className="needs-checklist">
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={needsKds}
                      onChange={(e) => setNeedsKds(e.target.checked)}
                    />
                    <span>Kitchen Display System (KDS)</span>
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={needsOnlineOrdering}
                      onChange={(e) => setNeedsOnlineOrdering(e.target.checked)}
                    />
                    <span>Online order support</span>
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={needsScheduledOrders}
                      onChange={(e) => setNeedsScheduledOrders(e.target.checked)}
                    />
                    <span>Scheduled order support</span>
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={needsLoyalty}
                      onChange={(e) => setNeedsLoyalty(e.target.checked)}
                    />
                    <span>Customer loyalty rewards</span>
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={needsCrm}
                      onChange={(e) => setNeedsCrm(e.target.checked)}
                    />
                    <span>CRM</span>
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={needsTimeTracking}
                      onChange={(e) => setNeedsTimeTracking(e.target.checked)}
                    />
                    <span>Employee time tracking</span>
                  </label>
                </div>
                {error && (
                  <div className="error-container">
                    <p className="error">{error}</p>
                    <button type="button" onClick={() => setError(null)} className="error-dismiss" aria-label="Dismiss error">
                      ×
                    </button>
                  </div>
                )}
                <div className="step-actions">
                  <button type="button" className="btn-secondary" onClick={handleStep2Back}>
                    Back
                  </button>
                  <button type="submit" className="btn-signin">
                    Next
                  </button>
                </div>
              </form>
            </>
          )}

          {step === 3 && (
            <>
              <p className="subtitle">
                Create your account. Connect your {posProvider === 'clover' ? 'Clover' : 'Square'} account in Settings after signup.
              </p>
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
                    <button type="button" onClick={() => setError(null)} className="error-dismiss" aria-label="Dismiss error">
                      ×
                    </button>
                  </div>
                )}
                <div className="step-actions">
                  <button type="button" className="btn-secondary" onClick={handleStep3Back} disabled={submitting}>
                    Back
                  </button>
                  <button type="submit" className="btn-signin" disabled={submitting}>
                    {submitting ? 'Creating account...' : 'Create Account'}
                  </button>
                </div>
                <p className="signup-link">
                  Already have an account? <Link href="/login">Sign in</Link>
                </p>
              </form>
            </>
          )}
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
            max-width: 440px;
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

          .step-indicator {
            display: flex;
            justify-content: center;
            gap: 8px;
            margin: 16px 0 24px;
          }

          .step-dot {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            border: 2px solid var(--color-border);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: 600;
            color: var(--color-text-muted);
          }

          .step-dot.active {
            border-color: var(--color-primary);
            background: var(--color-primary);
            color: white;
          }

          .step-dot.done {
            border-color: var(--color-primary);
            color: var(--color-primary);
          }

          .subtitle {
            color: var(--color-text-muted);
            margin: 0 0 8px;
            font-size: 16px;
          }

          .hint {
            color: var(--color-text-muted);
            margin: 0 0 24px;
            font-size: 14px;
          }

          .pos-options {
            display: flex;
            gap: 12px;
            margin-bottom: 24px;
            justify-content: center;
          }

          .pos-option {
            flex: 1;
            padding: 16px 20px;
            border-radius: 12px;
            border: 2px solid var(--color-border);
            background: var(--ct-bg-surface);
            color: var(--ct-text);
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: border-color 0.2s, background 0.2s;
          }

          .pos-option:hover {
            border-color: var(--color-primary);
          }

          .pos-option.selected {
            border-color: var(--color-primary);
            background: rgba(var(--color-primary-rgb, 99, 102, 241), 0.1);
          }

          .needs-checklist {
            text-align: left;
            margin: 16px 0 24px;
          }

          .check-row {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 0;
            cursor: pointer;
            font-size: 15px;
          }

          .check-row input {
            width: 18px;
            height: 18px;
          }

          .step-actions {
            display: flex;
            gap: 12px;
            margin-top: 24px;
          }

          .btn-secondary {
            flex: 1;
            padding: 14px 24px;
            border-radius: 12px;
            border: 1px solid var(--color-border);
            background: transparent;
            color: var(--ct-text);
            font-weight: 600;
            font-size: 16px;
            cursor: pointer;
            font-family: inherit;
          }

          .btn-secondary:hover:not(:disabled) {
            background: var(--ct-bg-primary);
          }

          .btn-signin {
            flex: 1;
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
            text-align: left;
          }

          .form-group label {
            display: block;
            margin-bottom: 6px;
            font-size: 14px;
            color: var(--color-text-muted);
          }

          .input-field {
            width: 100%;
            padding: 12px 16px;
            border-radius: 8px;
            border: 1px solid var(--color-border);
            background: var(--ct-bg-surface);
            color: var(--ct-text);
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
            .pos-options {
              flex-direction: column;
            }
            .input-field,
            .btn-signin,
            .btn-secondary {
              min-height: 48px;
            }
          }
        `}</style>
      </main>
    </>
  );
}
