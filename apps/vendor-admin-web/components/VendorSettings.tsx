import { useState, useEffect } from 'react';
import { Vendor, Employee, BillingPlanId } from '@countrtop/models';
import { canUseCustomBranding, canUseLoyalty } from '../lib/planCapabilities';
import { getBrowserSupabaseClient } from '../lib/supabaseBrowser';

type Props = {
  vendor: Vendor;
  vendorSlug: string;
  planId: BillingPlanId;
};

export function VendorSettings({ vendor, vendorSlug, planId }: Props) {
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Default theme colors (used for reset)
  const DEFAULT_PRIMARY_COLOR = '#E85D04';
  const DEFAULT_ACCENT_COLOR = '#FFB627';

  // Theming state
  const [logoUrl, setLogoUrl] = useState(vendor.logoUrl || '');
  const [primaryColor, setPrimaryColor] = useState(vendor.primaryColor || DEFAULT_PRIMARY_COLOR);
  const [accentColor, setAccentColor] = useState(vendor.accentColor || DEFAULT_ACCENT_COLOR);
  const [reviewUrl, setReviewUrl] = useState(vendor.reviewUrl || '');

  // Loyalty redemption settings state
  const [loyaltySettings, setLoyaltySettings] = useState<{
    centsPerPoint: number;
    minPointsToRedeem: number;
    maxPointsPerOrder: number;
  }>({ centsPerPoint: 1, minPointsToRedeem: 100, maxPointsPerOrder: 500 });
  const [loyaltySettingsLoading, setLoyaltySettingsLoading] = useState(true);
  const [loyaltySettingsSaving, setLoyaltySettingsSaving] = useState(false);

  // Location PINs state
  const [locations, setLocations] = useState<Array<{ locationId: string; locationName: string; hasPin: boolean }>>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [pinInputs, setPinInputs] = useState<Record<string, string>>({});
  const [pinSaving, setPinSaving] = useState<Record<string, boolean>>({});
  const [pinErrors, setPinErrors] = useState<Record<string, string>>({});

  // Employees (add/edit/delete)
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [employeesError, setEmployeesError] = useState<string | null>(null);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [newEmployeePin, setNewEmployeePin] = useState('');
  const [employeesSaving, setEmployeesSaving] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPin, setEditPin] = useState('');

  // Account / Security (password, reset link)
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changePwdSubmitting, setChangePwdSubmitting] = useState(false);
  const [changePwdError, setChangePwdError] = useState<string | null>(null);
  const [changePwdSuccess, setChangePwdSuccess] = useState(false);
  const [resetLinkSent, setResetLinkSent] = useState(false);

  // MFA (2FA) state
  const [mfaFactorsLoading, setMfaFactorsLoading] = useState(true);
  const [mfaFactors, setMfaFactors] = useState<Array<{ id: string; friendly_name?: string; factor_type: string }>>([]);
  const [mfaEnrollData, setMfaEnrollData] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [mfaVerifyCode, setMfaVerifyCode] = useState('');
  const [mfaVerifyError, setMfaVerifyError] = useState<string | null>(null);
  const [mfaEnrolling, setMfaEnrolling] = useState(false);
  const [mfaUnenrolling, setMfaUnenrolling] = useState<string | null>(null);

  // Fetch loyalty redemption settings on mount (only when plan includes loyalty)
  useEffect(() => {
    if (!canUseLoyalty(planId)) {
      setLoyaltySettingsLoading(false);
      return;
    }
    const fetchLoyaltySettings = async () => {
      try {
        const response = await fetch(`/api/vendors/${vendorSlug}/loyalty-settings`);
        const data = await response.json();
        if (data.success && data.data) {
          setLoyaltySettings({
            centsPerPoint: data.data.centsPerPoint ?? 1,
            minPointsToRedeem: data.data.minPointsToRedeem ?? 100,
            maxPointsPerOrder: data.data.maxPointsPerOrder ?? 500
          });
        }
      } catch (err) {
        console.error('Failed to fetch loyalty settings:', err);
      } finally {
        setLoyaltySettingsLoading(false);
      }
    };
    fetchLoyaltySettings();
  }, [vendorSlug, planId]);

  // Load current user email for Account section
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const client = getBrowserSupabaseClient();
    if (!client) return;
    client.auth.getSession().then(({ data: { session } }) => {
      setUserEmail(session?.user?.email ?? null);
    });
  }, []);

  // Load MFA factors on mount
  const loadMfaFactors = async () => {
    const client = getBrowserSupabaseClient();
    if (!client) {
      setMfaFactorsLoading(false);
      return;
    }
    setMfaFactorsLoading(true);
    try {
      const { data, error } = await client.auth.mfa.listFactors();
      if (error) {
        setMfaFactors([]);
      } else {
        const totp = (data as { totp?: Array<{ id: string; friendly_name?: string; factor_type: string }> })?.totp ?? [];
        setMfaFactors(totp.map((f) => ({ id: f.id, friendly_name: f.friendly_name, factor_type: f.factor_type ?? 'totp' })));
      }
    } catch {
      setMfaFactors([]);
    } finally {
      setMfaFactorsLoading(false);
    }
  };

  useEffect(() => {
    loadMfaFactors();
  }, []);

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

  const fetchEmployees = async () => {
    setEmployeesLoading(true);
    setEmployeesError(null);
    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/employees`, { credentials: 'include' });
      const data = await response.json();
      if (data.success) {
        setEmployees(
          data.data.map((emp: { id: string; name: string; pin: string; isActive: boolean }) => ({
            id: emp.id,
            vendorId: vendor.id,
            name: emp.name,
            pin: emp.pin,
            isActive: emp.isActive,
            createdAt: '',
            updatedAt: ''
          }))
        );
      } else {
        setEmployeesError(data.error || 'Failed to load employees');
      }
    } catch (err) {
      setEmployeesError(err instanceof Error ? err.message : 'Failed to load employees');
    } finally {
      setEmployeesLoading(false);
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmployeeName.trim() || !newEmployeePin.trim()) {
      setEmployeesError('Name and PIN are required');
      return;
    }
    if (!/^\d{3}$/.test(newEmployeePin)) {
      setEmployeesError('PIN must be exactly 3 digits');
      return;
    }
    setEmployeesSaving(true);
    setEmployeesError(null);
    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newEmployeeName.trim(), pin: newEmployeePin.trim() })
      });
      const data = await response.json();
      if (data.success) {
        setNewEmployeeName('');
        setNewEmployeePin('');
        setShowAddEmployee(false);
        await fetchEmployees();
      } else {
        setEmployeesError(data.error || 'Failed to create employee');
      }
    } catch (err) {
      setEmployeesError(err instanceof Error ? err.message : 'Failed to create employee');
    } finally {
      setEmployeesSaving(false);
    }
  };

  const handleUpdateEmployee = async (employeeId: string) => {
    if (!editName.trim() || !editPin.trim()) {
      setEmployeesError('Name and PIN are required');
      return;
    }
    if (!/^\d{3}$/.test(editPin)) {
      setEmployeesError('PIN must be exactly 3 digits');
      return;
    }
    setEmployeesSaving(true);
    setEmployeesError(null);
    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/employees?employeeId=${employeeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: editName.trim(), pin: editPin.trim() })
      });
      const data = await response.json();
      if (data.success) {
        setEditingEmployee(null);
        setEditName('');
        setEditPin('');
        await fetchEmployees();
      } else {
        setEmployeesError(data.error || 'Failed to update employee');
      }
    } catch (err) {
      setEmployeesError(err instanceof Error ? err.message : 'Failed to update employee');
    } finally {
      setEmployeesSaving(false);
    }
  };

  const handleDeleteEmployee = async (employeeId: string) => {
    if (!confirm('Are you sure you want to delete this employee? This action cannot be undone.')) return;
    setEmployeesSaving(true);
    setEmployeesError(null);
    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/employees?employeeId=${employeeId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await response.json();
      if (data.success) await fetchEmployees();
      else setEmployeesError(data.error || 'Failed to delete employee');
    } catch (err) {
      setEmployeesError(err instanceof Error ? err.message : 'Failed to delete employee');
    } finally {
      setEmployeesSaving(false);
    }
  };

  const handleToggleActive = async (employeeId: string, isActive: boolean) => {
    setEmployeesSaving(true);
    setEmployeesError(null);
    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/employees?employeeId=${employeeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: !isActive })
      });
      const data = await response.json();
      if (data.success) await fetchEmployees();
      else setEmployeesError(data.error || 'Failed to update employee');
    } catch (err) {
      setEmployeesError(err instanceof Error ? err.message : 'Failed to update employee');
    } finally {
      setEmployeesSaving(false);
    }
  };

  const startEdit = (employee: Employee) => {
    setEditingEmployee(employee.id);
    setEditName(employee.name);
    setEditPin(employee.pin);
  };

  const cancelEdit = () => {
    setEditingEmployee(null);
    setEditName('');
    setEditPin('');
  };

  useEffect(() => {
    fetchEmployees();
  }, [vendorSlug]);

  const handleSaveLoyaltySettings = async () => {
    setLoyaltySettingsSaving(true);
    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/loyalty-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(loyaltySettings)
      });
      const data = await response.json();
      if (data.success) {
        setLoyaltySettings(data.data);
      } else {
        throw new Error(data.error || 'Failed to save loyalty settings');
      }
    } catch (err) {
      console.error('Failed to save loyalty settings:', err);
      alert('Failed to save loyalty settings. Please try again.');
    } finally {
      setLoyaltySettingsSaving(false);
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
          logoUrl: logoUrl || null,
          primaryColor: primaryColor || null,
          accentColor: accentColor || null,
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

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = getBrowserSupabaseClient();
    if (!client || !userEmail) return;
    setChangePwdError(null);
    setChangePwdSuccess(false);
    if (newPassword.length < 8) {
      setChangePwdError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setChangePwdError('New passwords do not match.');
      return;
    }
    setChangePwdSubmitting(true);
    try {
      const { error: signInError } = await client.auth.signInWithPassword({ email: userEmail, password: currentPassword });
      if (signInError) {
        setChangePwdError(signInError.message);
        setChangePwdSubmitting(false);
        return;
      }
      const { error: updateError } = await client.auth.updateUser({ password: newPassword });
      if (updateError) {
        setChangePwdError(updateError.message);
        setChangePwdSubmitting(false);
        return;
      }
      setChangePwdSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setTimeout(() => setChangePwdSuccess(false), 5000);
    } catch (err) {
      setChangePwdError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setChangePwdSubmitting(false);
    }
  };

  const handleSendResetLink = async () => {
    const client = getBrowserSupabaseClient();
    if (!client || !userEmail) return;
    setChangePwdError(null);
    try {
      const { error } = await client.auth.resetPasswordForEmail(userEmail, {
        redirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/reset-password`
      });
      if (error) {
        setChangePwdError(error.message);
        return;
      }
      setResetLinkSent(true);
      setTimeout(() => setResetLinkSent(false), 5000);
    } catch (err) {
      setChangePwdError(err instanceof Error ? err.message : 'Failed to send reset link');
    }
  };

  const handleMfaEnrollStart = async () => {
    const client = getBrowserSupabaseClient();
    if (!client) return;
    setMfaVerifyError(null);
    setMfaEnrollData(null);
    setMfaEnrolling(true);
    try {
      const { data, error } = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Vendor Admin'
      });
      if (error) {
        setChangePwdError(error.message);
        setMfaEnrolling(false);
        return;
      }
      const totp = (data as { id: string; totp?: { qr_code: string; secret: string } })?.totp;
      if (data?.id && totp?.qr_code) {
        setMfaEnrollData({ factorId: data.id, qrCode: totp.qr_code, secret: totp.secret ?? '' });
      }
    } catch (err) {
      setChangePwdError(err instanceof Error ? err.message : 'Failed to start 2FA setup');
    } finally {
      setMfaEnrolling(false);
    }
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = getBrowserSupabaseClient();
    if (!client || !mfaEnrollData) return;
    setMfaVerifyError(null);
    const code = mfaVerifyCode.trim().replace(/\s/g, '');
    if (!code) {
      setMfaVerifyError('Enter the code from your authenticator app.');
      return;
    }
    try {
      const { error } = await client.auth.mfa.challengeAndVerify({
        factorId: mfaEnrollData.factorId,
        code
      });
      if (error) {
        setMfaVerifyError(error.message);
        return;
      }
      setMfaEnrollData(null);
      setMfaVerifyCode('');
      loadMfaFactors();
    } catch (err) {
      setMfaVerifyError(err instanceof Error ? err.message : 'Failed to verify');
    }
  };

  const handleMfaUnenroll = async (factorId: string) => {
    const client = getBrowserSupabaseClient();
    if (!client) return;
    setMfaUnenrolling(factorId);
    try {
      const { error } = await client.auth.mfa.unenroll({ factorId });
      if (error) {
        setChangePwdError(error.message);
      } else {
        loadMfaFactors();
      }
    } catch (err) {
      setChangePwdError(err instanceof Error ? err.message : 'Failed to disable 2FA');
    } finally {
      setMfaUnenrolling(null);
    }
  };

  return (
    <main className="page">
      <div className="page-content">
        <form onSubmit={handleSave} className="vendor-form">
          {canUseCustomBranding(planId) && (
            <div className="form-section highlight">
              <div className="form-section-header-row">
                <div>
                  <h2>🎨 Branding & Theme</h2>
                  <p className="section-description">Customize the appearance of your customer-facing pages</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPrimaryColor(DEFAULT_PRIMARY_COLOR);
                    setAccentColor(DEFAULT_ACCENT_COLOR);
                  }}
                  className="btn-secondary btn-reset-default"
                  disabled={saving}
                >
                  Reset to default
                </button>
              </div>

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
                  <label htmlFor="primaryColor">Button Color</label>
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
                      placeholder="#E85D04"
                    />
                  </div>
                  <small className="form-hint">Color for buttons and CTAs</small>
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
                      placeholder="#FFB627"
                    />
                  </div>
                  <small className="form-hint">Color for text highlights and badges</small>
                </div>
              </div>
            </div>
          )}

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

          {canUseLoyalty(planId) && (
            <div className="form-section">
              <h2>⭐ Loyalty Settings</h2>
              <p className="section-description">Configure points and redemption rules for your loyalty program</p>

              {loyaltySettingsLoading ? (
                <p className="muted">Loading...</p>
              ) : (
                <div className="loyalty-redemption-settings">
                  <p className="section-description" style={{ marginTop: 0, marginBottom: 16 }}>
                    Redemption rules (e.g. 100 pts = $1 when cents per point = 1)
                  </p>
                  <div className="loyalty-settings-fields">
                    <div className="form-group">
                      <label>Cents per point</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={loyaltySettings.centsPerPoint}
                        onChange={(e) =>
                          setLoyaltySettings(prev => ({
                            ...prev,
                            centsPerPoint: Math.max(0, parseInt(e.target.value, 10) || 0)
                          }))
                        }
                        className="form-input"
                      />
                    </div>
                    <div className="form-group">
                      <label>Min points to redeem</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={loyaltySettings.minPointsToRedeem}
                        onChange={(e) =>
                          setLoyaltySettings(prev => ({
                            ...prev,
                            minPointsToRedeem: Math.max(0, parseInt(e.target.value, 10) || 0)
                          }))
                        }
                        className="form-input"
                      />
                    </div>
                    <div className="form-group">
                      <label>Max points per order</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={loyaltySettings.maxPointsPerOrder}
                        onChange={(e) =>
                          setLoyaltySettings(prev => ({
                            ...prev,
                            maxPointsPerOrder: Math.max(0, parseInt(e.target.value, 10) || 0)
                          }))
                        }
                        className="form-input"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveLoyaltySettings}
                      disabled={loyaltySettingsSaving}
                      className="btn-secondary"
                      style={{ alignSelf: 'flex-start' }}
                    >
                      {loyaltySettingsSaving ? 'Saving…' : 'Save redemption rules'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

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

          {/* Employees Section */}
          <div className="form-section">
            <div className="employees-section-header">
              <div>
                <h2>👥 Employees</h2>
                <p className="section-description">Add and manage employees who can clock in/out on the KDS</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddEmployee(!showAddEmployee)}
                className="btn-secondary"
                disabled={employeesSaving}
              >
                {showAddEmployee ? 'Cancel' : '+ Add Employee'}
              </button>
            </div>

            {employeesError && (
              <div className="error-banner" style={{ marginBottom: 16 }}>
                <p>{employeesError}</p>
              </div>
            )}

            {showAddEmployee && (
              <div className="add-employee-form">
                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="new-employee-name">Name</label>
                    <input
                      id="new-employee-name"
                      type="text"
                      value={newEmployeeName}
                      onChange={(e) => setNewEmployeeName(e.target.value)}
                      placeholder="Employee name"
                      required
                      disabled={employeesSaving}
                      className="form-input"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddEmployee(e as unknown as React.FormEvent)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="new-employee-pin">3-Digit PIN</label>
                    <input
                      id="new-employee-pin"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{3}"
                      maxLength={3}
                      value={newEmployeePin}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 3);
                        setNewEmployeePin(value);
                      }}
                      placeholder="000"
                      required
                      disabled={employeesSaving}
                      className="form-input"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddEmployee(e as unknown as React.FormEvent)}
                    />
                    <small className="form-hint">Employee uses this PIN to clock in/out on KDS</small>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-submit"
                  disabled={employeesSaving}
                  style={{ marginTop: 8 }}
                  onClick={(e) => handleAddEmployee(e as unknown as React.FormEvent)}
                >
                  {employeesSaving ? 'Creating...' : 'Create Employee'}
                </button>
              </div>
            )}

            {employeesLoading ? (
              <p className="muted">Loading employees...</p>
            ) : employees.length === 0 ? (
              <p className="muted">No employees yet. Add your first employee to get started.</p>
            ) : (
              <div className="employees-list">
                {employees.map((employee) => (
                  <div key={employee.id} className={`employee-item ${!employee.isActive ? 'inactive' : ''}`}>
                    {editingEmployee === employee.id ? (
                      <div className="employee-edit-form">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Name"
                          className="form-input edit-input"
                          disabled={employeesSaving}
                        />
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]{3}"
                          maxLength={3}
                          value={editPin}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, '').slice(0, 3);
                            setEditPin(value);
                          }}
                          placeholder="PIN"
                          className="form-input edit-input"
                          disabled={employeesSaving}
                        />
                        <div className="edit-actions">
                          <button type="button" onClick={() => handleUpdateEmployee(employee.id)} className="btn-submit btn-small" disabled={employeesSaving}>
                            Save
                          </button>
                          <button type="button" onClick={cancelEdit} className="btn-secondary btn-small" disabled={employeesSaving}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="employee-info">
                          <div className="employee-name">{employee.name}</div>
                          <div className="employee-pin">PIN: {employee.pin}</div>
                          {!employee.isActive && <span className="inactive-badge">Inactive</span>}
                        </div>
                        <div className="employee-actions">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(employee.id, employee.isActive)}
                            className={`btn-secondary btn-small ${employee.isActive ? 'btn-deactivate' : 'btn-activate'}`}
                            disabled={employeesSaving}
                          >
                            {employee.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button type="button" onClick={() => startEdit(employee)} className="btn-secondary btn-small" disabled={employeesSaving}>
                            Edit
                          </button>
                          <button type="button" onClick={() => handleDeleteEmployee(employee.id)} className="btn-delete-small" disabled={employeesSaving}>
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Account & Security */}
          <div className="form-section">
            <h2>Account & Security</h2>
            <p className="section-description">Change your password or request a password reset link</p>
            {userEmail && (
              <p className="account-email">Signed in as <strong>{userEmail}</strong></p>
            )}
            {changePwdError && (
              <div className="account-error">{changePwdError}</div>
            )}
            {changePwdSuccess && (
              <div className="account-success">Password updated successfully.</div>
            )}
            {resetLinkSent && (
              <div className="account-success">Password reset link sent to your email.</div>
            )}
            <form onSubmit={handleChangePassword} className="account-password-form">
              <div className="form-grid account-form-grid">
                <div className="form-group">
                  <label htmlFor="currentPassword">Current password</label>
                  <input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="form-input"
                    required
                    disabled={changePwdSubmitting}
                    autoComplete="current-password"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="newPassword">New password</label>
                  <input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="form-input"
                    required
                    minLength={8}
                    disabled={changePwdSubmitting}
                    autoComplete="new-password"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="confirmNewPassword">Confirm new password</label>
                  <input
                    id="confirmNewPassword"
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="form-input"
                    required
                    minLength={8}
                    disabled={changePwdSubmitting}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <div className="account-actions">
                <button type="submit" className="btn-secondary" disabled={changePwdSubmitting}>
                  {changePwdSubmitting ? 'Updating…' : 'Change password'}
                </button>
                <button
                  type="button"
                  onClick={handleSendResetLink}
                  className="btn-secondary"
                  disabled={resetLinkSent}
                >
                  {resetLinkSent ? 'Link sent' : 'Email me a password reset link'}
                </button>
              </div>
            </form>

            <div className="mfa-section">
              <h3 className="mfa-heading">Two-factor authentication</h3>
              <p className="section-description" style={{ marginTop: 0 }}>
                Add an extra layer of security by requiring a code from your authenticator app when signing in.
              </p>
              {mfaFactorsLoading ? (
                <p className="muted">Loading…</p>
              ) : mfaFactors.length > 0 ? (
                <div className="mfa-enabled">
                  <p className="mfa-status">Two-factor authentication is enabled.</p>
                  <ul className="mfa-factors-list">
                    {mfaFactors.map((f) => (
                      <li key={f.id} className="mfa-factor-item">
                        <span>{f.friendly_name ?? f.factor_type ?? 'Authenticator'}</span>
                        <button
                          type="button"
                          onClick={() => handleMfaUnenroll(f.id)}
                          className="btn-secondary btn-small"
                          disabled={mfaUnenrolling === f.id}
                        >
                          {mfaUnenrolling === f.id ? 'Disabling…' : 'Disable'}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : mfaEnrollData ? (
                <div className="mfa-enroll-step">
                  <p>Scan the QR code with your authenticator app (e.g. Google Authenticator, Authy), then enter the code below.</p>
                  <div className="mfa-qr-wrap">
                    <img src={mfaEnrollData.qrCode} alt="QR code for authenticator" width={200} height={200} />
                  </div>
                  <p className="muted">Or enter this secret manually: <code>{mfaEnrollData.secret}</code></p>
                  <form onSubmit={handleMfaVerify} className="mfa-verify-form">
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="000000"
                      value={mfaVerifyCode}
                      onChange={(e) => setMfaVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="form-input mfa-code-input"
                      maxLength={6}
                    />
                    {mfaVerifyError && <div className="account-error">{mfaVerifyError}</div>}
                    <div className="account-actions">
                      <button type="submit" className="btn-secondary">Verify and enable</button>
                      <button
                        type="button"
                        onClick={() => { setMfaEnrollData(null); setMfaVerifyCode(''); setMfaVerifyError(null); }}
                        className="btn-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleMfaEnrollStart}
                  className="btn-secondary"
                  disabled={mfaEnrolling}
                >
                  {mfaEnrolling ? 'Setting up…' : 'Enable two-factor authentication'}
                </button>
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

        .account-email {
          margin: 0 0 16px;
          font-size: 14px;
          color: var(--color-text-muted);
        }

        .account-error {
          margin-bottom: 16px;
          padding: 12px 16px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 8px;
          color: #fca5a5;
          font-size: 14px;
        }

        .account-success {
          margin-bottom: 16px;
          padding: 12px 16px;
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.3);
          border-radius: 8px;
          color: #86efac;
          font-size: 14px;
        }

        .account-password-form .account-form-grid {
          max-width: 400px;
        }

        .account-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 16px;
        }

        .mfa-section {
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid var(--color-border);
        }

        .mfa-heading {
          font-size: 16px;
          font-weight: 600;
          margin: 0 0 8px;
        }

        .mfa-status {
          margin: 0 0 12px;
          font-size: 14px;
        }

        .mfa-factors-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .mfa-factor-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 0;
          border-bottom: 1px solid var(--color-border);
        }

        .mfa-factor-item:last-child {
          border-bottom: none;
        }

        .mfa-enroll-step {
          max-width: 400px;
        }

        .mfa-enroll-step p {
          margin: 0 0 12px;
          font-size: 14px;
        }

        .mfa-qr-wrap {
          margin: 16px 0;
        }

        .mfa-qr-wrap img {
          display: block;
        }

        .mfa-verify-form {
          margin-top: 16px;
        }

        .mfa-code-input {
          max-width: 140px;
          font-family: ui-monospace, monospace;
          letter-spacing: 0.2em;
          text-align: center;
        }

        .form-section-header-row {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 24px;
        }

        .form-section-header-row .section-description {
          margin-bottom: 0;
        }

        .btn-reset-default {
          flex-shrink: 0;
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

        .loyalty-settings-fields {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          align-items: flex-end;
        }
        .loyalty-settings-fields .form-group {
          min-width: 140px;
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

        /* Employees section */
        .employees-section-header {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 24px;
        }

        .employees-section-header .section-description {
          margin-bottom: 0;
        }

        .add-employee-form {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          gap: 16px;
          padding: 20px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 12px;
          margin-bottom: 24px;
        }

        .employees-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .employee-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          background: var(--ct-bg-surface);
          border: 1px solid var(--color-border);
          border-radius: 12px;
        }

        .employee-item.inactive {
          opacity: 0.6;
        }

        .employee-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .employee-name {
          font-size: 16px;
          font-weight: 600;
          color: var(--color-text);
        }

        .employee-pin {
          font-size: 14px;
          color: var(--color-text-muted);
          font-family: monospace;
        }

        .inactive-badge {
          display: inline-block;
          padding: 4px 8px;
          background: rgba(255, 159, 10, 0.2);
          color: #ff9f0a;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
          margin-top: 4px;
        }

        .employee-actions {
          display: flex;
          gap: 8px;
        }

        .employee-edit-form {
          display: flex;
          gap: 8px;
          align-items: center;
          flex: 1;
          flex-wrap: wrap;
        }

        .employee-edit-form .edit-input {
          padding: 8px 12px;
          flex: 1;
          min-width: 100px;
        }

        .edit-actions {
          display: flex;
          gap: 8px;
        }

        .btn-small {
          padding: 8px 16px;
          font-size: 13px;
        }

        .btn-delete-small {
          padding: 8px 16px;
          border-radius: 6px;
          border: none;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          font-family: inherit;
          background: rgba(255, 59, 48, 0.2);
          color: #ff3b30;
        }

        .btn-delete-small:hover:not(:disabled) {
          background: rgba(255, 59, 48, 0.3);
        }

        .btn-delete-small:disabled {
          opacity: 0.5;
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
            justify-content: center;
          }

          .locations-grid {
            grid-template-columns: 1fr;
          }

          .employee-item {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }

          .employee-actions {
            width: 100%;
            justify-content: flex-end;
          }

          .employee-edit-form {
            flex-direction: column;
            width: 100%;
          }

          .edit-actions {
            width: 100%;
            justify-content: flex-end;
          }
        }
      `}</style>
    </main>
  );
}
