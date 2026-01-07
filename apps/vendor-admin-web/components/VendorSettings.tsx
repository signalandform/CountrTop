import { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { Vendor } from '@countrtop/models';

type Props = {
  vendor: Vendor;
  vendorSlug: string;
};

export function VendorSettings({ vendor, vendorSlug }: Props) {
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form state
  const [addressLine1, setAddressLine1] = useState(vendor.addressLine1 || '');
  const [addressLine2, setAddressLine2] = useState(vendor.addressLine2 || '');
  const [city, setCity] = useState(vendor.city || '');
  const [state, setState] = useState(vendor.state || '');
  const [postalCode, setPostalCode] = useState(vendor.postalCode || '');
  const [phone, setPhone] = useState(vendor.phone || '');
  const [pickupInstructions, setPickupInstructions] = useState(vendor.pickupInstructions || '');
  const [kdsActiveLimitTotal, setKdsActiveLimitTotal] = useState(vendor.kdsActiveLimitTotal?.toString() || '10');
  const [kdsActiveLimitCt, setKdsActiveLimitCt] = useState(vendor.kdsActiveLimitCt?.toString() || '10');

  // Theming state
  const [logoUrl, setLogoUrl] = useState(vendor.logoUrl || '');
  const [primaryColor, setPrimaryColor] = useState(vendor.primaryColor || '#667eea');
  const [accentColor, setAccentColor] = useState(vendor.accentColor || '#764ba2');
  const [fontFamily, setFontFamily] = useState(vendor.fontFamily || 'SF Pro Display');

  // Google Font URL for preview (memoized to avoid re-renders)
  const googleFontUrl = useMemo(() => {
    if (!fontFamily || fontFamily === 'SF Pro Display' || fontFamily === 'system-ui') {
      return null;
    }
    return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@400;500;600;700&display=swap`;
  }, [fontFamily]);

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
          addressLine1: addressLine1 || null,
          addressLine2: addressLine2 || null,
          city: city || null,
          state: state || null,
          postalCode: postalCode || null,
          phone: phone || null,
          pickupInstructions: pickupInstructions || null,
          kdsActiveLimitTotal: kdsActiveLimitTotal ? parseInt(kdsActiveLimitTotal, 10) : null,
          kdsActiveLimitCt: kdsActiveLimitCt ? parseInt(kdsActiveLimitCt, 10) : null,
          logoUrl: logoUrl || null,
          primaryColor: primaryColor || null,
          accentColor: accentColor || null,
          fontFamily: fontFamily || null
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
      {googleFontUrl && (
        <Head>
          <link href={googleFontUrl} rel="stylesheet" />
        </Head>
      )}

      <header className="page-header">
        <a href={`/vendors/${vendorSlug}`} className="back-link">← Back to Dashboard</a>
        <h1>Settings</h1>
        <p className="page-subtitle">{vendor.displayName}</p>
      </header>

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

              <div className="form-group">
                <label htmlFor="primaryColor">Primary Color</label>
                <div className="color-input-row">
                  <input
                    id="primaryColor"
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="color-picker"
                    disabled={saving}
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                        setPrimaryColor(val);
                      }
                    }}
                    className="form-input color-text"
                    disabled={saving}
                    placeholder="#667eea"
                  />
                </div>
                <small className="form-hint">Main brand color for buttons</small>
              </div>

              <div className="form-group">
                <label htmlFor="accentColor">Accent Color</label>
                <div className="color-input-row">
                  <input
                    id="accentColor"
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="color-picker"
                    disabled={saving}
                  />
                  <input
                    type="text"
                    value={accentColor}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                        setAccentColor(val);
                      }
                    }}
                    className="form-input color-text"
                    disabled={saving}
                    placeholder="#764ba2"
                  />
                </div>
                <small className="form-hint">Secondary color for gradients</small>
              </div>

              <div className="form-group">
                <label htmlFor="fontFamily">Font Family</label>
                <select
                  id="fontFamily"
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="form-input"
                  disabled={saving}
                >
                  <option value="SF Pro Display">SF Pro Display (Default)</option>
                  <option value="Inter">Inter</option>
                  <option value="Poppins">Poppins</option>
                  <option value="Roboto">Roboto</option>
                  <option value="Open Sans">Open Sans</option>
                  <option value="Montserrat">Montserrat</option>
                  <option value="Lato">Lato</option>
                  <option value="Playfair Display">Playfair Display</option>
                </select>
                <small className="form-hint">Font for customer-facing text</small>
              </div>
            </div>

            {/* Theme Preview */}
            <div className="preview-container">
              <div className="preview-label">Live Preview</div>
              <div 
                className="preview-box"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)`,
                  fontFamily: `'${fontFamily}', -apple-system, BlinkMacSystemFont, sans-serif`
                }}
              >
                {logoUrl && <img src={logoUrl} alt="" className="preview-logo" />}
                <div className="preview-title">{vendor.displayName}</div>
                <div className="preview-subtitle">Order fast, earn points</div>
                <button 
                  type="button"
                  className="preview-button"
                  style={{ 
                    background: primaryColor,
                    fontFamily: `'${fontFamily}', -apple-system, BlinkMacSystemFont, sans-serif`
                  }}
                >
                  Start Order
                </button>
              </div>
            </div>
          </div>

          {/* Location Section */}
          <div className="form-section">
            <h2>📍 Location</h2>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="addressLine1">Address Line 1</label>
                <input
                  id="addressLine1"
                  type="text"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  className="form-input"
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label htmlFor="addressLine2">Address Line 2</label>
                <input
                  id="addressLine2"
                  type="text"
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  className="form-input"
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label htmlFor="city">City</label>
                <input
                  id="city"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="form-input"
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label htmlFor="state">State</label>
                <input
                  id="state"
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="form-input"
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label htmlFor="postalCode">Postal Code</label>
                <input
                  id="postalCode"
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className="form-input"
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label htmlFor="phone">Phone</label>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="form-input"
                  disabled={saving}
                />
              </div>

              <div className="form-group full-width">
                <label htmlFor="pickupInstructions">Pickup Instructions</label>
                <textarea
                  id="pickupInstructions"
                  value={pickupInstructions}
                  onChange={(e) => setPickupInstructions(e.target.value)}
                  className="form-input"
                  rows={3}
                  disabled={saving}
                  placeholder="Enter pickup instructions for customers..."
                />
              </div>
            </div>
          </div>

          {/* KDS Settings Section */}
          <div className="form-section">
            <h2>🖥️ KDS Queue Settings</h2>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="kdsActiveLimitTotal">Max Active Tickets (Total)</label>
                <input
                  id="kdsActiveLimitTotal"
                  type="number"
                  min="1"
                  max="50"
                  value={kdsActiveLimitTotal}
                  onChange={(e) => setKdsActiveLimitTotal(e.target.value)}
                  className="form-input"
                  disabled={saving}
                />
                <small className="form-hint">Maximum tickets in queue from all sources</small>
              </div>

              <div className="form-group">
                <label htmlFor="kdsActiveLimitCt">Max CountrTop Orders</label>
                <input
                  id="kdsActiveLimitCt"
                  type="number"
                  min="1"
                  max="50"
                  value={kdsActiveLimitCt}
                  onChange={(e) => setKdsActiveLimitCt(e.target.value)}
                  className="form-input"
                  disabled={saving}
                />
                <small className="form-hint">Maximum CountrTop orders in queue</small>
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
          background: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%);
          color: #e8e8e8;
          font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        .page-header {
          padding: 32px 48px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .back-link {
          display: inline-block;
          margin-bottom: 16px;
          color: #a78bfa;
          text-decoration: none;
          font-size: 14px;
          transition: color 0.2s;
        }

        .back-link:hover {
          color: #c4b5fd;
        }

        .page-header h1 {
          font-size: 32px;
          font-weight: 700;
          margin: 0 0 4px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .page-subtitle {
          font-size: 14px;
          color: #888;
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
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 32px;
        }

        .form-section.highlight {
          background: rgba(102, 126, 234, 0.05);
          border-color: rgba(102, 126, 234, 0.2);
        }

        .form-section h2 {
          font-size: 20px;
          font-weight: 600;
          margin: 0 0 8px;
          color: #e8e8e8;
        }

        .section-description {
          font-size: 14px;
          color: #888;
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
          color: #e8e8e8;
        }

        .form-input {
          padding: 12px 16px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.05);
          color: #e8e8e8;
          font-size: 14px;
          font-family: inherit;
          transition: border-color 0.2s;
          box-sizing: border-box;
        }

        .form-input:focus {
          outline: none;
          border-color: #667eea;
        }

        .form-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .form-input::placeholder {
          color: #666;
        }

        textarea.form-input {
          resize: vertical;
          min-height: 80px;
        }

        .form-hint {
          font-size: 12px;
          color: #666;
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
          border: 2px solid rgba(255, 255, 255, 0.2);
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
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .preview-label {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #888;
          margin-bottom: 16px;
        }

        .preview-box {
          padding: 32px;
          border-radius: 16px;
          text-align: center;
          color: white;
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
          opacity: 0.9;
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
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.03);
          cursor: pointer;
          transition: all 0.2s;
        }

        .flag-card:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.2);
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
          color: #e8e8e8;
        }

        .flag-description {
          display: block;
          font-size: 12px;
          color: #888;
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
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.03);
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
          color: #e8e8e8;
        }

        .pin-badge {
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
        }

        .pin-badge.set {
          background: rgba(74, 222, 128, 0.2);
          color: #4ade80;
        }

        .pin-badge.unset {
          background: rgba(255, 255, 255, 0.1);
          color: #888;
        }

        .location-id {
          font-size: 12px;
          font-family: monospace;
          color: #666;
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
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.05);
          color: #e8e8e8;
          font-size: 18px;
          font-family: monospace;
          text-align: center;
          letter-spacing: 8px;
        }

        .pin-input:focus {
          outline: none;
          border-color: #667eea;
        }

        .pin-input.error {
          border-color: #f87171;
        }

        .btn-pin {
          padding: 12px 20px;
          border-radius: 8px;
          border: none;
          background: #667eea;
          color: white;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.2s;
          font-family: inherit;
        }

        .btn-pin:hover:not(:disabled) {
          background: #5568d3;
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
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .btn-cancel {
          padding: 14px 28px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.05);
          color: #e8e8e8;
          text-decoration: none;
          font-weight: 600;
          font-size: 14px;
          transition: background 0.2s;
          display: inline-block;
        }

        .btn-cancel:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .btn-submit {
          padding: 14px 32px;
          border-radius: 10px;
          border: none;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
          box-shadow: 0 8px 24px rgba(102, 126, 234, 0.3);
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
          color: #888;
          font-size: 14px;
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
        }
      `}</style>
    </main>
  );
}
