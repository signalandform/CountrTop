import { useState, useEffect } from 'react';
import { Vendor } from '@countrtop/models';

type Props = {
  vendor: Vendor;
  vendorSlug: string;
};

export function VendorSettings({ vendor, vendorSlug }: Props) {
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Theming state
  const [logoUrl, setLogoUrl] = useState(vendor.logoUrl || '');
  const [reviewUrl, setReviewUrl] = useState(vendor.reviewUrl || '');

  // Feature flags state
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});
  const [flagsLoading, setFlagsLoading] = useState(true);
  const [flagsSaving, setFlagsSaving] = useState(false);

  // Location PINs state
  const [locations, setLocations] = useState<Array<{ locationId: string; locationName: string; hasPin: boolean }>>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [pinInputs, setPinInputs] = useState<Record<string, string>>({});
  const [pinSaving, setPinSaving] = useState<Record<string, boolean>>({});
  const [pinErrors, setPinErrors] = useState<Record<string, string>>({});

  // KDS Pairing tokens state
  const [pairingTokens, setPairingTokens] = useState<Array<{
    id: string;
    locationId?: string | null;
    expiresAt: string;
    createdAt: string;
  }>>([]);
  const [pairingLoading, setPairingLoading] = useState(true);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pairingLocationId, setPairingLocationId] = useState('');
  const [pairingCreating, setPairingCreating] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<{
    token: string;
    expiresAt: string;
    locationId?: string | null;
  } | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Fetch feature flags on mount
  useEffect(() => {
    const fetchFlags = async () => {
      try {
        const response = await fetch(`/api/vendors/${vendorSlug}/feature-flags`);
        const data = await response.json();
        if (data.success) {
          setFeatureFlags(data.data);
        }
      } catch (err) {
        console.error('Failed to fetch feature flags:', err);
      } finally {
        setFlagsLoading(false);
      }
    };
    fetchFlags();
  }, [vendorSlug]);

  // Fetch locations and PIN status on mount
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const response = await fetch(`/api/vendors/${vendorSlug}/location-pins`);
        const data = await response.json();
        if (data.success) {
          setLocations(data.data);
        }
      } catch (err) {
        console.error('Failed to fetch locations:', err);
      } finally {
        setLocationsLoading(false);
      }
    };
    fetchLocations();
  }, [vendorSlug]);

  useEffect(() => {
    const fetchPairingTokens = async () => {
      setPairingLoading(true);
      setPairingError(null);
      try {
        const response = await fetch(`/api/vendors/${vendorSlug}/pairing-tokens`);
        const data = await response.json();
        if (data.success) {
          setPairingTokens(data.data);
        } else {
          setPairingError(data.error || 'Failed to load pairing tokens');
        }
      } catch (err) {
        console.error('Failed to fetch pairing tokens:', err);
        setPairingError('Failed to load pairing tokens');
      } finally {
        setPairingLoading(false);
      }
    };
    fetchPairingTokens();
  }, [vendorSlug]);

  const handleFeatureFlagChange = async (featureKey: string, enabled: boolean) => {
    setFlagsSaving(true);
    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/feature-flags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ featureKey, enabled })
      });

      const data = await response.json();
      if (data.success) {
        setFeatureFlags(prev => ({ ...prev, [featureKey]: enabled }));
      } else {
        throw new Error(data.error || 'Failed to update feature flag');
      }
    } catch (err) {
      console.error('Failed to update feature flag:', err);
      alert('Failed to update feature flag. Please try again.');
    } finally {
      setFlagsSaving(false);
    }
  };

  const handleSetPin = async (locationId: string) => {
    const pin = pinInputs[locationId]?.trim();
    if (!pin) {
      setPinErrors(prev => ({ ...prev, [locationId]: 'PIN is required' }));
      return;
    }

    if (!/^\d{4}$/.test(pin)) {
      setPinErrors(prev => ({ ...prev, [locationId]: 'PIN must be exactly 4 digits' }));
      return;
    }

    setPinSaving(prev => ({ ...prev, [locationId]: true }));
    setPinErrors(prev => ({ ...prev, [locationId]: '' }));

    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/location-pins`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ locationId, pin })
      });

      const data = await response.json();
      if (data.success) {
        setLocations(prev =>
          prev.map(loc => loc.locationId === locationId ? { ...loc, hasPin: true } : loc)
        );
        setPinInputs(prev => {
          const next = { ...prev };
          delete next[locationId];
          return next;
        });
      } else {
        throw new Error(data.error || 'Failed to set PIN');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to set PIN';
      setPinErrors(prev => ({ ...prev, [locationId]: errorMessage }));
    } finally {
      setPinSaving(prev => ({ ...prev, [locationId]: false }));
    }
  };

  const handleCreatePairingToken = async () => {
    setPairingCreating(true);
    setPairingError(null);
    setCopySuccess(false);
    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/pairing-tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          locationId: pairingLocationId || null
        })
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to create pairing token');
      }
      setGeneratedToken({
        token: data.data.token,
        expiresAt: data.data.expiresAt,
        locationId: data.data.locationId ?? null
      });
      setPairingTokens((prev) => [
        {
          id: data.data.tokenId,
          locationId: data.data.locationId ?? null,
          expiresAt: data.data.expiresAt,
          createdAt: data.data.createdAt
        },
        ...prev
      ]);
    } catch (err) {
      console.error('Failed to create pairing token:', err);
      setPairingError(err instanceof Error ? err.message : 'Failed to create pairing token');
    } finally {
      setPairingCreating(false);
    }
  };

  const handleRevokePairingToken = async (tokenId: string) => {
    setPairingError(null);
    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/pairing-tokens?tokenId=${encodeURIComponent(tokenId)}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to revoke token');
      }
      setPairingTokens((prev) => prev.filter((token) => token.id !== tokenId));
    } catch (err) {
      console.error('Failed to revoke pairing token:', err);
      setPairingError(err instanceof Error ? err.message : 'Failed to revoke pairing token');
    }
  };

  const handleCopyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy pairing link:', err);
    }
  };

  const pairingUrl = generatedToken
    ? `https://kds.countrtop.com/pair?token=${generatedToken.token}`
    : '';
  const generatedLocationName = generatedToken?.locationId
    ? locations.find((loc) => loc.locationId === generatedToken.locationId)?.locationName
    : null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveStatus('idle');
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          logoUrl: logoUrl || null,
          reviewUrl: reviewUrl.trim() || null
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to save settings');
      }

      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      setSaveStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page">
      <div className="page-content">
        <form onSubmit={handleSave} className="vendor-form">
          {/* Branding Section */}
          <div className="form-section highlight">
            <h2>🎨 Branding & Theme</h2>
            <p className="section-description">Customize the appearance of your customer-facing pages</p>

            <div className="form-grid">
              <div className="form-group full-width">
                <label htmlFor="logoUrl">Logo URL</label>
                <input
                  id="logoUrl"
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  className="form-input"
                  disabled={saving}
                  placeholder="https://example.com/logo.png"
                />
                <small className="form-hint">Square image recommended (200×200px or larger)</small>
              </div>
            </div>
          </div>

          {/* Customer Review Link */}
          <div className="form-section">
            <h2>Review Link</h2>
            <p className="section-description">Shown to customers after order completion (e.g. Google, Yelp)</p>
            <div className="form-grid">
              <div className="form-group full-width">
                <label htmlFor="reviewUrl">Review Link</label>
                <input
                  id="reviewUrl"
                  type="url"
                  value={reviewUrl}
                  onChange={(e) => setReviewUrl(e.target.value)}
                  className="form-input"
                  disabled={saving}
                  placeholder="https://g.page/your-business/review"
                />
                <small className="form-hint">Shown to customers after order completion (e.g. Google, Yelp)</small>
              </div>
            </div>
          </div>

          {/* Feature Flags Section */}
          <div className="form-section">
            <h2>⚡ Feature Flags</h2>
            <p className="section-description">Enable or disable features for this vendor</p>

            {flagsLoading ? (
              <p className="muted">Loading feature flags...</p>
            ) : (
              <div className="flags-grid">
                <label className="flag-card">
                  <input
                    type="checkbox"
                    checked={featureFlags['analytics_enabled'] ?? false}
                    onChange={(e) => handleFeatureFlagChange('analytics_enabled', e.target.checked)}
                    disabled={flagsSaving}
                  />
                  <div className="flag-content">
                    <span className="flag-icon">📊</span>
                    <div>
                      <span className="flag-name">Analytics Dashboard</span>
                      <span className="flag-description">Enable analytics access</span>
                    </div>
                  </div>
                </label>

                <label className="flag-card">
                  <input
                    type="checkbox"
                    checked={featureFlags['kds_realtime_enabled'] ?? false}
                    onChange={(e) => handleFeatureFlagChange('kds_realtime_enabled', e.target.checked)}
                    disabled={flagsSaving}
                  />
                  <div className="flag-content">
                    <span className="flag-icon">⚡</span>
                    <div>
                      <span className="flag-name">KDS Realtime Updates</span>
                      <span className="flag-description">Live queue updates</span>
                    </div>
                  </div>
                </label>

                <label className="flag-card">
                  <input
                    type="checkbox"
                    checked={featureFlags['kds_pin_auth_enabled'] ?? false}
                    onChange={(e) => handleFeatureFlagChange('kds_pin_auth_enabled', e.target.checked)}
                    disabled={flagsSaving}
                  />
                  <div className="flag-content">
                    <span className="flag-icon">🔐</span>
                    <div>
                      <span className="flag-name">KDS PIN Authentication</span>
                      <span className="flag-description">PIN-based KDS login</span>
                    </div>
                  </div>
                </label>

                <label className="flag-card">
                  <input
                    type="checkbox"
                    checked={featureFlags['customer_loyalty_enabled'] ?? false}
                    onChange={(e) => handleFeatureFlagChange('customer_loyalty_enabled', e.target.checked)}
                    disabled={flagsSaving}
                  />
                  <div className="flag-content">
                    <span className="flag-icon">⭐</span>
                    <div>
                      <span className="flag-name">Loyalty Program</span>
                      <span className="flag-description">Customer points system</span>
                    </div>
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* KDS Location PINs Section */}
          <div className="form-section">
            <h2>🔑 KDS Location PINs</h2>
            <p className="section-description">Set 4-digit PINs for each location to enable KDS access</p>

            {locationsLoading ? (
              <p className="muted">Loading locations...</p>
            ) : locations.length === 0 ? (
              <p className="muted">No locations found. Make sure POS access token is configured.</p>
            ) : (
              <div className="locations-grid">
                {locations.map(location => (
                  <div key={location.locationId} className="location-card">
                    <div className="location-header">
                      <div className="location-name">{location.locationName}</div>
                      <span className={`pin-badge ${location.hasPin ? 'set' : 'unset'}`}>
                        {location.hasPin ? '✓ PIN Set' : 'No PIN'}
                      </span>
                    </div>
                    <div className="location-id">{location.locationId}</div>
                    <div className="pin-row">
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]{4}"
                        maxLength={4}
                        value={pinInputs[location.locationId] || ''}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                          setPinInputs(prev => ({ ...prev, [location.locationId]: value }));
                          setPinErrors(prev => ({ ...prev, [location.locationId]: '' }));
                        }}
                        placeholder={location.hasPin ? '••••' : '0000'}
                        className={`pin-input ${pinErrors[location.locationId] ? 'error' : ''}`}
                        disabled={pinSaving[location.locationId]}
                      />
                      <button
                        type="button"
                        onClick={() => handleSetPin(location.locationId)}
                        className="btn-pin"
                        disabled={pinSaving[location.locationId] || !pinInputs[location.locationId]}
                      >
                        {pinSaving[location.locationId] ? '...' : location.hasPin ? 'Update' : 'Set'}
                      </button>
                    </div>
                    {pinErrors[location.locationId] && (
                      <div className="pin-error">{pinErrors[location.locationId]}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* KDS Device Pairing */}
          <div className="form-section">
            <h2>📱 KDS Device Pairing</h2>
            <p className="section-description">Generate a QR code to pair a KDS device in seconds</p>

            {pairingError && <div className="error-banner">{pairingError}</div>}

            <div className="pairing-controls">
              <div className="pairing-field">
                <label>Location (optional)</label>
                <select
                  value={pairingLocationId}
                  onChange={(e) => setPairingLocationId(e.target.value)}
                  className="input"
                >
                  <option value="">Any location</option>
                  {locations.map((location) => (
                    <option key={location.locationId} value={location.locationId}>
                      {location.locationName}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={handleCreatePairingToken} className="btn-submit" disabled={pairingCreating}>
                {pairingCreating ? 'Generating…' : 'Generate QR'}
              </button>
            </div>

            {generatedToken && (
              <div className="pairing-card">
                <div className="pairing-qr">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(pairingUrl)}`}
                    alt="KDS pairing QR code"
                  />
                </div>
                <div className="pairing-info">
                  <div className="pairing-label">Pairing link</div>
                  <div className="pairing-link">{pairingUrl}</div>
                  <div className="pairing-meta">
                    {generatedLocationName ? `Location: ${generatedLocationName}` : 'Location: Any'}
                  </div>
                  <div className="pairing-meta">
                    Expires {new Date(generatedToken.expiresAt).toLocaleString()}
                  </div>
                  <button type="button" className="btn-secondary" onClick={() => handleCopyLink(pairingUrl)}>
                    {copySuccess ? 'Copied!' : 'Copy link'}
                  </button>
                </div>
              </div>
            )}

            <div className="pairing-list">
              <div className="pairing-list-header">Active tokens</div>
              {pairingLoading ? (
                <p className="muted">Loading tokens...</p>
              ) : pairingTokens.length === 0 ? (
                <p className="muted">No active pairing tokens.</p>
              ) : (
                pairingTokens.map((token) => (
                  <div key={token.id} className="pairing-list-item">
                    <div>
                      <div className="pairing-meta">
                        {token.locationId
                          ? `Location: ${locations.find((loc) => loc.locationId === token.locationId)?.locationName ?? token.locationId}`
                          : 'Location: Any'}
                      </div>
                      <div className="pairing-meta">
                        Expires {new Date(token.expiresAt).toLocaleString()}
                      </div>
                    </div>
                    <button type="button" className="btn-secondary" onClick={() => handleRevokePairingToken(token.id)}>
                      Revoke
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Error Banner */}
          {saveStatus === 'error' && (
            <div className="error-banner">
              <p>{errorMessage || 'Error saving settings'}</p>
            </div>
          )}

          {/* Form Actions */}
          <div className="form-actions">
            <a href={`/vendors/${vendorSlug}`} className="btn-cancel">
              Cancel
            </a>
            <button type="submit" className="btn-submit" disabled={saving}>
              {saving ? (
                <>
                  <span className="spinner"></span>
                  Saving...
                </>
              ) : saveStatus === 'success' ? (
                '✓ Saved!'
              ) : (
                'Save All Settings'
              )}
            </button>
          </div>
        </form>
      </div>

      <style jsx global>{`
        .page {
          min-height: 100vh;
          background: var(--ct-bg-primary);
          color: var(--ct-text);
          font-family: var(--ct-font-body);
        }

        .page-header {
          padding: 32px 48px;
          border-bottom: 1px solid var(--color-border);
        }

        .back-link {
          display: inline-block;
          margin-bottom: 16px;
          color: var(--color-accent);
          text-decoration: none;
          font-size: 14px;
          transition: color 0.2s;
        }

        .back-link:hover {
          color: var(--color-primary);
        }

        .page-header h1 {
          font-size: 32px;
          font-weight: 700;
          margin: 0 0 4px;
          background: var(--ct-gradient-primary);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .page-subtitle {
          font-size: 14px;
          color: var(--color-text-muted);
          margin: 0;
        }

        .page-content {
          max-width: 900px;
          margin: 0 auto;
          padding: 48px;
        }

        .vendor-form {
          display: flex;
          flex-direction: column;
          gap: 32px;
        }

        .form-section {
          background: var(--ct-bg-surface);
          border: 1px solid var(--color-border);
          border-radius: 16px;
          padding: 32px;
        }

        .form-section.highlight {
          background: rgba(232, 93, 4, 0.08);
          border-color: rgba(232, 93, 4, 0.25);
        }

        .form-section h2 {
          font-size: 20px;
          font-weight: 600;
          margin: 0 0 8px;
          color: var(--color-text);
        }

        .section-description {
          font-size: 14px;
          color: var(--color-text-muted);
          margin: 0 0 24px;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 24px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-group.full-width {
          grid-column: 1 / -1;
        }

        .form-group label {
          font-size: 14px;
          font-weight: 600;
          color: var(--color-text);
        }

        .form-input {
          padding: 12px 16px;
          border-radius: 8px;
          border: 1px solid var(--color-border);
          background: var(--ct-bg-surface);
          color: var(--color-text);
          font-size: 14px;
          font-family: inherit;
          transition: border-color 0.2s;
          box-sizing: border-box;
        }

        .form-input:focus {
          outline: none;
          border-color: var(--color-primary);
        }

        .form-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .form-input::placeholder {
          color: var(--color-text-muted);
        }

        textarea.form-input {
          resize: vertical;
          min-height: 80px;
        }

        .form-hint {
          font-size: 12px;
          color: var(--color-text-muted);
        }

        /* Color inputs */
        .color-input-row {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .color-picker {
          width: 48px;
          height: 48px;
          padding: 0;
          border: 2px solid var(--color-border);
          border-radius: 10px;
          cursor: pointer;
          background: transparent;
        }

        .color-picker::-webkit-color-swatch-wrapper {
          padding: 4px;
        }

        .color-picker::-webkit-color-swatch {
          border-radius: 6px;
          border: none;
        }

        .color-text {
          width: 100px;
          font-family: monospace;
          text-transform: uppercase;
        }

        /* Preview */
        .preview-container {
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid var(--color-border);
        }

        .preview-label {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: var(--color-text-muted);
          margin-bottom: 16px;
        }

        .preview-box {
          padding: 32px;
          border-radius: 16px;
          text-align: center;
          color: var(--color-text);
        }

        .preview-logo {
          width: 64px;
          height: 64px;
          border-radius: 12px;
          object-fit: cover;
          margin-bottom: 16px;
        }

        .preview-title {
          font-size: 28px;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .preview-subtitle {
          font-size: 16px;
          color: var(--color-text-muted);
          margin-bottom: 12px;
        }

        .preview-accent-text {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 20px;
        }

        .preview-button {
          padding: 12px 28px;
          border-radius: 10px;
          border: none;
          color: white;
          font-weight: 600;
          font-size: 15px;
          cursor: default;
        }

        /* Feature Flags */
        .flags-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 16px;
        }

        .flag-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          border-radius: 12px;
          border: 1px solid var(--color-border);
          background: var(--ct-bg-surface);
          cursor: pointer;
          transition: all 0.2s;
        }

        .flag-card:hover {
          background: var(--color-bg-warm);
          border-color: rgba(232, 93, 4, 0.2);
        }

        .flag-card input[type="checkbox"] {
          width: 20px;
          height: 20px;
          cursor: pointer;
          flex-shrink: 0;
        }

        .flag-content {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .flag-icon {
          font-size: 24px;
        }

        .flag-name {
          display: block;
          font-size: 14px;
          font-weight: 600;
          color: var(--color-text);
        }

        .flag-description {
          display: block;
          font-size: 12px;
          color: var(--color-text-muted);
          margin-top: 2px;
        }

        /* Location PINs */
        .locations-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
        }

        .location-card {
          padding: 20px;
          border-radius: 12px;
          border: 1px solid var(--color-border);
          background: var(--ct-bg-surface);
        }

        .location-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .location-name {
          font-size: 16px;
          font-weight: 600;
          color: var(--color-text);
        }

        .pin-badge {
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
        }

        .pin-badge.set {
          background: rgba(16, 185, 129, 0.18);
          color: var(--color-success);
        }

        .pin-badge.unset {
          background: var(--color-bg-warm);
          color: var(--color-text-muted);
        }

        .location-id {
          font-size: 12px;
          font-family: monospace;
          color: var(--color-text-muted);
          margin-bottom: 16px;
        }

        .pin-row {
          display: flex;
          gap: 12px;
        }

        .pin-input {
          flex: 1;
          padding: 12px 16px;
          border-radius: 8px;
          border: 1px solid var(--color-border);
          background: var(--ct-bg-surface);
          color: var(--color-text);
          font-size: 18px;
          font-family: monospace;
          text-align: center;
          letter-spacing: 8px;
        }

        .pin-input:focus {
          outline: none;
          border-color: var(--color-primary);
        }

        .pin-input.error {
          border-color: #f87171;
        }

        .btn-pin {
          padding: 12px 20px;
          border-radius: 8px;
          border: none;
          background: var(--color-primary);
          color: white;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.2s;
          font-family: inherit;
        }

        .btn-pin:hover:not(:disabled) {
          background: var(--color-primary-dark);
        }

        .btn-pin:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .pin-error {
          margin-top: 8px;
          font-size: 12px;
          color: #f87171;
        }

        /* Error Banner */
        .error-banner {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 12px;
          padding: 16px;
        }

        .error-banner p {
          margin: 0;
          color: #fca5a5;
          font-size: 14px;
        }

        /* Form Actions */
        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 16px;
          padding-top: 24px;
          border-top: 1px solid var(--color-border);
        }

        .btn-cancel {
          padding: 14px 28px;
          border-radius: 10px;
          border: 1px solid var(--color-border);
          background: var(--color-bg-warm);
          color: var(--color-text);
          text-decoration: none;
          font-weight: 600;
          font-size: 14px;
          transition: background 0.2s;
          display: inline-block;
        }

        .btn-cancel:hover {
          background: rgba(232, 93, 4, 0.12);
        }

        .btn-submit {
          padding: 14px 32px;
          border-radius: 10px;
          border: none;
          background: var(--ct-gradient-primary);
          color: white;
          font-weight: 600;
          font-size: 15px;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .btn-submit:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(232, 93, 4, 0.3);
        }

        .btn-submit:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .muted {
          color: var(--color-text-muted);
          font-size: 14px;
        }

        .btn-secondary {
          padding: 10px 16px;
          border-radius: 12px;
          border: 1px solid var(--color-border);
          background: transparent;
          color: var(--color-text);
          font-weight: 600;
          cursor: pointer;
        }

        .pairing-controls {
          display: flex;
          align-items: flex-end;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }

        .pairing-field {
          flex: 1;
          min-width: 220px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .pairing-card {
          display: flex;
          gap: 20px;
          border: 1px solid var(--color-border);
          border-radius: 16px;
          padding: 16px;
          background: var(--ct-bg-surface);
          margin-bottom: 16px;
        }

        .pairing-qr img {
          width: 180px;
          height: 180px;
          border-radius: 12px;
          border: 1px solid var(--color-border);
          background: white;
        }

        .pairing-info {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .pairing-label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          color: var(--color-text-muted);
        }

        .pairing-link {
          font-size: 13px;
          word-break: break-all;
        }

        .pairing-meta {
          font-size: 13px;
          color: var(--color-text-muted);
        }

        .pairing-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .pairing-list-header {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          color: var(--color-text-muted);
        }

        .pairing-list-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border: 1px solid var(--color-border);
          border-radius: 12px;
          background: var(--ct-bg-surface);
        }

        @media (max-width: 768px) {
          .page-header {
            padding: 24px;
          }

          .page-content {
            padding: 24px;
          }

          .form-section {
            padding: 24px;
          }

          .form-grid {
            grid-template-columns: 1fr;
          }

          .form-actions {
            flex-direction: column;
          }

          .btn-cancel,
          .btn-submit {
            width: 100%;
            justify-content: center;
          }

          .flags-grid,
          .locations-grid {
            grid-template-columns: 1fr;
          }

          .pairing-card {
            flex-direction: column;
            align-items: flex-start;
          }

          .pairing-qr img {
            width: 160px;
            height: 160px;
          }
        }
      `}</style>
    </main>
  );
}
