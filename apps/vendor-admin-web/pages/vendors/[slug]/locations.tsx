import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useState, useCallback, useEffect } from 'react';

import type { Vendor, VendorLocation, BillingPlanId } from '@countrtop/models';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@countrtop/data';

import { requireVendorAdmin } from '../../../lib/auth';
import { getServerDataClient } from '../../../lib/dataClient';
import { VendorAdminLayout } from '../../../components/VendorAdminLayout';
import { canUseMultipleLocations } from '../../../lib/planCapabilities';

type LocationsPageProps = {
  vendorSlug: string;
  vendorName: string;
  vendor: Vendor | null;
  locations: VendorLocation[];
  planId: BillingPlanId;
  canAddMoreLocations: boolean;
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
        planId: 'beta' as BillingPlanId,
        canAddMoreLocations: true,
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
        planId: 'beta' as BillingPlanId,
        canAddMoreLocations: true,
        error: 'Vendor not found'
      }
    };
  }

  const billing = await dataClient.getVendorBilling(vendor.id);
  const planId: BillingPlanId = (billing?.planId as BillingPlanId) ?? 'beta';

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
        onlineOrderingHoursJson: (row as Record<string, unknown>).online_ordering_hours_json as Record<string, unknown> | undefined ?? undefined,
        scheduledOrdersEnabled: (row as Record<string, unknown>).scheduled_orders_enabled as boolean | undefined ?? false,
        scheduledOrderLeadDays: (row as Record<string, unknown>).scheduled_order_lead_days as number | undefined ?? 7,
        scheduledOrderSlotMinutes: (row as Record<string, unknown>).scheduled_order_slot_minutes as number | undefined ?? 30,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    }
  }

  const canAddMoreLocations = locations.length === 0 || canUseMultipleLocations(planId);

  return {
    props: {
      vendorSlug: slug ?? 'unknown',
      vendorName: vendor.displayName,
      vendor,
      locations,
      planId,
      canAddMoreLocations
    }
  };
};

type AddLocationFormProps = {
  initialSquareLocationId: string;
  initialName: string;
  initialAddressLine1: string;
  initialCity: string;
  initialState: string;
  initialPostalCode: string;
  initialPhone: string;
  onSubmit: (payload: {
    squareLocationId: string;
    name: string;
    addressLine1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    phone?: string;
  }) => Promise<void>;
  onCancel?: () => void;
  creating: boolean;
  submitLabel: string;
  showCancelButton: boolean;
};

function AddLocationForm({
  initialSquareLocationId,
  initialName,
  initialAddressLine1,
  initialCity,
  initialState,
  initialPostalCode,
  initialPhone,
  onSubmit,
  onCancel,
  creating,
  submitLabel,
  showCancelButton
}: AddLocationFormProps) {
  const [squareLocationId, setSquareLocationId] = useState(initialSquareLocationId);
  const [name, setName] = useState(initialName);
  const [addressLine1, setAddressLine1] = useState(initialAddressLine1);
  const [city, setCity] = useState(initialCity);
  const [state, setState] = useState(initialState);
  const [postalCode, setPostalCode] = useState(initialPostalCode);
  const [phone, setPhone] = useState(initialPhone);

  const canSubmit = (squareLocationId?.trim() ?? '') !== '' && (name?.trim() ?? '') !== '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || creating) return;
    onSubmit({
      squareLocationId: squareLocationId.trim(),
      name: name.trim(),
      addressLine1: addressLine1.trim() || undefined,
      city: city.trim() || undefined,
      state: state.trim() || undefined,
      postalCode: postalCode.trim() || undefined,
      phone: phone.trim() || undefined
    });
  };

  return (
    <form className="add-location-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="add-loc-square-id">Square Location ID</label>
        <input
          id="add-loc-square-id"
          type="text"
          value={squareLocationId}
          onChange={(e) => setSquareLocationId(e.target.value)}
          placeholder="e.g. LXXXXXX"
          disabled={creating}
        />
        <small className="form-hint">Find this in Square Dashboard → Locations → Location details</small>
      </div>
      <div className="form-group">
        <label htmlFor="add-loc-name">Location name</label>
        <input
          id="add-loc-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Main Street"
          required
          disabled={creating}
        />
      </div>
      <div className="form-group">
        <label htmlFor="add-loc-address">Address line 1</label>
        <input
          id="add-loc-address"
          type="text"
          value={addressLine1}
          onChange={(e) => setAddressLine1(e.target.value)}
          placeholder="Optional"
          disabled={creating}
        />
      </div>
      <div className="form-row two-col">
        <div className="form-group">
          <label htmlFor="add-loc-city">City</label>
          <input
            id="add-loc-city"
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Optional"
            disabled={creating}
          />
        </div>
        <div className="form-group">
          <label htmlFor="add-loc-state">State</label>
          <input
            id="add-loc-state"
            type="text"
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="Optional"
            disabled={creating}
          />
        </div>
      </div>
      <div className="form-row two-col">
        <div className="form-group">
          <label htmlFor="add-loc-postal">Postal code</label>
          <input
            id="add-loc-postal"
            type="text"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            placeholder="Optional"
            disabled={creating}
          />
        </div>
        <div className="form-group">
          <label htmlFor="add-loc-phone">Phone</label>
          <input
            id="add-loc-phone"
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Optional"
            disabled={creating}
          />
        </div>
      </div>
      <div className="add-location-form-actions">
        {showCancelButton && (
          <button type="button" className="btn-cancel" onClick={onCancel} disabled={creating}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn-save" disabled={!canSubmit || creating}>
          {creating ? 'Saving...' : submitLabel}
        </button>
      </div>
      <style jsx>{`
        .add-location-form {
          text-align: left;
          margin-top: 24px;
          max-width: 480px;
          margin-left: auto;
          margin-right: auto;
        }
        .add-location-form .form-group {
          margin-bottom: 16px;
        }
        .add-location-form .form-group label {
          display: block;
          font-size: 14px;
          color: var(--color-text-muted);
          margin-bottom: 8px;
        }
        .add-location-form .form-group input {
          width: 100%;
          background: var(--ct-bg-surface);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 10px 12px;
          color: var(--color-text);
          font-family: inherit;
          font-size: 14px;
        }
        .add-location-form .form-group input:disabled {
          opacity: 0.7;
        }
        .add-location-form .form-hint {
          display: block;
          font-size: 12px;
          color: var(--color-text-muted);
          margin-top: 4px;
        }
        .add-location-form .form-row.two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .add-location-form-actions {
          display: flex;
          gap: 12px;
          margin-top: 24px;
        }
        .add-location-form-actions .btn-cancel {
          background: transparent;
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 10px 20px;
          color: var(--color-text-muted);
          font-size: 14px;
          cursor: pointer;
        }
        .add-location-form-actions .btn-cancel:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .add-location-form-actions .btn-save {
          background: var(--ct-gradient-primary);
          border: none;
          border-radius: 8px;
          padding: 10px 20px;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }
        .add-location-form-actions .btn-save:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        @media (max-width: 768px) {
          .add-location-form .form-row.two-col {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </form>
  );
}

export default function LocationsPage({ 
  vendorSlug, 
  vendorName, 
  vendor,
  locations: initialLocations,
  canAddMoreLocations,
  error 
}: LocationsPageProps) {
  const [locations, setLocations] = useState(initialLocations);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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

  const handleCreateLocation = useCallback(async (payload: {
    squareLocationId: string;
    name: string;
    addressLine1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    phone?: string;
  }) => {
    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          squareLocationId: payload.squareLocationId.trim(),
          name: payload.name.trim(),
          isPrimary: locations.length === 0,
          isActive: true,
          addressLine1: payload.addressLine1?.trim() || undefined,
          city: payload.city?.trim() || undefined,
          state: payload.state?.trim() || undefined,
          postalCode: payload.postalCode?.trim() || undefined,
          phone: payload.phone?.trim() || undefined
        })
      });
      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error || 'Failed to add location');
      }
      setLocations(prev => [...prev, data.location as VendorLocation]);
      setShowAddForm(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to add location');
    } finally {
      setCreating(false);
    }
  }, [vendorSlug, locations.length]);

  return (
    <>
      <Head>
        <title>Locations · {vendorName}</title>
      </Head>
      <VendorAdminLayout vendorSlug={vendorSlug} vendorName={vendorName}>
        <main className="page">
          <div className="container">
            <header className="header">
              <div className="header-left">
                <h1 className="title">Locations</h1>
                <p className="subtitle">{vendorName} · Manage your locations</p>
              </div>
            </header>

          {error && <div className="error-banner">{error}</div>}
          {saveError && <div className="error-banner">{saveError}</div>}
          {saveSuccess && <div className="success-banner">✓ Saved successfully</div>}
          {createError && <div className="error-banner">{createError}</div>}

          <section className="locations-list">
            {locations.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📍</div>
                <h2>Activate your location</h2>
                <p>Add your first location to start taking orders and using KDS.</p>
                <AddLocationForm
                  key="activate"
                  initialSquareLocationId={vendor?.squareLocationId ?? ''}
                  initialName={vendor?.displayName ?? ''}
                  initialAddressLine1={vendor?.addressLine1 ?? ''}
                  initialCity={vendor?.city ?? ''}
                  initialState={vendor?.state ?? ''}
                  initialPostalCode={vendor?.postalCode ?? ''}
                  initialPhone={vendor?.phone ?? ''}
                  onSubmit={handleCreateLocation}
                  creating={creating}
                  submitLabel="Activate location"
                  showCancelButton={false}
                />
              </div>
            ) : (
              <>
                {canAddMoreLocations ? (
                  <>
                    {!showAddForm ? (
                      <button
                        type="button"
                        className="add-location-btn"
                        onClick={() => {
                          setCreateError(null);
                          setShowAddForm(true);
                        }}
                      >
                        Add location
                      </button>
                    ) : (
                      <div className="add-location-form-wrap">
                        <AddLocationForm
                          key="add"
                          initialSquareLocationId=""
                          initialName=""
                          initialAddressLine1=""
                          initialCity=""
                          initialState=""
                          initialPostalCode=""
                          initialPhone=""
                          onSubmit={handleCreateLocation}
                          onCancel={() => {
                            setShowAddForm(false);
                            setCreateError(null);
                          }}
                          creating={creating}
                          submitLabel="Add location"
                          showCancelButton={true}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="upgrade-cta">
                    <p>Upgrade to Pro to add more locations.</p>
                    <a href={`/vendors/${vendorSlug}/billing`} className="upgrade-link">Go to Billing</a>
                  </div>
                )}
                {locations.map(location => (
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
                ))}
              </>
            )}
          </section>
          </div>

          <style jsx>{`
          .page {
            min-height: 100vh;
            background: var(--ct-bg-primary);
            color: var(--ct-text);
            font-family: var(--ct-font-body);
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
            color: var(--color-accent);
            text-decoration: none;
            font-size: 14px;
            display: inline-block;
            margin-bottom: 16px;
          }

          .back-link:hover {
            color: var(--color-primary);
          }

          .title {
            font-size: 32px;
            font-weight: 700;
            margin: 0 0 8px;
            background: var(--ct-gradient-primary);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .subtitle {
            font-size: 16px;
            color: var(--color-text-muted);
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
            background: var(--ct-bg-surface);
            border: 1px solid var(--color-border);
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
            color: var(--color-text-muted);
            margin: 0;
          }

          .add-location-btn {
            background: var(--ct-gradient-primary);
            border: none;
            border-radius: 8px;
            padding: 10px 20px;
            color: #fff;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
          }
          .add-location-btn:hover {
            opacity: 0.9;
          }
          .add-location-form-wrap {
            background: var(--ct-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 16px;
            padding: 20px;
          }
          .upgrade-cta {
            background: var(--ct-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 16px;
            padding: 20px;
          }
          .upgrade-cta p {
            margin: 0 0 12px 0;
            color: var(--color-text-muted);
            font-size: 14px;
          }
          .upgrade-link {
            color: var(--color-accent);
            text-decoration: none;
            font-size: 14px;
            font-weight: 600;
          }
          .upgrade-link:hover {
            text-decoration: underline;
          }

          @media (max-width: 768px) {
            .page {
              padding: 16px;
            }
            .container {
              max-width: 100%;
            }
            .header {
              margin-bottom: 24px;
            }
            .title {
              font-size: 24px;
            }
            .locations-list {
              gap: 12px;
            }
          }
          `}</style>
        </main>
      </VendorAdminLayout>
    </>
  );
}

// Store hours: customer storefront expects object keyed by day ("0"-"6" = Sun-Sat), value "9am-5pm" or "9:00 AM-5:00 PM"; empty = closed.
const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function storeHoursJsonToArray(json: Record<string, unknown> | undefined): string[] {
  const out: string[] = ['', '', '', '', '', '', ''];
  if (!json || typeof json !== 'object') return out;
  const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  for (let i = 0; i < 7; i++) {
    const v = json[String(i)] ?? json[dayNames[i]];
    if (typeof v === 'string' && v.trim()) out[i] = v.trim();
    else if (typeof v === 'object' && v !== null) {
      const o = v as Record<string, unknown>;
      const open = String(o.open ?? o.start ?? '').trim();
      const close = String(o.close ?? o.end ?? '').trim();
      if (open && close) out[i] = `${open}-${close}`;
    }
  }
  return out;
}

function storeHoursToJson(
  storeHoursByDay: string[],
  closedByDay: boolean[]
): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (let i = 0; i < 7; i++) {
    if (closedByDay[i]) continue;
    const trimmed = (storeHoursByDay[i] ?? '').trim();
    if (trimmed) out[String(i)] = trimmed;
  }
  return Object.keys(out).length ? out : null;
}

function deriveClosedByDay(json: Record<string, unknown> | undefined): boolean[] {
  const arr = storeHoursJsonToArray(json);
  return arr.map((val) => (val ?? '').trim() === '');
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
  const [scheduledOrdersEnabled, setScheduledOrdersEnabled] = useState(location.scheduledOrdersEnabled ?? false);
  const [scheduledOrderLeadDays, setScheduledOrderLeadDays] = useState(
    location.scheduledOrderLeadDays?.toString() ?? '7'
  );
  const [scheduledOrderSlotMinutes, setScheduledOrderSlotMinutes] = useState(
    location.scheduledOrderSlotMinutes?.toString() ?? '30'
  );

  // Store hours (for customer storefront): 7 days, index 0 = Sunday
  const [storeHoursByDay, setStoreHoursByDay] = useState<string[]>(() =>
    storeHoursJsonToArray(location.onlineOrderingHoursJson)
  );
  const [closedByDay, setClosedByDay] = useState<boolean[]>(() =>
    deriveClosedByDay(location.onlineOrderingHoursJson)
  );

  useEffect(() => {
    if (!isEditing) {
      setStoreHoursByDay(storeHoursJsonToArray(location.onlineOrderingHoursJson));
      setClosedByDay(deriveClosedByDay(location.onlineOrderingHoursJson));
    }
  }, [location.id, location.onlineOrderingHoursJson, isEditing]);

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
      onlineOrderingHoursJson: storeHoursToJson(storeHoursByDay, closedByDay) ?? undefined,
      scheduledOrdersEnabled,
      scheduledOrderLeadDays: scheduledOrderLeadDays ? parseInt(scheduledOrderLeadDays, 10) : 7,
      scheduledOrderSlotMinutes: scheduledOrderSlotMinutes ? parseInt(scheduledOrderSlotMinutes, 10) : 30,
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
            {location.scheduledOrdersEnabled && <span className="badge scheduled">Scheduled Orders</span>}
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
        <div className="info-row">
          <span className="label">Store hours:</span>
          <span className="value">
            {location.onlineOrderingHoursJson && Object.keys(location.onlineOrderingHoursJson).length > 0
              ? 'Configured'
              : 'Not set'}
          </span>
        </div>

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
                <>
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
                  <div className="form-row">
                    <div className="form-group checkbox-group">
                      <label>
                        <input
                          type="checkbox"
                          checked={scheduledOrdersEnabled}
                          onChange={(e) => setScheduledOrdersEnabled(e.target.checked)}
                        />
                        Scheduled Orders (customers pick future pickup time)
                      </label>
                    </div>
                  </div>
                  {scheduledOrdersEnabled && (
                    <div className="form-row" style={{ gap: 16, flexWrap: 'wrap' }}>
                      <div className="form-group">
                        <label>Max days in advance</label>
                        <input
                          type="number"
                          min="1"
                          max="30"
                          value={scheduledOrderLeadDays}
                          onChange={(e) => setScheduledOrderLeadDays(e.target.value)}
                          className="input-small"
                        />
                      </div>
                      <div className="form-group">
                        <label>Slot size (minutes)</label>
                        <select
                          value={scheduledOrderSlotMinutes}
                          onChange={(e) => setScheduledOrderSlotMinutes(e.target.value)}
                        >
                          <option value="15">15 min</option>
                          <option value="30">30 min</option>
                          <option value="60">60 min</option>
                        </select>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Store hours (for customer storefront). Check Closed or enter hours (e.g. 9:00 AM–5:00 PM) */}
            <div className="settings-group">
              <h4 className="settings-group-title">🕐 Store hours (for customer storefront)</h4>
              <small className="form-hint" style={{ display: 'block', marginBottom: 12 }}>
                Check Closed or enter hours (e.g. 9:00 AM–5:00 PM)
              </small>
              {WEEKDAY_LABELS.map((label, i) => {
                const isClosed = closedByDay[i];
                return (
                  <div key={i} className="form-group" style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <label style={{ minWidth: 90, marginBottom: 0 }}>{label}</label>
                      <label className="checkbox-group" style={{ marginBottom: 0 }}>
                        <input
                          type="checkbox"
                          checked={isClosed}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setClosedByDay((prev) => {
                              const next = [...prev];
                              next[i] = checked;
                              return next;
                            });
                            if (checked) {
                              setStoreHoursByDay((prev) => {
                                const next = [...prev];
                                next[i] = '';
                                return next;
                              });
                            }
                          }}
                        />
                        Closed
                      </label>
                      {!isClosed && (
                        <input
                          type="text"
                          value={storeHoursByDay[i] ?? ''}
                          onChange={(e) => {
                            const next = [...storeHoursByDay];
                            next[i] = e.target.value;
                            setStoreHoursByDay(next);
                          }}
                          placeholder="9:00 AM–5:00 PM"
                          className="input-small"
                          style={{ width: '100%', maxWidth: 280, flex: 1 }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
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
          background: var(--ct-bg-surface);
          border: 1px solid var(--color-border);
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
          color: var(--color-text);
        }

        .name-input {
          font-size: 18px;
          font-weight: 600;
          background: var(--ct-bg-surface);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 8px 12px;
          color: var(--color-text);
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
          background: rgba(232, 93, 4, 0.12);
          color: var(--color-primary);
        }

        .badge.inactive {
          background: rgba(255, 59, 48, 0.2);
          color: #ff6b6b;
        }

        .badge.online {
          background: rgba(52, 199, 89, 0.2);
          color: #34c759;
        }

        .badge.scheduled {
          background: rgba(94, 92, 230, 0.2);
          color: #5e5ce6;
        }

        .edit-btn {
          background: var(--color-bg-warm);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 8px 16px;
          color: var(--color-text);
          font-size: 14px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .edit-btn:hover {
          background: rgba(232, 93, 4, 0.12);
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
          color: var(--color-text-muted);
          min-width: 140px;
        }

        .value {
          color: var(--color-text);
        }

        code.value {
          font-family: monospace;
          background: var(--color-bg-warm);
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 12px;
        }

        .edit-section {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid var(--color-border);
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          font-size: 14px;
          color: var(--color-text-muted);
          margin-bottom: 8px;
        }

        .form-group textarea {
          width: 100%;
          background: var(--ct-bg-surface);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 12px;
          color: var(--color-text);
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
          border-bottom: 1px solid var(--color-border);
        }

        .settings-group:last-child {
          border-bottom: none;
          margin-bottom: 0;
          padding-bottom: 0;
        }

        .settings-group-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--color-text);
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
          background: var(--ct-bg-surface);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 10px 12px;
          color: var(--color-text);
          font-family: inherit;
          font-size: 14px;
        }

        .input-small {
          max-width: 100%;
        }

        .form-hint {
          display: block;
          font-size: 12px;
          color: var(--color-text-muted);
          margin-top: 4px;
        }

        .card-actions {
          display: flex;
          gap: 12px;
          padding-top: 16px;
          border-top: 1px solid var(--color-border);
        }

        .btn-cancel {
          background: transparent;
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 10px 20px;
          color: var(--color-text-muted);
          font-size: 14px;
          cursor: pointer;
        }

        .btn-save {
          background: var(--ct-gradient-primary);
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
          background: var(--color-bg-warm);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 10px 20px;
          color: var(--color-text);
          font-size: 14px;
          cursor: pointer;
        }

        .btn-toggle.active {
          border-color: rgba(255, 59, 48, 0.4);
          color: #ff6b6b;
        }

        .btn-primary-set {
          background: transparent;
          border: 1px solid rgba(232, 93, 4, 0.4);
          border-radius: 8px;
          padding: 10px 20px;
          color: var(--color-primary);
          font-size: 14px;
          cursor: pointer;
        }

        .btn-primary-set:hover {
          background: rgba(232, 93, 4, 0.12);
        }

        @media (max-width: 768px) {
          .location-card {
            padding: 16px;
          }
          .card-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }
          .card-title-row {
            flex-wrap: wrap;
          }
          .info-row {
            flex-direction: column;
            gap: 4px;
            margin-bottom: 12px;
          }
          .label {
            min-width: 0;
          }
          .form-row.two-col {
            grid-template-columns: 1fr;
          }
          .card-actions {
            flex-direction: column;
          }
          .card-actions .btn-cancel,
          .card-actions .btn-save {
            width: 100%;
          }
          .badges {
            flex-wrap: wrap;
          }
        }
      `}</style>
    </div>
  );
}

