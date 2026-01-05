import Head from 'next/head';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

type Vendor = {
  slug: string;
  displayName: string;
  squareLocationId: string;
};

type Location = {
  id: string;
  name: string;
};

type Step = 'vendor' | 'location' | 'pin';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('vendor');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  useEffect(() => {
    const fetchVendors = async () => {
      try {
        const response = await fetch('/api/kds/vendors');
        const data = await response.json();
        if (data.success) {
          setVendors(data.data);
        } else {
          setError('Failed to load vendors');
        }
      } catch (err) {
        setError('Failed to load vendors');
        console.error(err);
      }
    };
    fetchVendors();
  }, []);

  // Fetch locations when vendor selected
  useEffect(() => {
    if (selectedVendor && step === 'location') {
      const fetchLocations = async () => {
        setLoading(true);
        setError(null);
        try {
          const response = await fetch(`/api/kds/vendors/${selectedVendor.slug}/locations`);
          const data = await response.json();
          if (data.success) {
            setLocations(data.data);
          } else {
            setError(data.error || 'Failed to load locations');
          }
        } catch (err) {
          setError('Failed to load locations');
          console.error(err);
        } finally {
          setLoading(false);
        }
      };
      fetchLocations();
    }
  }, [selectedVendor, step]);

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
        setError(data.error || 'Invalid PIN');
        setAuthenticating(false);
        return;
      }

      // Store session in localStorage
      localStorage.setItem('kds_session', JSON.stringify(data.data));

      // Redirect to vendor page
      router.push(`/vendors/${selectedVendor.slug}?locationId=${selectedLocation.id}`);
    } catch (err) {
      setError('Authentication failed');
      setAuthenticating(false);
      console.error(err);
    }
  };

  const handleBack = () => {
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
            <div className="error-banner">
              {error}
            </div>
          )}

          {step === 'vendor' && (
            <div className="step">
              <h2>Select Vendor</h2>
              <input
                type="text"
                placeholder="Search vendors..."
                value={vendorSearch}
                onChange={(e) => setVendorSearch(e.target.value)}
                className="input"
                autoFocus
              />
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
                {vendors.length === 0 && !loading && (
                  <p className="empty">No vendors available</p>
                )}
              </div>
            </div>
          )}

          {step === 'location' && (
            <div className="step">
              <button type="button" onClick={handleBack} className="back-button">
                ← Back
              </button>
              <h2>Select Location</h2>
              {loading ? (
                <p className="loading">Loading locations...</p>
              ) : (
                <div className="list">
                  {locations.map((location) => (
                    <button
                      key={location.id}
                      type="button"
                      onClick={() => handleLocationSelect(location)}
                      className="list-item"
                    >
                      {location.name}
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
            background: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%);
            color: #e8e8e8;
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
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
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .subtitle {
            font-size: 16px;
            color: #888;
            margin: 0 0 32px;
            text-align: center;
          }

          .error-banner {
            background: rgba(239, 68, 68, 0.2);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #fca5a5;
            padding: 12px 16px;
            border-radius: 12px;
            margin-bottom: 24px;
            font-size: 14px;
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
            color: #e8e8e8;
          }

          .step-description {
            color: #888;
            font-size: 14px;
            margin: -12px 0 0 0;
          }

          .back-button {
            background: transparent;
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: #a78bfa;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            align-self: flex-start;
            transition: border-color 0.2s;
          }

          .back-button:hover {
            border-color: #a78bfa;
          }

          .input {
            padding: 16px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.05);
            color: #e8e8e8;
            font-size: 16px;
            font-family: inherit;
            transition: border-color 0.2s;
          }

          .input:focus {
            outline: none;
            border-color: #667eea;
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
            border: 1px solid rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.05);
            color: #e8e8e8;
            font-size: 16px;
            font-family: inherit;
            cursor: pointer;
            transition: all 0.2s;
            text-align: left;
          }

          .list-item:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: #667eea;
            transform: translateY(-2px);
          }

          .empty {
            text-align: center;
            color: #888;
            padding: 24px;
          }

          .loading {
            text-align: center;
            color: #888;
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
            border: 1px solid rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.05);
            color: #e8e8e8;
            font-size: 32px;
            font-family: 'SF Mono', monospace;
            text-align: center;
            letter-spacing: 8px;
            font-weight: 600;
            transition: border-color 0.2s;
          }

          .pin-input:focus {
            outline: none;
            border-color: #667eea;
          }

          .pin-input:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .button {
            padding: 16px 24px;
            border-radius: 12px;
            border: none;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
