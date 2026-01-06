import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/router';

import { requireOpsAdmin } from '../../lib/auth';

type Props = {
  userEmail: string;
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function NewVendorPage({ userEmail: _userEmail }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    slug: '',
    display_name: '',
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
        square_location_id: formData.square_location_id.trim(),
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
        kds_active_limit_ct: formData.kds_active_limit_ct ? parseInt(formData.kds_active_limit_ct, 10) : null
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
      <main className="page">
        <header className="page-header">
          <Link href="/vendors" className="back-link">← Back to Vendors</Link>
          <h1>Onboard New Vendor</h1>
        </header>

        <div className="page-content">
          <form onSubmit={handleSubmit} className="vendor-form">
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
                  <label htmlFor="square_location_id">Square Location ID</label>
                  <input
                    type="text"
                    id="square_location_id"
                    name="square_location_id"
                    value={formData.square_location_id}
                    onChange={handleChange}
                    required
                    placeholder="e.g., LK8XKXKXKXKXK"
                    className="form-input"
                    disabled={submitting}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="square_credential_ref">Square Credential Ref</label>
                  <input
                    type="text"
                    id="square_credential_ref"
                    name="square_credential_ref"
                    value={formData.square_credential_ref}
                    onChange={handleChange}
                    placeholder="Optional"
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
            color: #8b5cf6;
          }

          .page-header h1 {
            font-size: 32px;
            font-weight: 700;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 32px;
          }

          .form-section h2 {
            font-size: 20px;
            font-weight: 600;
            margin: 0 0 24px;
            color: #e8e8e8;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            padding-bottom: 12px;
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
            color: #e8e8e8;
          }

          .form-group.required label::after {
            content: ' *';
            color: #fca5a5;
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
            color: #888;
          }

          .form-hint {
            font-size: 12px;
            color: #888;
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
            border-top: 1px solid rgba(255, 255, 255, 0.1);
          }

          .btn-cancel {
            padding: 12px 24px;
            border-radius: 8px;
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
            padding: 12px 24px;
            border-radius: 8px;
            border: none;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
          }
        `}</style>
      </main>
    </>
  );
}

