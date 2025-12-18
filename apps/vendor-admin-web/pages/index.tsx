import Head from 'next/head';
import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { LoyaltySnapshot, MenuItem, Order, VendorSettings } from '@countrtop/models';
import { Section, StatCard } from '@countrtop/ui';
import { createDataClient, MenuItemInput, requireVendorUser, User } from '@countrtop/data';

const vendorId = 'vendor_cafe';
const onboardingChecklist = [
  { id: 'brand', label: 'Upload brand kit', description: 'Logo, colors, menu photos', completed: true },
  { id: 'bank', label: 'Connect payouts', description: 'Stripe Express account', completed: false },
  { id: 'team', label: 'Invite teammates', description: 'Kitchen + ops leads', completed: false }
];

const formatCurrency = (value: number) => `$${(value / 100).toFixed(2)}`;

const sortMenuItems = (items: MenuItem[]) => [...items].sort((a, b) => a.name.localeCompare(b.name));
const upsertMenuItemInState = (items: MenuItem[], item: MenuItem) => {
  const next = items.filter((existing) => existing.id !== item.id);
  return sortMenuItems([...next, item]);
};

export default function VendorAdminDashboard() {
  const useMockData = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== 'false';
  const dataClient = useMemo(() => createDataClient({ useMockData }), [useMockData]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<VendorSettings | null>(null);
  const [menuMessage, setMenuMessage] = useState<string | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MenuItemInput>({
    vendorId,
    name: '',
    description: '',
    price: 500,
    isAvailable: true
  });
  const [draftPrice, setDraftPrice] = useState('5.00');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const accessError = useMemo(() => {
    const activeUser: User = {
      id: 'vendor-demo',
      email: 'vendor@countrtop.app',
      role: 'vendor',
      displayName: 'Demo Vendor'
    };
    try {
      requireVendorUser(activeUser);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Unauthorized';
    }
  }, []);

  useEffect(() => {
    if (accessError) return;
    let mounted = true;
    const load = async () => {
      const [menu, vendorSettings, vendorOrders] = await Promise.all([
        dataClient.getMenuItems(vendorId),
        dataClient.fetchVendorSettings(vendorId),
        dataClient.listOrdersForVendor(vendorId)
      ]);
      if (!mounted) return;
      setMenuItems(sortMenuItems(menu));
      setSettings(vendorSettings);
      setOrders(vendorOrders);
    };
    load();
    return () => {
      mounted = false;
    };
  }, [accessError, dataClient]);

  const resetDraft = () => {
    setEditingId(null);
    setDraft({ vendorId, name: '', description: '', price: 500, isAvailable: true });
    setDraftPrice('5.00');
  };

  const handleEdit = (item: MenuItem) => {
    setEditingId(item.id);
    setDraft({
      vendorId,
      id: item.id,
      name: item.name,
      description: item.description ?? '',
      price: item.price,
      isAvailable: item.isAvailable
    });
    setDraftPrice((item.price / 100).toFixed(2));
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMenuMessage(null);
    setMenuError(null);
    const cents = Math.max(0, Math.round(parseFloat(draftPrice || '0') * 100));
    try {
      const saved = await dataClient.upsertMenuItem({
        ...draft,
        price: cents
      });
      setMenuItems((items) => upsertMenuItemInState(items, saved));
      setMenuMessage(editingId ? 'Menu item updated.' : 'Menu item created.');
      resetDraft();
    } catch (error) {
      setMenuError(error instanceof Error ? error.message : 'Unable to save menu item.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (menuItemId: string) => {
    setDeletingId(menuItemId);
    setMenuMessage(null);
    setMenuError(null);
    try {
      await dataClient.deleteMenuItem(menuItemId);
      setMenuItems((items) => items.filter((item) => item.id !== menuItemId));
      if (editingId === menuItemId) {
        resetDraft();
      }
    } catch (error) {
      setMenuError(error instanceof Error ? error.message : 'Unable to delete menu item.');
    } finally {
      setDeletingId(null);
    }
  };

  const analytics = useMemo(() => {
    const activeOrders = orders.filter((order) => order.status !== 'completed').length;
    const readyOrders = orders.filter((order) => order.status === 'ready').length;
    const avgTicket =
      orders.length === 0
        ? 0
        : Math.round(orders.reduce((sum, order) => sum + order.total, 0) / orders.length);
    const loyalty: LoyaltySnapshot = {
      points: readyOrders * 45,
      tier: 'gold',
      nextRewardAt: 500
    };
    return { activeOrders, readyOrders, avgTicket, loyalty };
  }, [orders]);

  if (accessError) {
    return (
      <>
        <Head>
          <title>CountrTop Vendor Admin</title>
        </Head>
        <main style={{ padding: '32px', fontFamily: 'Inter, sans-serif' }}>
          <h1 style={{ marginBottom: 8 }}>CountrTop Vendor Admin</h1>
          <p style={{ color: '#6b7280', marginBottom: 24 }}>Access restricted</p>
          <div
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecdd3',
              borderRadius: 12,
              padding: 16
            }}
          >
            <strong>Permission denied:</strong> {accessError}
          </div>
        </main>
      </>
    );
  }

  const handleSettingsUpdate = async (updates: Partial<VendorSettings>) => {
    if (!settings) return;
    setSettingsSaving(true);
    setSettingsMessage(null);
    setSettingsError(null);
    try {
      const next = await dataClient.updateVendorSettings(settings.vendorId, updates);
      setSettings(next);
      setSettingsMessage('Settings updated.');
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'Unable to update settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  return (
    <>
      <Head>
        <title>CountrTop Vendor Admin</title>
      </Head>
      <main style={{ padding: '32px', fontFamily: 'Inter, sans-serif' }}>
        <h1 style={{ marginBottom: 8 }}>CountrTop Vendor Admin</h1>
        <p style={{ color: '#6b7280', marginBottom: 24 }}>
          Configure vendors, manage menus, and keep billing + onboarding in sync.
        </p>

        <Section title="Analytics" subtitle="Live signal">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <StatCard label="Active orders" value={analytics.activeOrders} helperText="Across all trucks" />
            <StatCard label="Ready for pickup" value={analytics.readyOrders} helperText="Awaiting handoff" />
            <StatCard label="Avg. ticket" value={formatCurrency(analytics.avgTicket)} helperText="Today" />
            <StatCard
              label="Loyalty points"
              value={analytics.loyalty.points}
              helperText={`Next reward at ${analytics.loyalty.nextRewardAt}`}
            />
          </div>
        </Section>

        <Section title="Onboarding" subtitle="Client success">
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {onboardingChecklist.map((item) => (
              <li
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  padding: '12px 16px',
                  marginBottom: 12
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{item.label}</div>
                  <div style={{ color: '#6b7280' }}>{item.description}</div>
                </div>
                <span
                  style={{
                    color: item.completed ? '#10b981' : '#f97316',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    fontSize: 12
                  }}
                >
                  {item.completed ? 'done' : 'pending'}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Menu management" subtitle="List + edit items">
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: 8 }}>Item</th>
                  <th style={{ padding: 8 }}>Price</th>
                  <th style={{ padding: 8 }}>Availability</th>
                  <th style={{ padding: 8 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {menuItems.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 8 }}>
                      <div style={{ fontWeight: 600 }}>{item.name}</div>
                      <div style={{ color: '#6b7280' }}>{item.description ?? 'No description'}</div>
                    </td>
                    <td style={{ padding: 8 }}>{formatCurrency(item.price)}</td>
                    <td style={{ padding: 8 }}>
                      <span style={{ color: item.isAvailable ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                        {item.isAvailable ? 'Available' : 'Paused'}
                      </span>
                    </td>
                    <td style={{ padding: 8 }}>
                      <button
                        type="button"
                        onClick={() => handleEdit(item)}
                        style={{ marginRight: 8 }}
                        disabled={deletingId === item.id}
                      >
                        Edit
                      </button>
                      <button type="button" onClick={() => handleDelete(item.id)} disabled={deletingId === item.id}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {menuItems.length === 0 && (
                  <tr>
                    <td style={{ padding: 16 }} colSpan={4}>
                      No menu items yet. Add your first item below.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <form
            onSubmit={handleSave}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', fontSize: 14 }}>
              Name
              <input
                required
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                style={{ marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', fontSize: 14 }}>
              Price (USD)
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={draftPrice}
                onChange={(event) => setDraftPrice(event.target.value)}
                style={{ marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', fontSize: 14 }}>
              Description
              <textarea
                value={draft.description}
                onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
                rows={3}
                style={{
                  marginTop: 4,
                  padding: 8,
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  resize: 'vertical'
                }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={draft.isAvailable}
                onChange={(event) => setDraft((prev) => ({ ...prev, isAvailable: event.target.checked }))}
              />
              Available for ordering
            </label>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12 }}>
              <button type="submit" disabled={saving} style={{ padding: '10px 16px' }}>
                {editingId ? 'Update item' : 'Add item'}
              </button>
              {editingId && (
                <button type="button" onClick={resetDraft} style={{ padding: '10px 16px' }}>
                  Cancel edit
                </button>
              )}
            </div>
          </form>
          {menuMessage && (
            <p style={{ color: '#16a34a', marginTop: 12 }}>
              {menuMessage}
            </p>
          )}
          {menuError && (
            <p style={{ color: '#dc2626', marginTop: 12 }}>
              {menuError}
            </p>
          )}
        </Section>

        <Section title="Vendor settings" subtitle="Configuration">
          {settings ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                const enableLoyalty = formData.get('enableLoyalty') === 'on';
                const defaultPrep = Number(formData.get('defaultPrepMinutes') ?? settings.defaultPrepMinutes ?? 10);
                void handleSettingsUpdate({
                  enableLoyalty,
                  defaultPrepMinutes: Number.isNaN(defaultPrep) ? settings.defaultPrepMinutes : defaultPrep
                });
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>Currency</div>
                  <div style={{ color: '#6b7280' }}>{settings.currency}</div>
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>Timezone</div>
                  <div style={{ color: '#6b7280' }}>{settings.timezone ?? 'Not set'}</div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    name="enableLoyalty"
                    defaultChecked={settings.enableLoyalty}
                    disabled={settingsSaving}
                  />
                  <div>
                    <div style={{ fontWeight: 600 }}>Loyalty status</div>
                    <div style={{ color: '#6b7280' }}>
                      {settings.enableLoyalty ? 'Enabled' : 'Disabled'}{' '}
                      {settings.enableLoyalty && settings.loyaltyEarnRate
                        ? `(${settings.loyaltyEarnRate} pts per dollar)`
                        : ''}
                    </div>
                  </div>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontWeight: 600 }}>Default prep time (minutes)</div>
                  <input
                    type="number"
                    name="defaultPrepMinutes"
                    min={1}
                    defaultValue={settings.defaultPrepMinutes ?? 10}
                    style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}
                    disabled={settingsSaving}
                  />
                </label>
              </div>
              <div style={{ marginTop: 12 }}>
                <button type="submit" disabled={settingsSaving} style={{ padding: '10px 16px' }}>
                  {settingsSaving ? 'Saving…' : 'Save settings'}
                </button>
              </div>
              {settingsMessage && <p style={{ color: '#16a34a', marginTop: 8 }}>{settingsMessage}</p>}
              {settingsError && <p style={{ color: '#dc2626', marginTop: 8 }}>{settingsError}</p>}
            </form>
          ) : (
            <p style={{ color: '#6b7280' }}>Loading vendor settings…</p>
          )}
        </Section>

        <Section title="Billing" subtitle="Stripe + invoicing">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
              <div style={{ fontWeight: 600 }}>Stripe Express</div>
              <p style={{ color: '#6b7280' }}>Status: Pending verification</p>
              <p style={{ fontSize: 12, color: '#9ca3af' }}>TODO: display real payout + balance data.</p>
            </div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
              <div style={{ fontWeight: 600 }}>Invoices</div>
              <p style={{ color: '#6b7280' }}>Next billing cycle: 04/15</p>
              <p style={{ fontSize: 12, color: '#9ca3af' }}>TODO: fetch Stripe invoice + subscription status.</p>
            </div>
          </div>
        </Section>
      </main>
    </>
  );
}
