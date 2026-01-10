import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useState, useCallback } from 'react';

import type { Vendor, VendorLocation } from '@countrtop/models';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@countrtop/data';

import { requireVendorAdmin } from '../../../lib/auth';
import { getServerDataClient } from '../../../lib/dataClient';

type LocationsPageProps = {
  vendorSlug: string;
  vendorName: string;
  vendor: Vendor | null;
  locations: VendorLocation[];
  error?: string | null;
};

export const getServerSideProps: GetServerSideProps<LocationsPageProps> = async (context) => {
  const slugParam = context.params?.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

  const authResult = await requireVendorAdmin(context, slug ?? null);
  if (!authResult.authorized) {
    if (authResult.redirect) {
      return { redirect: authResult.redirect };
    }
    return {
      props: {
        vendorSlug: slug ?? 'unknown',
        vendorName: 'Access Denied',
        vendor: null,
        locations: [],
        error: authResult.error ?? 'Access denied'
      }
    };
  }

  const dataClient = getServerDataClient();
  const vendor = slug ? await dataClient.getVendorBySlug(slug) : null;
  
  if (!vendor) {
    return {
      props: {
        vendorSlug: slug ?? 'unknown',
        vendorName: 'Unknown',
        vendor: null,
        locations: [],
        error: 'Vendor not found'
      }
    };
  }

  // Fetch locations using service role
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let locations: VendorLocation[] = [];
  
  if (supabaseUrl && supabaseKey) {
    const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
    
    type VendorLocationRow = Database['public']['Tables']['vendor_locations']['Row'];
    
    const { data } = await supabase
      .from('vendor_locations')
      .select('*')
      .eq('vendor_id', vendor.id)
      .order('is_primary', { ascending: false })
      .order('name', { ascending: true });
    
    if (data) {
      locations = (data as VendorLocationRow[]).map((row) => ({
        id: row.id,
        vendorId: row.vendor_id,
        externalLocationId: row.square_location_id, // POS-agnostic field
        squareLocationId: row.square_location_id, // Deprecated alias
        posProvider: (row.pos_provider ?? 'square') as 'square' | 'toast' | 'clover',
        name: row.name,
        isPrimary: row.is_primary,
        isActive: row.is_active,
        addressLine1: row.address_line1 ?? undefined,
        addressLine2: row.address_line2 ?? undefined,
        city: row.city ?? undefined,
        state: row.state ?? undefined,
        postalCode: row.postal_code ?? undefined,
        phone: row.phone ?? undefined,
        timezone: row.timezone ?? undefined,
        pickupInstructions: row.pickup_instructions ?? undefined,
        onlineOrderingEnabled: row.online_ordering_enabled,
        kdsActiveLimitTotal: row.kds_active_limit_total ?? undefined,
        kdsActiveLimitCt: row.kds_active_limit_ct ?? undefined,
        kdsAutoBumpMinutes: (row as Record<string, unknown>).kds_auto_bump_minutes as number | undefined,
        kdsSoundAlertsEnabled: (row as Record<string, unknown>).kds_sound_alerts_enabled as boolean | undefined,
        kdsDisplayMode: ((row as Record<string, unknown>).kds_display_mode as 'grid' | 'list' | undefined) ?? 'grid',
        onlineOrderingLeadTimeMinutes: (row as Record<string, unknown>).online_ordering_lead_time_minutes as number | undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    }
  }

  return {
    props: {
      vendorSlug: slug ?? 'unknown',
      vendorName: vendor.displayName,
      vendor,
      locations
    }
  };
};

export default function LocationsPage({ 
  vendorSlug, 
  vendorName, 
  locations: initialLocations,
  error 
}: LocationsPageProps) {
  const [locations, setLocations] = useState(initialLocations);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = useCallback(async (locationId: string, updates: Partial<VendorLocation>) => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/locations/${locationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates)
      });

      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error || 'Failed to save');
      }

      // Update local state
      setLocations(prev => prev.map(loc => 
        loc.id === locationId ? { ...loc, ...data.location } : loc
      ));
      setSaveSuccess(true);
      setEditingId(null);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [vendorSlug]);

  const handleToggleActive = useCallback(async (locationId: string, currentActive: boolean) => {
    await handleSave(locationId, { isActive: !currentActive });
  }, [handleSave]);

  const handleSetPrimary = useCallback(async (locationId: string) => {
    // First, unset primary on current primary
    const currentPrimary = locations.find(l => l.isPrimary);
    if (currentPrimary && currentPrimary.id !== locationId) {
      await handleSave(currentPrimary.id, { isPrimary: false });
    }
    // Then set new primary
    await handleSave(locationId, { isPrimary: true });
  }, [locations, handleSave]);

  return (
    <>
      <Head>
        <title>Locations · {vendorName}</title>
      </Head>
      <main className="page">
        <div className="container">
          <header className="header">
            <div className="header-left">
              <a href={`/vendors/${vendorSlug}`} className="back-link">
                ← Back to Dashboard
              </a>
              <h1 className="title">Locations</h1>
              <p className="subtitle">{vendorName} · Manage your locations</p>
            </div>
          </header>

          {error && <div className="error-banner">{error}</div>}
          {saveError && <div className="error-banner">{saveError}</div>}
          {saveSuccess && <div className="success-banner">✓ Saved successfully</div>}

          <section className="locations-list">
            {locations.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📍</div>
                <h2>No Locations</h2>
                <p>Add your first location to get started.</p>
              </div>
            ) : (
              locations.map(location => (
                <LocationCard
                  key={location.id}
                  location={location}
                  isEditing={editingId === location.id}
                  saving={saving}
                  onEdit={() => setEditingId(location.id)}
                  onCancel={() => setEditingId(null)}
                  onSave={(updates) => handleSave(location.id, updates)}
                  onToggleActive={() => handleToggleActive(location.id, location.isActive)}
                  onSetPrimary={() => handleSetPrimary(location.id)}
                />
              ))
            )}
          </section>
        </div>

        <style jsx>{`
          .page {
            min-height: 100vh;
            background: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%);
            color: #e8e8e8;
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
            padding: 24px;
          }

          .container {
            max-width: 900px;
            margin: 0 auto;
          }

          .header {
            margin-bottom: 32px;
          }

          .back-link {
            color: #a78bfa;
            text-decoration: none;
            font-size: 14px;
            display: inline-block;
            margin-bottom: 16px;
          }

          .back-link:hover {
            color: #c4b5fd;
          }

          .title {
            font-size: 32px;
            font-weight: 700;
            margin: 0 0 8px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .subtitle {
            font-size: 16px;
            color: #888;
            margin: 0;
          }

          .error-banner {
            background: rgba(255, 59, 48, 0.2);
            border: 1px solid rgba(255, 59, 48, 0.4);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 24px;
            color: #ff6b6b;
          }

          .success-banner {
            background: rgba(52, 199, 89, 0.2);
            border: 1px solid rgba(52, 199, 89, 0.4);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 24px;
            color: #34c759;
          }

          .locations-list {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }

          .empty-state {
            text-align: center;
            padding: 64px 24px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 16px;
          }

          .empty-icon {
            font-size: 48px;
            margin-bottom: 16px;
          }

          .empty-state h2 {
            font-size: 20px;
            margin: 0 0 8px;
          }

          .empty-state p {
            color: #888;
            margin: 0;
          }
        `}</style>
      </main>
    </>
  );
}

// LocationCard component
type LocationCardProps = {
  location: VendorLocation;
  isEditing: boolean;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (updates: Partial<VendorLocation>) => void;
  onToggleActive: () => void;
  onSetPrimary: () => void;
};

function LocationCard({ 
  location, 
  isEditing, 
  saving,
  onEdit, 
  onCancel, 
  onSave,
  onToggleActive,
  onSetPrimary
}: LocationCardProps) {
  const [name, setName] = useState(location.name);
  const [pickupInstructions, setPickupInstructions] = useState(location.pickupInstructions || '');
  const [onlineOrderingEnabled, setOnlineOrderingEnabled] = useState(location.onlineOrderingEnabled);
  
  // KDS settings
  const [kdsActiveLimitTotal, setKdsActiveLimitTotal] = useState(location.kdsActiveLimitTotal?.toString() || '10');
  const [kdsActiveLimitCt, setKdsActiveLimitCt] = useState(location.kdsActiveLimitCt?.toString() || '10');
  const [kdsAutoBumpMinutes, setKdsAutoBumpMinutes] = useState(location.kdsAutoBumpMinutes?.toString() || '');
  const [kdsSoundAlertsEnabled, setKdsSoundAlertsEnabled] = useState(location.kdsSoundAlertsEnabled ?? true);
  const [kdsDisplayMode, setKdsDisplayMode] = useState<'grid' | 'list'>(location.kdsDisplayMode || 'grid');
  
  // Online ordering settings
  const [onlineOrderingLeadTimeMinutes, setOnlineOrderingLeadTimeMinutes] = useState(
    location.onlineOrderingLeadTimeMinutes?.toString() || '15'
  );

  const handleSaveClick = () => {
    onSave({
      name,
      pickupInstructions: pickupInstructions || null,
      onlineOrderingEnabled,
      kdsActiveLimitTotal: kdsActiveLimitTotal ? parseInt(kdsActiveLimitTotal, 10) : null,
      kdsActiveLimitCt: kdsActiveLimitCt ? parseInt(kdsActiveLimitCt, 10) : null,
      kdsAutoBumpMinutes: kdsAutoBumpMinutes ? parseInt(kdsAutoBumpMinutes, 10) : null,
      kdsSoundAlertsEnabled,
      kdsDisplayMode,
      onlineOrderingLeadTimeMinutes: onlineOrderingLeadTimeMinutes ? parseInt(onlineOrderingLeadTimeMinutes, 10) : 15,
    });
  };

  const address = [
    location.addressLine1,
    location.addressLine2,
    [location.city, location.state, location.postalCode].filter(Boolean).join(', ')
  ].filter(Boolean).join(', ');

  return (
    <div className={`location-card ${!location.isActive ? 'inactive' : ''}`}>
      <div className="card-header">
        <div className="card-title-row">
          {isEditing ? (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="name-input"
              placeholder="Location name"
            />
          ) : (
            <h3 className="card-title">{location.name}</h3>
          )}
          <div className="badges">
            {location.isPrimary && <span className="badge primary">Primary</span>}
            {!location.isActive && <span className="badge inactive">Inactive</span>}
            {location.onlineOrderingEnabled && <span className="badge online">Online Ordering</span>}
          </div>
        </div>
        {!isEditing && (
          <button className="edit-btn" onClick={onEdit}>Edit</button>
        )}
      </div>

      <div className="card-body">
        <div className="info-row">
          <span className="label">Square Location ID:</span>
          <code className="value">{location.squareLocationId}</code>
        </div>
        {address && (
          <div className="info-row">
            <span className="label">Address:</span>
            <span className="value">{address}</span>
          </div>
        )}
        {location.phone && (
          <div className="info-row">
            <span className="label">Phone:</span>
            <span className="value">{location.phone}</span>
          </div>
        )}

        {isEditing && (
          <div className="edit-section">
            {/* General Settings */}
            <div className="settings-group">
              <h4 className="settings-group-title">📝 General</h4>
              <div className="form-group">
                <label>Pickup Instructions</label>
                <textarea
                  value={pickupInstructions}
                  onChange={(e) => setPickupInstructions(e.target.value)}
                  rows={3}
                  placeholder="Enter pickup instructions for customers..."
                />
              </div>
            </div>

            {/* Online Ordering Settings */}
            <div className="settings-group">
              <h4 className="settings-group-title">🛒 Online Ordering</h4>
              <div className="form-row">
                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={onlineOrderingEnabled}
                      onChange={(e) => setOnlineOrderingEnabled(e.target.checked)}
                    />
                    Online Ordering Enabled
                  </label>
                </div>
              </div>
              {onlineOrderingEnabled && (
                <div className="form-row">
                  <div className="form-group">
                    <label>Lead Time (minutes)</label>
                    <input
                      type="number"
                      min="0"
                      max="120"
                      value={onlineOrderingLeadTimeMinutes}
                      onChange={(e) => setOnlineOrderingLeadTimeMinutes(e.target.value)}
                      className="input-small"
                    />
                    <small className="form-hint">Minimum minutes before pickup</small>
                  </div>
                </div>
              )}
            </div>

            {/* KDS Settings */}
            <div className="settings-group">
              <h4 className="settings-group-title">🖥️ KDS Queue Settings</h4>
              <div className="form-row two-col">
                <div className="form-group">
                  <label>Max Active Tickets (Total)</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={kdsActiveLimitTotal}
                    onChange={(e) => setKdsActiveLimitTotal(e.target.value)}
                    className="input-small"
                  />
                  <small className="form-hint">Max tickets from all sources</small>
                </div>
                <div className="form-group">
                  <label>Max CountrTop Orders</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={kdsActiveLimitCt}
                    onChange={(e) => setKdsActiveLimitCt(e.target.value)}
                    className="input-small"
                  />
                  <small className="form-hint">Max online orders in queue</small>
                </div>
              </div>
              <div className="form-row two-col">
                <div className="form-group">
                  <label>Auto-Bump Time (minutes)</label>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={kdsAutoBumpMinutes}
                    onChange={(e) => setKdsAutoBumpMinutes(e.target.value)}
                    placeholder="Disabled"
                    className="input-small"
                  />
                  <small className="form-hint">Auto-complete ready orders (0 = off)</small>
                </div>
                <div className="form-group">
                  <label>Display Mode</label>
                  <select
                    value={kdsDisplayMode}
                    onChange={(e) => setKdsDisplayMode(e.target.value as 'grid' | 'list')}
                    className="input-small"
                  >
                    <option value="grid">Grid View</option>
                    <option value="list">List View</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={kdsSoundAlertsEnabled}
                      onChange={(e) => setKdsSoundAlertsEnabled(e.target.checked)}
                    />
                    Sound Alerts for New Orders
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="card-actions">
          <button className="btn-cancel" onClick={onCancel} disabled={saving}>Cancel</button>
          <button className="btn-save" onClick={handleSaveClick} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      ) : (
        <div className="card-actions">
          <button 
            className={`btn-toggle ${location.isActive ? 'active' : ''}`}
            onClick={onToggleActive}
          >
            {location.isActive ? 'Deactivate' : 'Activate'}
          </button>
          {!location.isPrimary && location.isActive && (
            <button className="btn-primary-set" onClick={onSetPrimary}>
              Set as Primary
            </button>
          )}
        </div>
      )}

      <style jsx>{`
        .location-card {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 20px;
          transition: background 0.2s;
        }

        .location-card.inactive {
          opacity: 0.6;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 16px;
        }

        .card-title-row {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .card-title {
          font-size: 18px;
          font-weight: 600;
          margin: 0;
          color: #e8e8e8;
        }

        .name-input {
          font-size: 18px;
          font-weight: 600;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          padding: 8px 12px;
          color: #e8e8e8;
          font-family: inherit;
        }

        .badges {
          display: flex;
          gap: 8px;
        }

        .badge {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          padding: 4px 8px;
          border-radius: 6px;
        }

        .badge.primary {
          background: rgba(102, 126, 234, 0.2);
          color: #667eea;
        }

        .badge.inactive {
          background: rgba(255, 59, 48, 0.2);
          color: #ff6b6b;
        }

        .badge.online {
          background: rgba(52, 199, 89, 0.2);
          color: #34c759;
        }

        .edit-btn {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          padding: 8px 16px;
          color: #e8e8e8;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .edit-btn:hover {
          background: rgba(255, 255, 255, 0.15);
        }

        .card-body {
          margin-bottom: 16px;
        }

        .info-row {
          display: flex;
          gap: 12px;
          margin-bottom: 8px;
          font-size: 14px;
        }

        .label {
          color: #888;
          min-width: 140px;
        }

        .value {
          color: #e8e8e8;
        }

        code.value {
          font-family: monospace;
          background: rgba(255, 255, 255, 0.1);
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 12px;
        }

        .edit-section {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          font-size: 14px;
          color: #888;
          margin-bottom: 8px;
        }

        .form-group textarea {
          width: 100%;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          padding: 12px;
          color: #e8e8e8;
          font-family: inherit;
          font-size: 14px;
          resize: vertical;
        }

        .checkbox-group label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        .checkbox-group input[type="checkbox"] {
          width: 18px;
          height: 18px;
        }

        .settings-group {
          margin-bottom: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .settings-group:last-child {
          border-bottom: none;
          margin-bottom: 0;
          padding-bottom: 0;
        }

        .settings-group-title {
          font-size: 14px;
          font-weight: 600;
          color: #e8e8e8;
          margin: 0 0 12px 0;
        }

        .form-row {
          margin-bottom: 12px;
        }

        .form-row.two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .form-group input[type="number"],
        .form-group select {
          width: 100%;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          padding: 10px 12px;
          color: #e8e8e8;
          font-family: inherit;
          font-size: 14px;
        }

        .input-small {
          max-width: 100%;
        }

        .form-hint {
          display: block;
          font-size: 12px;
          color: #666;
          margin-top: 4px;
        }

        .card-actions {
          display: flex;
          gap: 12px;
          padding-top: 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .btn-cancel {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          padding: 10px 20px;
          color: #888;
          font-size: 14px;
          cursor: pointer;
        }

        .btn-save {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: none;
          border-radius: 8px;
          padding: 10px 20px;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }

        .btn-save:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-toggle {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          padding: 10px 20px;
          color: #e8e8e8;
          font-size: 14px;
          cursor: pointer;
        }

        .btn-toggle.active {
          border-color: rgba(255, 59, 48, 0.4);
          color: #ff6b6b;
        }

        .btn-primary-set {
          background: transparent;
          border: 1px solid rgba(102, 126, 234, 0.4);
          border-radius: 8px;
          padding: 10px 20px;
          color: #667eea;
          font-size: 14px;
          cursor: pointer;
        }

        .btn-primary-set:hover {
          background: rgba(102, 126, 234, 0.1);
        }
      `}</style>
    </div>
  );
}

