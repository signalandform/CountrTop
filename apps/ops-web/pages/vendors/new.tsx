import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { OpsAdminLayout } from '../../components/OpsAdminLayout';

import { requireOpsAdmin } from '../../lib/auth';

type Props = {
  userEmail: string;
};

type POSProvider = 'square' | 'clover' | 'toast';

const POS_CONFIG: Record<POSProvider, {
  name: string;
  color: string;
  bgColor: string;
  locationIdLabel: string;
  locationIdPlaceholder: string;
  locationIdHint: string;
  credentialLabel: string;
  credentialPlaceholder: string;
  instructions: string[];
  docsUrl: string;
}> = {
  square: {
    name: 'Square',
    color: '#60a5fa',
    bgColor: 'rgba(0, 128, 255, 0.15)',
    locationIdLabel: 'Square Location ID',
    locationIdPlaceholder: 'e.g., LK8XKXKXKXKXK',
    locationIdHint: 'Found in Square Dashboard → Locations → Location details',
    credentialLabel: 'Square Credential Ref',
    credentialPlaceholder: 'Optional - for multi-account setups',
    instructions: [
      '1. Log in to Square Dashboard (squareup.com/dashboard)',
      '2. Go to Account & Settings → Business → Locations',
      '3. Select your location and copy the Location ID',
      '4. Ensure Online Checkout is enabled for this location',
      '5. After creation, configure webhook at /api/webhooks/square'
    ],
    docsUrl: 'https://developer.squareup.com/docs'
  },
  clover: {
    name: 'Clover',
    color: '#86efac',
    bgColor: 'rgba(34, 197, 94, 0.15)',
    locationIdLabel: 'Clover Merchant ID',
    locationIdPlaceholder: 'e.g., ABC123XYZ',
    locationIdHint: 'Found in Clover Dashboard URL: /merchants/{MERCHANT_ID}',
    credentialLabel: 'Clover Credential Ref',
    credentialPlaceholder: 'Optional - for multi-account setups',
    instructions: [
      '1. Log in to Clover Dashboard (clover.com/dashboard)',
      '2. Look at your browser URL to find the Merchant ID',
      '3. Go to Developer Portal to generate an API Token',
      '4. Provide the API token to CountrTop (contact support)',
      '5. Configure webhook in Clover Dashboard → Your App → Webhooks'
    ],
    docsUrl: 'https://docs.clover.com'
  },
  toast: {
    name: 'Toast',
    color: '#fdba74',
    bgColor: 'rgba(249, 115, 22, 0.15)',
    locationIdLabel: 'Toast Restaurant GUID',
    locationIdPlaceholder: 'e.g., a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    locationIdHint: 'Found in Toast Web Portal URL: /restaurants/{GUID}',
    credentialLabel: 'Toast Credential Ref',
    credentialPlaceholder: 'Optional - for multi-account setups',
    instructions: [
      '1. Toast requires Partner API access (apply at pos.toasttab.com/partners)',
      '2. Log in to Toast Web Portal',
      '3. Find your Restaurant GUID in the URL when viewing your restaurant',
      '4. Provide Client ID and Secret to CountrTop (contact support)',
      '5. Configure webhooks in Toast Developer Portal'
    ],
    docsUrl: 'https://pos.toasttab.com/partners'
  }
};

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const authResult = await requireOpsAdmin(context);
  if (!authResult.authorized) {
    if (authResult.redirect) {
      return { redirect: authResult.redirect };
    }
    return {
      redirect: {
        destination: '/login',
        permanent: false
      }
    };
  }

  return {
    props: {
      userEmail: authResult.userEmail
    }
  };
};

export default function NewVendorPage({ userEmail }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [formData, setFormData] = useState({
    slug: '',
    display_name: '',
    pos_provider: 'square' as POSProvider,
    square_location_id: '',
    square_credential_ref: '',
    status: 'active' as 'active' | 'inactive',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    phone: '',
    timezone: '',
    pickup_instructions: '',
    kds_active_limit_total: '',
    kds_active_limit_ct: ''
  });

  const posConfig = POS_CONFIG[formData.pos_provider];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (error) setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        slug: formData.slug.trim(),
        display_name: formData.display_name.trim(),
        pos_provider: formData.pos_provider,
        square_location_id: formData.square_location_id.trim(), // External POS location ID
        square_credential_ref: formData.square_credential_ref.trim() || null,
        status: formData.status,
        address_line1: formData.address_line1.trim() || null,
        address_line2: formData.address_line2.trim() || null,
        city: formData.city.trim() || null,
        state: formData.state.trim() || null,
        postal_code: formData.postal_code.trim() || null,
        phone: formData.phone.trim() || null,
        timezone: formData.timezone.trim() || null,
        pickup_instructions: formData.pickup_instructions.trim() || null,
        kds_active_limit_total: formData.kds_active_limit_total ? parseInt(formData.kds_active_limit_total, 10) : null,
        kds_active_limit_ct: formData.kds_active_limit_ct ? parseInt(formData.kds_active_limit_ct, 10) : null,
        admin_email: formData.admin_email.trim() || null,
        admin_password: formData.admin_password || null
      };

      const response = await fetch('/api/vendors/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      // Success - redirect to vendor detail page
      router.push(`/vendors/${data.vendor.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create vendor');
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Onboard New Vendor – CountrTop Ops</title>
      </Head>
      <OpsAdminLayout userEmail={userEmail}>
        <main className="page">
          <header className="page-header">
            <h1>Onboard New Vendor</h1>
          </header>

        <div className="page-content">
          <form onSubmit={handleSubmit} className="vendor-form">
            {/* POS Selection */}
            <div className="form-section pos-selection-section">
              <h2>Point of Sale System</h2>
              <div className="pos-selector">
                {(['square', 'clover', 'toast'] as POSProvider[]).map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    className={`pos-option ${formData.pos_provider === pos ? 'selected' : ''}`}
                    onClick={() => setFormData(prev => ({ ...prev, pos_provider: pos }))}
                    disabled={submitting}
                    style={{
                      borderColor: formData.pos_provider === pos ? POS_CONFIG[pos].color : undefined,
                      background: formData.pos_provider === pos ? POS_CONFIG[pos].bgColor : undefined
                    }}
                  >
                    <span className="pos-name" style={{ color: formData.pos_provider === pos ? POS_CONFIG[pos].color : undefined }}>
                      {POS_CONFIG[pos].name}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn-show-instructions"
                onClick={() => setShowInstructions(!showInstructions)}
              >
                {showInstructions ? '▼ Hide' : '▶ Show'} {posConfig.name} Setup Instructions
              </button>
              {showInstructions && (
                <div className="pos-instructions" style={{ borderColor: posConfig.color, background: posConfig.bgColor }}>
                  <h3 style={{ color: posConfig.color }}>{posConfig.name} Integration Setup</h3>
                  <ol>
                    {posConfig.instructions.map((step, i) => (
                      <li key={i}>{step.replace(/^\d+\.\s*/, '')}</li>
                    ))}
                  </ol>
                  <a href={posConfig.docsUrl} target="_blank" rel="noopener noreferrer" className="docs-link">
                    📚 {posConfig.name} Documentation →
                  </a>
                </div>
              )}
            </div>

            <div className="form-section">
              <h2>Basic Information</h2>
              <div className="form-grid">
                <div className="form-group required">
                  <label htmlFor="slug">Slug</label>
                  <input
                    type="text"
                    id="slug"
                    name="slug"
                    value={formData.slug}
                    onChange={handleChange}
                    required
                    pattern="[a-z0-9-_]+"
                    placeholder="e.g., sunset-coffee"
                    className="form-input"
                    disabled={submitting}
                  />
                  <small className="form-hint">Lowercase letters, numbers, hyphens, and underscores only</small>
                </div>

                <div className="form-group required">
                  <label htmlFor="display_name">Display Name</label>
                  <input
                    type="text"
                    id="display_name"
                    name="display_name"
                    value={formData.display_name}
                    onChange={handleChange}
                    required
                    placeholder="e.g., Sunset Coffee Cart"
                    className="form-input"
                    disabled={submitting}
                  />
                </div>

                <div className="form-group required">
                  <label htmlFor="square_location_id">{posConfig.locationIdLabel}</label>
                  <input
                    type="text"
                    id="square_location_id"
                    name="square_location_id"
                    value={formData.square_location_id}
                    onChange={handleChange}
                    required
                    placeholder={posConfig.locationIdPlaceholder}
                    className="form-input"
                    disabled={submitting}
                  />
                  <small className="form-hint">{posConfig.locationIdHint}</small>
                </div>

                <div className="form-group">
                  <label htmlFor="square_credential_ref">{posConfig.credentialLabel}</label>
                  <input
                    type="text"
                    id="square_credential_ref"
                    name="square_credential_ref"
                    value={formData.square_credential_ref}
                    onChange={handleChange}
                    placeholder={posConfig.credentialPlaceholder}
                    className="form-input"
                    disabled={submitting}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="status">Status</label>
                  <select
                    id="status"
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="form-input"
                    disabled={submitting}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="form-section">
              <h2>Location</h2>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="address_line1">Address Line 1</label>
                  <input
                    type="text"
                    id="address_line1"
                    name="address_line1"
                    value={formData.address_line1}
                    onChange={handleChange}
                    className="form-input"
                    disabled={submitting}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="address_line2">Address Line 2</label>
                  <input
                    type="text"
                    id="address_line2"
                    name="address_line2"
                    value={formData.address_line2}
                    onChange={handleChange}
                    className="form-input"
                    disabled={submitting}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="city">City</label>
                  <input
                    type="text"
                    id="city"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    className="form-input"
                    disabled={submitting}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="state">State</label>
                  <input
                    type="text"
                    id="state"
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    className="form-input"
                    disabled={submitting}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="postal_code">Postal Code</label>
                  <input
                    type="text"
                    id="postal_code"
                    name="postal_code"
                    value={formData.postal_code}
                    onChange={handleChange}
                    className="form-input"
                    disabled={submitting}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="phone">Phone</label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="form-input"
                    disabled={submitting}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="timezone">Timezone</label>
                  <input
                    type="text"
                    id="timezone"
                    name="timezone"
                    value={formData.timezone}
                    onChange={handleChange}
                    placeholder="e.g., America/New_York"
                    className="form-input"
                    disabled={submitting}
                  />
                  <small className="form-hint">IANA timezone identifier (e.g., America/New_York, America/Los_Angeles)</small>
                </div>
              </div>
            </div>

            <div className="form-section">
              <h2>Vendor Admin Login (optional)</h2>
              <p className="form-section-desc">
                Create a login for the vendor so they can access the vendor admin dashboard. Leave blank to set up later.
              </p>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="admin_email">Admin email</label>
                  <input
                    type="email"
                    id="admin_email"
                    name="admin_email"
                    value={formData.admin_email}
                    onChange={handleChange}
                    placeholder="e.g., admin@vendor.com"
                    className="form-input"
                    disabled={submitting}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="admin_password">Admin password</label>
                  <input
                    type="password"
                    id="admin_password"
                    name="admin_password"
                    value={formData.admin_password}
                    onChange={handleChange}
                    placeholder="Min 8 characters"
                    className="form-input"
                    disabled={submitting}
                    minLength={8}
                    autoComplete="new-password"
                  />
                  <small className="form-hint">Minimum 8 characters. Share securely with the vendor.</small>
                </div>
              </div>
            </div>

            <div className="form-section">
              <h2>Settings</h2>
              <div className="form-grid">
                <div className="form-group full-width">
                  <label htmlFor="pickup_instructions">Pickup Instructions</label>
                  <textarea
                    id="pickup_instructions"
                    name="pickup_instructions"
                    value={formData.pickup_instructions}
                    onChange={handleChange}
                    rows={4}
                    className="form-input"
                    disabled={submitting}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="kds_active_limit_total">KDS Active Limit (Total)</label>
                  <input
                    type="number"
                    id="kds_active_limit_total"
                    name="kds_active_limit_total"
                    value={formData.kds_active_limit_total}
                    onChange={handleChange}
                    min="0"
                    className="form-input"
                    disabled={submitting}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="kds_active_limit_ct">KDS Active Limit (Count)</label>
                  <input
                    type="number"
                    id="kds_active_limit_ct"
                    name="kds_active_limit_ct"
                    value={formData.kds_active_limit_ct}
                    onChange={handleChange}
                    min="0"
                    className="form-input"
                    disabled={submitting}
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="error-banner">
                <p>{error}</p>
              </div>
            )}

            <div className="form-actions">
              <Link href="/vendors" className="btn-cancel">
                Cancel
              </Link>
              <button type="submit" className="btn-submit" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Vendor'}
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

          .page-header h1 {
            font-size: 32px;
            font-weight: 700;
            margin: 0;
            background: var(--ct-gradient-primary);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .page-content {
            max-width: 1000px;
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

          .form-section h2 {
            font-size: 20px;
            font-weight: 600;
            margin: 0 0 24px;
            color: var(--color-text);
            border-bottom: 1px solid var(--color-border);
            padding-bottom: 12px;
          }

          .form-section-desc {
            font-size: 14px;
            color: var(--color-text-muted);
            margin: -8px 0 20px;
          }

          .form-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
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

          .form-group.required label::after {
            content: ' *';
            color: #fca5a5;
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

          .form-hint {
            font-size: 12px;
            color: var(--color-text-muted);
            margin-top: -4px;
          }

          textarea.form-input {
            resize: vertical;
            min-height: 100px;
          }

          .error-banner {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 8px;
            padding: 16px;
          }

          .error-banner p {
            margin: 0;
            color: #fca5a5;
            font-size: 14px;
          }

          .form-actions {
            display: flex;
            justify-content: flex-end;
            gap: 16px;
            padding-top: 24px;
            border-top: 1px solid var(--color-border);
          }

          .btn-cancel {
            padding: 12px 24px;
            border-radius: 8px;
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
            padding: 12px 24px;
            border-radius: 8px;
            border: none;
            background: var(--ct-gradient-primary);
            color: white;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            transition: opacity 0.2s;
            font-family: inherit;
          }

          .btn-submit:hover:not(:disabled) {
            opacity: 0.9;
          }

          .btn-submit:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          /* POS Selection */
          .pos-selection-section {
            background: rgba(102, 126, 234, 0.05);
          }

          .pos-selector {
            display: flex;
            gap: 16px;
            margin-bottom: 16px;
          }

          .pos-option {
            flex: 1;
            padding: 20px 24px;
            border-radius: 12px;
            border: 2px solid rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.03);
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            font-family: inherit;
          }

          .pos-option:hover:not(:disabled) {
            border-color: rgba(255, 255, 255, 0.4);
            background: rgba(255, 255, 255, 0.08);
          }

          .pos-option.selected {
            border-width: 2px;
          }

          .pos-option:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .pos-name {
            font-size: 18px;
            font-weight: 700;
            color: var(--color-text);
          }

          .btn-show-instructions {
            background: none;
            border: none;
            color: var(--color-accent);
            font-size: 14px;
            cursor: pointer;
            padding: 8px 0;
            font-family: inherit;
            text-align: left;
          }

          .btn-show-instructions:hover {
            color: var(--color-primary);
          }

          .pos-instructions {
            margin-top: 16px;
            padding: 20px;
            border-radius: 12px;
            border: 1px solid;
          }

          .pos-instructions h3 {
            margin: 0 0 16px;
            font-size: 16px;
            font-weight: 600;
          }

          .pos-instructions ol {
            margin: 0 0 16px;
            padding-left: 24px;
          }

          .pos-instructions li {
            margin-bottom: 8px;
            font-size: 14px;
            color: var(--color-text-muted);
            line-height: 1.5;
          }

          .docs-link {
            display: inline-block;
            color: var(--color-accent);
            text-decoration: none;
            font-size: 14px;
            font-weight: 500;
          }

          .docs-link:hover {
            text-decoration: underline;
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
            }

            .pos-selector {
              flex-direction: column;
            }

            .pos-option {
              padding: 16px 20px;
            }
          }
          `}</style>
        </main>
      </OpsAdminLayout>
    </>
  );
}

