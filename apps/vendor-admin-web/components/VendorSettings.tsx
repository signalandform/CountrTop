import { useState } from 'react';
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveStatus('idle');
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          addressLine1: addressLine1 || null,
          addressLine2: addressLine2 || null,
          city: city || null,
          state: state || null,
          postalCode: postalCode || null,
          phone: phone || null,
          pickupInstructions: pickupInstructions || null
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
    <section className="section">
      <div className="section-header">
        <h2>Vendor Settings</h2>
        <span className="muted">Address & pickup information</span>
      </div>

      <form onSubmit={handleSave} className="settings-form">
        <div className="form-group">
          <label htmlFor="addressLine1">Address Line 1</label>
          <input
            id="addressLine1"
            type="text"
            value={addressLine1}
            onChange={(e) => setAddressLine1(e.target.value)}
            className="input-field"
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
            className="input-field"
            disabled={saving}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="city">City</label>
            <input
              id="city"
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="input-field"
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
              className="input-field"
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
              className="input-field"
              disabled={saving}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="phone">Phone (optional)</label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="input-field"
            disabled={saving}
          />
        </div>

        <div className="form-group">
          <label htmlFor="pickupInstructions">Pickup Instructions</label>
          <textarea
            id="pickupInstructions"
            value={pickupInstructions}
            onChange={(e) => setPickupInstructions(e.target.value)}
            className="textarea-field"
            rows={4}
            disabled={saving}
            placeholder="Enter pickup instructions for customers..."
          />
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {saveStatus === 'success' && (
            <span className="save-status success">✓ Saved</span>
          )}
          {saveStatus === 'error' && (
            <span className="save-status error">{errorMessage || 'Error saving'}</span>
          )}
        </div>
      </form>

      <style jsx>{`
        .settings-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .form-row {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr;
          gap: 16px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-group label {
          font-size: 13px;
          font-weight: 600;
          color: #a78bfa;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .input-field,
        .textarea-field {
          padding: 12px 16px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.05);
          color: #e8e8e8;
          font-size: 14px;
          font-family: inherit;
          transition: border-color 0.2s;
        }

        .input-field:focus,
        .textarea-field:focus {
          outline: none;
          border-color: #667eea;
        }

        .input-field:disabled,
        .textarea-field:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .textarea-field {
          resize: vertical;
          min-height: 80px;
        }

        .form-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          padding-top: 8px;
        }

        .btn-primary {
          padding: 12px 24px;
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

        .btn-primary:hover:not(:disabled) {
          background: #5568d3;
        }

        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .save-status {
          font-size: 14;
          font-weight: 500;
        }

        .save-status.success {
          color: #4ade80;
        }

        .save-status.error {
          color: #fca5a5;
        }

        @media (max-width: 768px) {
          .form-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}

