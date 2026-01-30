import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';

import {
  addRecentVendor,
  clearRecentVendors,
  getRecentVendors,
  type RecentVendor
} from '../lib/recents';

type Vendor = {
  slug: string;
  displayName: string;
  squareLocationId: string;
};

type Location = {
  id: string;
  name: string;
  isPrimary?: boolean;
  address?: string;
};

type Step = 'vendor' | 'location' | 'pin';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('vendor');
  const [loading, setLoading] = useState(false);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [error, setError] = useState<{
    title: string;
    message: string;
    primaryLabel: string;
    onPrimary: () => void;
    secondaryLabel?: string;
    onSecondary?: () => void;
  } | null>(null);

  // Vendor selection
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [vendorSearch, setVendorSearch] = useState('');

  // Location selection
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);

  // PIN entry
  const [pin, setPin] = useState('');
  const [authenticating, setAuthenticating] = useState(false);
  const [recentVendors, setRecentVendors] = useState<RecentVendor[]>([]);

  // Check for existing session
  useEffect(() => {
    const existingSession = localStorage.getItem('kds_session');
    if (existingSession) {
      try {
        const session = JSON.parse(existingSession);
        if (session.expiresAt && new Date(session.expiresAt) > new Date()) {
          // Valid session exists, redirect
          router.push(`/vendors/${session.vendorSlug}?locationId=${session.locationId}`);
          return;
        } else {
          // Expired session, clear it
          localStorage.removeItem('kds_session');
        }
      } catch {
        // Invalid session, clear it
        localStorage.removeItem('kds_session');
      }
    }
  }, [router]);

  // Fetch vendors on mount
  const refreshRecents = useCallback(() => {
    setRecentVendors(getRecentVendors());
  }, []);

  useEffect(() => {
    refreshRecents();
  }, [refreshRecents]);

  const fetchVendors = useCallback(async () => {
    setVendorsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/kds/vendors');
      const data = await response.json();
      if (data.success) {
        setVendors(data.data);
      } else {
        setError({
          title: 'Unable to load vendors',
          message: data.error || 'Please check your connection and try again.',
          primaryLabel: 'Try again',
          onPrimary: () => fetchVendors()
        });
      }
    } catch (err) {
      setError({
        title: 'Unable to load vendors',
        message: 'Please check your connection and try again.',
        primaryLabel: 'Try again',
        onPrimary: () => fetchVendors()
      });
      console.error(err);
    } finally {
      setVendorsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const handleBack = useCallback(() => {
    if (step === 'location') {
      setStep('vendor');
      setSelectedVendor(null);
      setLocations([]);
    } else if (step === 'pin') {
      setStep('location');
      setSelectedLocation(null);
      setPin('');
    }
    setError(null);
  }, [step]);

  // Fetch locations when vendor selected
  const fetchLocations = useCallback(async () => {
    if (!selectedVendor) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/kds/vendors/${selectedVendor.slug}/locations`);
      const data = await response.json();
      if (data.success) {
        setLocations(data.data);
        if (data.data.length === 0) {
          setError({
            title: 'No locations available',
            message: 'This vendor has no active locations. KDS may be disabled.',
            primaryLabel: 'Back',
            onPrimary: () => handleBack()
          });
        }
      } else {
        if (response.status === 404) {
          setError({
            title: 'Vendor not found',
            message: 'We could not find that vendor. Please select another.',
            primaryLabel: 'Back',
            onPrimary: () => handleBack()
          });
        } else {
          setError({
            title: 'Unable to load locations',
            message: data.error || 'Please try again.',
            primaryLabel: 'Try again',
            onPrimary: () => fetchLocations(),
            secondaryLabel: 'Back',
            onSecondary: () => handleBack()
          });
        }
      }
    } catch (err) {
      setError({
        title: 'Unable to load locations',
        message: 'Please check your connection and try again.',
        primaryLabel: 'Try again',
        onPrimary: () => fetchLocations(),
        secondaryLabel: 'Back',
        onSecondary: () => handleBack()
      });
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedVendor, handleBack]);

  useEffect(() => {
    if (selectedVendor && step === 'location') {
      fetchLocations();
    }
  }, [selectedVendor, step, fetchLocations]);

  const handleVendorSelect = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setStep('location');
    setError(null);
  };

  const handleLocationSelect = (location: Location) => {
    setSelectedLocation(location);
    setStep('pin');
    setError(null);
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVendor || !selectedLocation || pin.length !== 4) {
      setError({
        title: 'PIN required',
        message: 'Enter the 4-digit location PIN to continue.',
        primaryLabel: 'Ok',
        onPrimary: () => setError(null)
      });
      return;
    }

    setAuthenticating(true);
    setError(null);

    try {
      const response = await fetch('/api/kds/auth/pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          vendorSlug: selectedVendor.slug,
          locationId: selectedLocation.id,
          pin
        })
      });

      const data = await response.json();

      if (!data.success) {
        if (response.status === 401 || /invalid pin/i.test(data.error || '')) {
          setError({
            title: 'Invalid PIN',
            message: 'That PIN is incorrect. Please try again.',
            primaryLabel: 'Try again',
            onPrimary: () => setError(null),
            secondaryLabel: 'Back',
            onSecondary: () => handleBack()
          });
          setAuthenticating(false);
          return;
        }
        if (response.status === 403 || /unauthorized/i.test(data.error || '')) {
          setError({
            title: 'Unauthorized',
            message: data.error || 'You are not authorized to access this KDS.',
            primaryLabel: 'Back',
            onPrimary: () => handleBack()
          });
          setAuthenticating(false);
          return;
        }
        setError({
          title: 'Authentication failed',
          message: data.error || 'Unable to sign in. Please try again.',
          primaryLabel: 'Try again',
          onPrimary: () => setError(null),
          secondaryLabel: 'Back',
          onSecondary: () => handleBack()
        });
        setAuthenticating(false);
        return;
      }

      // Store session in localStorage (for client-side checks)
      localStorage.setItem('kds_session', JSON.stringify(data.data));

      // Set session cookie (for server-side getServerSideProps)
      // Cookie expires when session expires (24 hours)
      // Base64 encode the session data to avoid cookie parsing issues
      const expiresAt = new Date(data.data.expiresAt);
      const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
      const sessionDataBase64 = btoa(JSON.stringify(data.data));
      document.cookie = `kds_session=${sessionDataBase64}; path=/; max-age=${maxAge}; SameSite=Lax`;

      // Redirect to vendor page
      addRecentVendor({ slug: selectedVendor.slug, name: selectedVendor.displayName });
      refreshRecents();
      router.push(`/vendors/${selectedVendor.slug}?locationId=${selectedLocation.id}`);
    } catch (err) {
      setError({
        title: 'Authentication failed',
        message: 'Please check your connection and try again.',
        primaryLabel: 'Try again',
        onPrimary: () => setError(null),
        secondaryLabel: 'Back',
        onSecondary: () => handleBack()
      });
      setAuthenticating(false);
      console.error(err);
    }
  };

  const filteredVendors = vendors.filter(v =>
    v.displayName.toLowerCase().includes(vendorSearch.toLowerCase()) ||
    v.slug.toLowerCase().includes(vendorSearch.toLowerCase())
  );

  return (
    <>
      <Head>
        <title>KDS Login - CountrTop</title>
      </Head>
      <main className="page">
        <div className="container">
          <h1 className="title">CountrTop KDS</h1>
          <p className="subtitle">Kitchen Display System</p>

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

          {step === 'vendor' && (
            <div className="step">
              <h2>Select Vendor</h2>
              {recentVendors.length > 0 && (
                <div className="recents">
                  <div className="recents-header">
                    <span>Recent vendors</span>
                    <button type="button" onClick={() => { clearRecentVendors(); refreshRecents(); }} className="link-button">
                      Clear recents
                    </button>
                  </div>
                  <div className="recents-list">
                    {recentVendors.map((vendor) => (
                      <button
                        key={vendor.slug}
                        type="button"
                        className="recent-item"
                        onClick={() => {
                          const match = vendors.find(v => v.slug === vendor.slug);
                          if (match) {
                            handleVendorSelect(match);
                          } else {
                            setVendorSearch(vendor.slug);
                          }
                        }}
                      >
                        <span className="recent-name">{vendor.name ?? vendor.slug}</span>
                        <span className="recent-slug">/{vendor.slug}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <input
                type="text"
                placeholder="Search vendors..."
                value={vendorSearch}
                onChange={(e) => setVendorSearch(e.target.value)}
                className="input"
                autoFocus
              />
              {vendorsLoading ? (
                <p className="loading">Loading vendors...</p>
              ) : (
                <div className="list">
                  {filteredVendors.map((vendor) => (
                    <button
                      key={vendor.slug}
                      type="button"
                      onClick={() => handleVendorSelect(vendor)}
                      className="list-item"
                    >
                      {vendor.displayName}
                    </button>
                  ))}
                  {filteredVendors.length === 0 && vendors.length > 0 && (
                    <p className="empty">No vendors found</p>
                  )}
                  {vendors.length === 0 && !vendorsLoading && (
                    <p className="empty">No vendors available</p>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 'location' && (
            <div className="step">
              <button type="button" onClick={handleBack} className="back-button">
                ← Back
              </button>
              <h2>Select Location</h2>
              <p className="step-description">{selectedVendor?.displayName}</p>
              {loading ? (
                <p className="loading">Loading locations...</p>
              ) : (
                <div className="list">
                  {locations.map((location) => (
                    <button
                      key={location.id}
                      type="button"
                      onClick={() => handleLocationSelect(location)}
                      className="list-item location-item"
                    >
                      <div className="location-name">
                        {location.name}
                        {location.isPrimary && <span className="primary-badge">Primary</span>}
                      </div>
                      {location.address && (
                        <div className="location-address">{location.address}</div>
                      )}
                    </button>
                  ))}
                  {locations.length === 0 && !loading && (
                    <p className="empty">No locations available</p>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 'pin' && (
            <div className="step">
              <button type="button" onClick={handleBack} className="back-button">
                ← Back
              </button>
              <h2>Enter PIN</h2>
              <p className="step-description">
                Location: {selectedLocation?.name}
              </p>
              <form onSubmit={handlePinSubmit} className="pin-form">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    setPin(value);
                  }}
                  className="pin-input"
                  autoFocus
                  disabled={authenticating}
                  placeholder="0000"
                />
                <button
                  type="submit"
                  className="button"
                  disabled={pin.length !== 4 || authenticating}
                >
                  {authenticating ? 'Authenticating...' : 'Continue'}
                </button>
              </form>
            </div>
          )}
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
          }

          .title {
            font-size: 36px;
            font-weight: 700;
            margin: 0 0 8px;
            text-align: center;
            background: var(--ct-gradient-primary);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .subtitle {
            font-size: 16px;
            color: var(--color-text-muted);
            margin: 0 0 32px;
            text-align: center;
          }

          .error-panel {
            border: 1px solid rgba(239, 68, 68, 0.4);
            background: rgba(239, 68, 68, 0.08);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 24px;
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
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-bottom: 12px;
          }

          .recents-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            color: var(--color-text-muted);
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

          .step {
            display: flex;
            flex-direction: column;
            gap: 20px;
          }

          .step h2 {
            font-size: 24px;
            font-weight: 600;
            margin: 0;
            color: var(--color-text);
          }

          .step-description {
            color: var(--color-text-muted);
            font-size: 14px;
            margin: -12px 0 0 0;
          }

          .back-button {
            background: transparent;
            border: 1px solid var(--color-border);
            color: var(--color-accent);
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            align-self: flex-start;
            transition: border-color 0.2s;
          }

          .back-button:hover {
            border-color: var(--color-primary);
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

          .list {
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-height: 400px;
            overflow-y: auto;
          }

          .list-item {
            padding: 16px;
            border-radius: 12px;
            border: 1px solid var(--color-border);
            background: var(--ct-bg-surface);
            color: var(--color-text);
            font-size: 16px;
            font-family: inherit;
            cursor: pointer;
            transition: all 0.2s;
            text-align: left;
          }

          .list-item:hover {
            background: var(--color-bg-warm);
            border-color: var(--color-primary);
            transform: translateY(-2px);
          }

          .location-item {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .location-name {
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .primary-badge {
            font-size: 10px;
            text-transform: uppercase;
            background: rgba(232, 93, 4, 0.12);
            color: var(--color-primary);
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: 600;
          }

          .location-address {
            font-size: 13px;
            color: var(--color-text-muted);
          }

          .empty {
            text-align: center;
            color: var(--color-text-muted);
            padding: 24px;
          }

          .loading {
            text-align: center;
            color: var(--color-text-muted);
            padding: 24px;
          }

          .pin-form {
            display: flex;
            flex-direction: column;
            gap: 20px;
          }

          .pin-input {
            padding: 20px;
            border-radius: 12px;
            border: 1px solid var(--color-border);
            background: var(--ct-bg-surface);
            color: var(--color-text);
            font-size: 32px;
            font-family: 'SF Mono', monospace;
            text-align: center;
            letter-spacing: 8px;
            font-weight: 600;
            transition: border-color 0.2s;
          }

          .pin-input:focus {
            outline: none;
            border-color: var(--color-primary);
          }

          .pin-input:disabled {
            opacity: 0.6;
            cursor: not-allowed;
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

          .button:hover:not(:disabled) {
            opacity: 0.9;
          }

          .button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
        `}</style>
      </main>
    </>
  );
}
