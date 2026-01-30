import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

import { resolveVendorSlugFromHost, type Database } from '@countrtop/data';
import { CartItem, MenuItem, OrderHistoryEntry, Vendor } from '@countrtop/models';
import { useAuth } from '@countrtop/ui';
import { getServerDataClient } from '../lib/dataClient';
import { getHoursStatus } from '../lib/hours';
import { getBrowserSupabaseClient } from '../lib/supabaseBrowser';
import { OrderStatusTracker, OrderStatusState } from '../components/OrderStatusTracker';

// ============================================================================
// TYPES
// ============================================================================

type LocationOption = {
  id: string;
  squareLocationId: string;
  name: string;
  isPrimary: boolean;
  address?: string;
  pickupInstructions?: string | null;
  phone?: string | null;
  timezone?: string | null;
  onlineOrderingEnabled?: boolean;
  onlineOrderingLeadTimeMinutes?: number | null;
  onlineOrderingHoursJson?: Record<string, unknown> | null;
};

type Props = {
  vendorSlug: string | null;
  vendorName: string;
  vendor: Vendor | null;
  locations: LocationOption[];
};

type Notice = {
  type: 'info' | 'warning' | 'error';
  message: string;
};

// ============================================================================
// SERVER-SIDE PROPS
// ============================================================================

export const getServerSideProps: GetServerSideProps<Props> = async ({ req }) => {
  const fallback = process.env.DEFAULT_VENDOR_SLUG;
  const vendorSlug = resolveVendorSlugFromHost(req.headers.host, fallback);
  const dataClient = getServerDataClient();
  const rawVendor = vendorSlug ? await dataClient.getVendorBySlug(vendorSlug) : null;
  
  // Sanitize vendor object: JSON.parse(JSON.stringify()) removes undefined values
  // Then we explicitly ensure optional fields are null instead of missing
  const vendor: Vendor | null = rawVendor ? JSON.parse(JSON.stringify({
    id: rawVendor.id,
    slug: rawVendor.slug,
    displayName: rawVendor.displayName,
    squareLocationId: rawVendor.squareLocationId,
    squareCredentialRef: rawVendor.squareCredentialRef ?? null,
    status: rawVendor.status ?? null,
    addressLine1: rawVendor.addressLine1 ?? null,
    addressLine2: rawVendor.addressLine2 ?? null,
    city: rawVendor.city ?? null,
    state: rawVendor.state ?? null,
    postalCode: rawVendor.postalCode ?? null,
    phone: rawVendor.phone ?? null,
    timezone: rawVendor.timezone ?? null,
    pickupInstructions: rawVendor.pickupInstructions ?? null,
    kdsActiveLimitTotal: rawVendor.kdsActiveLimitTotal ?? null,
    kdsActiveLimitCt: rawVendor.kdsActiveLimitCt ?? null,
    // Theming fields
    logoUrl: rawVendor.logoUrl ?? null,
    primaryColor: rawVendor.primaryColor ?? null,
    accentColor: rawVendor.accentColor ?? null,
    fontFamily: rawVendor.fontFamily ?? null,
  })) : null;

  // Fetch locations for the vendor
  let locations: LocationOption[] = [];
  if (rawVendor) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
    
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
        auth: { persistSession: false }
      });
      
      const { data: locationRows } = await supabase
        .from('vendor_locations')
        .select('id, square_location_id, name, is_primary, address_line1, city, state, pickup_instructions, phone, timezone, online_ordering_enabled, online_ordering_lead_time_minutes, online_ordering_hours_json')
        .eq('vendor_id', rawVendor.id)
        .eq('is_active', true)
        .order('is_primary', { ascending: false })
        .order('name', { ascending: true });

      if (locationRows && locationRows.length > 0) {
        locations = locationRows.map(loc => ({
          id: loc.id,
          squareLocationId: loc.square_location_id,
          name: loc.name,
          isPrimary: loc.is_primary,
          address: [loc.address_line1, loc.city, loc.state].filter(Boolean).join(', ') || undefined,
          pickupInstructions: loc.pickup_instructions,
          phone: loc.phone ?? null,
          timezone: loc.timezone ?? null,
          onlineOrderingEnabled: loc.online_ordering_enabled,
          onlineOrderingLeadTimeMinutes: loc.online_ordering_lead_time_minutes ?? null,
          onlineOrderingHoursJson: loc.online_ordering_hours_json ?? null
        }));
      }
    }

    // Fallback to vendor's primary location if no locations configured
    if (locations.length === 0) {
      locations = [{
        id: rawVendor.id,
        squareLocationId: rawVendor.squareLocationId,
        name: rawVendor.displayName,
        isPrimary: true,
        address: [rawVendor.addressLine1, rawVendor.city, rawVendor.state].filter(Boolean).join(', ') || undefined,
        pickupInstructions: rawVendor.pickupInstructions ?? null,
        phone: rawVendor.phone ?? null,
        timezone: rawVendor.timezone ?? null,
        onlineOrderingEnabled: true,
        onlineOrderingLeadTimeMinutes: 15,
        onlineOrderingHoursJson: null
      }];
    }
  }

  return {
    props: {
      vendorSlug: vendorSlug ?? null,
      vendorName: vendor?.displayName ?? 'CountrTop',
      vendor,
      locations
    }
  };
};

// ============================================================================
// HELPERS
// ============================================================================

const formatCurrency = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);

const friendlyError = (err: unknown, fallback: string): string => {
  if (err instanceof Error) {
    if (/failed to fetch|network/i.test(err.message)) return 'Network issue. Please try again.';
    return err.message;
  }
  return typeof err === 'string' && err.trim() ? err : fallback;
};

const buildMapsUrl = (query: string): string => {
  const trimmed = query.trim();
  if (!trimmed) return 'https://www.google.com/maps';
  const isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
  return isIOS
    ? `https://maps.apple.com/?q=${encodeURIComponent(trimmed)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
};

const normalizePhone = (phone: string): string =>
  phone.replace(/[^\d+]/g, '').trim();

// Simple fetch wrapper with error handling
async function apiFetch<T>(url: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? 'Request failed' };
    }
    return { ok: true, data: json };
  } catch (err) {
    return { ok: false, error: friendlyError(err, 'Request failed') };
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function CustomerHome({ vendorSlug, vendorName, vendor, locations }: Props) {
  // ---------------------------------------------------------------------------
  // Core state
  // ---------------------------------------------------------------------------
  const [mounted, setMounted] = useState(false);
  const [supabase, setSupabase] = useState<ReturnType<typeof getBrowserSupabaseClient>>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isNative, setIsNative] = useState(false);

  // Location state - default to primary or first location
  const [selectedLocation, setSelectedLocation] = useState<LocationOption | null>(
    () => locations.find(l => l.isPrimary) ?? locations[0] ?? null
  );
  const hasMultipleLocations = locations.length > 1;

  // Menu state
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [pickupConfirmed, setPickupConfirmed] = useState(false);

  // User data state (orders + loyalty)
  const [orders, setOrders] = useState<OrderHistoryEntry[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  
  // Order tracking state
  const [trackingState, setTrackingState] = useState<{
    state: 'queued_up' | 'working' | 'ready' | 'enjoy';
    shortcode: string | null;
    message: string;
  } | null>(null);
  const [, setTrackingLoading] = useState(false);
  const [loyalty, setLoyalty] = useState<number | null>(null);

  // Track what user data we've loaded to prevent duplicate fetches
  // Pickup confirmation persistence
  useEffect(() => {
    if (!vendorSlug) return;
    const key = `ct_pickup_confirmed_${vendorSlug}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        if (data.expiresAt && new Date(data.expiresAt) > new Date()) {
          setPickupConfirmed(true);
        } else {
          localStorage.removeItem(key);
        }
      } catch {
        localStorage.removeItem(key);
      }
    }
  }, [vendorSlug]);

  // Reset confirmation when vendor changes
  useEffect(() => {
    setPickupConfirmed(false);
  }, [vendorSlug]);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);

  // Order History state
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  const [expandedOrderItems, setExpandedOrderItems] = useState<Record<string, boolean>>({});
  const ORDERS_PER_PAGE = 5;

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------
  const cartTotal = useMemo(() => cart.reduce((sum, i) => sum + i.price * i.quantity, 0), [cart]);
  const cartCurrency = cart[0]?.currency ?? 'USD';
  const appleEnabled = process.env.NEXT_PUBLIC_APPLE_SIGNIN === 'true';
  const recentOrder = useMemo(() => {
    if (orders.length === 0) return null;
    return orders[0]; // Orders are already sorted by date (most recent first)
  }, [orders]);
  const recentOrderDetails = useMemo(() => {
    if (!recentOrder) return null;
    const items = (recentOrder.snapshotJson?.items ?? []) as Array<{ quantity?: number }>;
    const count = items.reduce((s, i) => s + (i.quantity ?? 0), 0);
    const total = typeof recentOrder.snapshotJson?.total === 'number' ? recentOrder.snapshotJson.total : 0;
    const currency = typeof recentOrder.snapshotJson?.currency === 'string' ? recentOrder.snapshotJson.currency : 'USD';
    return { count, total, currency };
  }, [recentOrder]);

  // ---------------------------------------------------------------------------
  // Mount effects
  // ---------------------------------------------------------------------------
  useEffect(() => {
    setMounted(true);
    setSupabase(getBrowserSupabaseClient());
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const ua = navigator.userAgent ?? '';
    if (ua.includes('CountrTop') || (window as any).ReactNativeWebView) {
      setIsNative(true);
    }
  }, [mounted]);

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------
  const postToNative = useCallback((payload: Record<string, unknown>) => {
    const bridge = (window as any).ReactNativeWebView;
    if (bridge?.postMessage) bridge.postMessage(JSON.stringify(payload));
  }, []);

  const { user, status: authStatus, error: authError, signIn, signOut: baseSignOut } = useAuth({
    supabase,
    isNativeWebView: isNative,
    onNativeAuthUpdate: (u) => {
      if (isNative) postToNative({ type: 'ct-auth', userId: u?.id ?? null, email: u?.email ?? null });
    },
    postToNative
  });

  const signOut = useCallback(async () => {
    await baseSignOut();
    setOrders([]);
    setLoyalty(null);
    setLoadedUserId(null);
  }, [baseSignOut]);

  // ---------------------------------------------------------------------------
  // Menu loading
  // ---------------------------------------------------------------------------
  const loadMenu = useCallback(async () => {
    if (!vendorSlug || menuLoading) return;
    setMenuLoading(true);
    setMenuError(null);

    const result = await apiFetch<{ items: MenuItem[] }>(`/api/vendors/${vendorSlug}/catalog`);
    
    if (result.ok) {
      setMenu(result.data.items ?? []);
    } else {
      setMenuError(result.error);
    }
    setMenuLoading(false);
  }, [vendorSlug, menuLoading]);

  // Load menu once on mount
  useEffect(() => {
    if (mounted && vendorSlug && menu.length === 0 && !menuLoading && !menuError) {
      loadMenu();
    }
  }, [mounted, vendorSlug, menu.length, menuLoading, menuError, loadMenu]);

  // ---------------------------------------------------------------------------
  // User data loading (orders + loyalty)
  // Simple pattern: only load when userId changes AND we haven't loaded for this user
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const userId = user?.id;
    
    // If no user, clear data
    if (!userId) {
      if (loadedUserId !== null) {
        setOrders([]);
        setLoyalty(null);
        setLoadedUserId(null);
      }
      return;
    }

    // If we already loaded for this user, skip
    if (loadedUserId === userId) return;

    // Don't load if no vendor
    if (!vendorSlug) return;

    // Load user data
    const load = async () => {
      setOrdersLoading(true);
      setOrdersError(null);

      // Fetch orders
      const ordersResult = await apiFetch<{ orders: OrderHistoryEntry[] }>(
        `/api/vendors/${vendorSlug}/orders?userId=${encodeURIComponent(userId)}`
      );
      if (ordersResult.ok) {
        setOrders(ordersResult.data.orders ?? []);
      } else {
        setOrdersError(ordersResult.error);
      }

      // Fetch loyalty
      const loyaltyResult = await apiFetch<{ balance: number }>(
        `/api/vendors/${vendorSlug}/loyalty/${encodeURIComponent(userId)}`
      );
      if (loyaltyResult.ok) {
        setLoyalty(loyaltyResult.data.balance ?? 0);
      }

      setOrdersLoading(false);
      setLoadedUserId(userId);
    };

    load();
  }, [user?.id, vendorSlug, loadedUserId]);

  // Refresh after checkout
  useEffect(() => {
    if (!mounted || !user?.id || !vendorSlug) return;
    const key = sessionStorage.getItem('ct_refresh_after_checkout');
    if (!key) return;
    sessionStorage.removeItem('ct_refresh_after_checkout');
    // Force reload by clearing loaded user
    setLoadedUserId(null);
  }, [mounted, user?.id, vendorSlug]);

  // Fetch tracking data for recent order
  useEffect(() => {
    if (!mounted || !vendorSlug || !recentOrder) {
      setTrackingState(null);
      return;
    }

    const fetchTracking = async () => {
      setTrackingLoading(true);
      try {
        const result = await apiFetch<{
          tracking: {
            state: 'queued_up' | 'working' | 'ready' | 'enjoy';
            shortcode: string | null;
            status: string;
            message: string;
          };
        }>(`/api/vendors/${vendorSlug}/orders/${recentOrder.squareOrderId}/tracking`);

        if (result.ok) {
          setTrackingState(result.data.tracking);
        } else {
          setTrackingState(null);
        }
      } catch (err) {
        setTrackingState(null);
      } finally {
        setTrackingLoading(false);
      }
    };

    fetchTracking();

    // Poll every 10 seconds for updates
    const interval = setInterval(fetchTracking, 10000);
    return () => clearInterval(interval);
  }, [mounted, vendorSlug, recentOrder?.squareOrderId]);

  // ---------------------------------------------------------------------------
  // Cart actions
  // ---------------------------------------------------------------------------
  const addToCart = (item: MenuItem) => {
    if (!canOrder) {
      setNotice({ type: 'warning', message: 'Ordering is currently unavailable.' });
      return;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) => (i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (id: string) => {
    setCart((prev) =>
      prev.map((i) => (i.id === id ? { ...i, quantity: i.quantity - 1 } : i)).filter((i) => i.quantity > 0)
    );
  };

  const handleCheckout = async () => {
    if (!vendorSlug || cart.length === 0 || checkingOut || !pickupConfirmed || !canOrder) return;
    setCheckoutError(null);
    setCheckingOut(true);

    try {
      const res = await fetch(`/api/vendors/${vendorSlug}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id ?? null,
          locationId: selectedLocation?.squareLocationId,
          items: cart.map((i) => ({
            id: i.id,
            name: i.name,
            price: i.price,
            currency: i.currency,
            quantity: i.quantity,
            variationId: i.variationId
          }))
        })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Checkout failed');

      // Persist pickup confirmation (24h TTL)
      if (vendorSlug) {
        const key = `ct_pickup_confirmed_${vendorSlug}`;
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
        localStorage.setItem(key, JSON.stringify({ expiresAt: expiresAt.toISOString() }));
      }

      sessionStorage.setItem(
        `ct_order_${data.orderId}`,
        JSON.stringify({
          squareOrderId: data.squareOrderId,
          items: cart.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, price: i.price })),
          total: cartTotal,
          currency: cartCurrency,
          pickupLocationName: selectedLocation?.name ?? vendorName,
          pickupAddress: locationAddress,
          pickupInstructions: selectedLocation?.pickupInstructions ?? vendor?.pickupInstructions ?? null,
          contactPhone: contactPhone || null,
          leadTimeMinutes: pickupEtaMinutes ?? null
        })
      );
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setCheckoutError(friendlyError(err, 'Unable to start checkout'));
    } finally {
      setCheckingOut(false);
    }
  };

  const handleReorder = (entry: OrderHistoryEntry) => {
    if (menu.length === 0) {
      setNotice({ type: 'warning', message: 'Menu is still loading.' });
      return;
    }

    const items = (entry.snapshotJson?.items ?? []) as Array<{
      id: string;
      name: string;
      quantity: number;
      price: number;
    }>;
    if (!items.length) {
      setNotice({ type: 'warning', message: 'No items in that order.' });
      return;
    }

    const byId = new Map(menu.map((m) => [m.id, m]));
    const byVar = new Map(menu.map((m) => [m.variationId, m]));
    const newCart: CartItem[] = [];
    let missing = 0;

    for (const item of items) {
      const found = byVar.get(item.id) ?? byId.get(item.id);
      if (found && found.price > 0) {
        newCart.push({ ...found, quantity: item.quantity || 1 });
      } else {
        missing++;
      }
    }

    if (newCart.length === 0) {
      setNotice({ type: 'warning', message: 'Items from that order are no longer available.' });
      return;
    }

    setCart(newCart);
    if (missing > 0) {
      setNotice({ type: 'warning', message: 'Some items are no longer available.' });
    }
  };

  // ---------------------------------------------------------------------------
  // Theme Configuration
  // ---------------------------------------------------------------------------
  const primaryColor = vendor?.primaryColor || '#E85D04';
  const accentColor = vendor?.accentColor || '#FFB627';
  const fontFamily = vendor?.fontFamily || 'DM Sans';
  const logoUrl = vendor?.logoUrl;

  // Build dynamic theme style variables (solid colors, no gradients)
  const themeStyles: React.CSSProperties & Record<string, string> = {
    '--theme-button': primaryColor,
    '--theme-accent': accentColor,
    '--theme-font': `'${fontFamily}', -apple-system, BlinkMacSystemFont, sans-serif`,
  };

  // Ensure theme CSS variables are applied to document root (persists through re-renders)
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.style.setProperty('--theme-button', primaryColor);
      root.style.setProperty('--theme-accent', accentColor);
      root.style.setProperty('--theme-font', `'${fontFamily}', -apple-system, BlinkMacSystemFont, sans-serif`);
    }
  }, [primaryColor, accentColor, fontFamily]);

  // ---------------------------------------------------------------------------
  // Storefront readiness + hours
  // ---------------------------------------------------------------------------
  const vendorAddress = useMemo(
    () =>
      vendor
        ? [vendor.addressLine1, vendor.city, vendor.state, vendor.postalCode].filter(Boolean).join(', ')
        : '',
    [vendor]
  );

  const locationAddress = selectedLocation?.address || vendorAddress;
  const contactPhone = selectedLocation?.phone || vendor?.phone || '';
  const mapsQuery = locationAddress || `${vendorName} ${selectedLocation?.name ?? ''}`.trim();
  const mapsUrl = buildMapsUrl(mapsQuery);

  const hoursStatus = useMemo(
    () => getHoursStatus(
      selectedLocation?.onlineOrderingHoursJson,
      selectedLocation?.timezone ?? vendor?.timezone ?? undefined
    ),
    [selectedLocation?.onlineOrderingHoursJson, selectedLocation?.timezone, vendor?.timezone]
  );

  const onlineOrderingEnabled = selectedLocation?.onlineOrderingEnabled ?? true;
  const pickupEtaMinutes = selectedLocation?.onlineOrderingLeadTimeMinutes ?? 15;

  type StorefrontState = 'ordering' | 'not_accepting' | 'closed' | 'menu_syncing' | 'network_error';
  const storefrontState: StorefrontState = useMemo(() => {
    if (menuError && menu.length === 0) return 'network_error';
    if (!onlineOrderingEnabled || vendor?.status === 'inactive') return 'not_accepting';
    if (hoursStatus?.isOpen === false) return 'closed';
    if (menuLoading && menu.length === 0) return 'menu_syncing';
    if (!menuLoading && menu.length === 0) return 'menu_syncing';
    return 'ordering';
  }, [menuError, menu.length, onlineOrderingEnabled, vendor?.status, hoursStatus?.isOpen, menuLoading]);

  const canOrder = storefrontState === 'ordering';
  const storefrontBadge =
    storefrontState === 'ordering'
      ? 'Ordering available'
      : storefrontState === 'not_accepting'
        ? 'Not accepting orders'
        : storefrontState === 'closed'
          ? 'Closed'
          : storefrontState === 'menu_syncing'
            ? 'Menu syncing'
            : 'Network issue';

  const storefrontMessage =
    storefrontState === 'ordering'
      ? 'Ordering is available. Add items below to place a pickup order.'
      : storefrontState === 'not_accepting'
        ? 'Online ordering is currently paused. You can still contact the restaurant or visit in person.'
        : storefrontState === 'closed'
          ? hoursStatus?.nextOpenLabel ?? 'We are currently closed. Please check back during business hours.'
          : storefrontState === 'menu_syncing'
            ? 'We are syncing the latest menu from the POS. Please check back shortly.'
            : menuError ?? 'We are having trouble loading the menu. Please try again.';

  const storefrontActionLabel =
    storefrontState === 'network_error' || storefrontState === 'menu_syncing' ? 'Refresh menu' : '';

  const hoursDetail =
    hoursStatus?.openUntilLabel ??
    hoursStatus?.nextOpenLabel ??
    hoursStatus?.hoursSummary ??
    'Hours unavailable';

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <>
      <Head>
        <title>{`${vendorName} · CountrTop`}</title>
        {/* Load Google Fonts if using a non-system font */}
        {fontFamily && !['SF Pro Display', 'system-ui', 'DM Sans', 'Anybody'].includes(fontFamily) && (
          <link
            href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@400;500;600;700&display=swap`}
            rel="stylesheet"
          />
        )}
      </Head>
      <main className="page" style={themeStyles}>
        <div className="page-content">
          {/* Hero */}
          <header className="hero-header">
            <div className="hero-content">
              {logoUrl && (
                <img src={logoUrl} alt={vendorName} className="vendor-logo" />
              )}
              <p className="eyebrow">CountrTop</p>
              <h1 className="title">{vendorName}</h1>
              <p className="subtitle">Order fast, earn points, get notified when ready.</p>
              <div className="badges">
                <span className="badge">Square checkout</span>
                <span className="badge">Pickup only</span>
                {(hoursStatus?.isOpen === true || hoursStatus?.isOpen === false) && (
                  <span className={`badge badge-status ${hoursStatus.isOpen ? 'open' : 'closed'}`}>
                    {hoursStatus.isOpen ? 'Open now' : 'Closed'}
                  </span>
                )}
              </div>
            </div>
          </header>


        {/* Notice */}
        {notice && (
          <div className={`notice notice-${notice.type}`}>
            <span>{notice.message}</span>
            <button onClick={() => setNotice(null)}>Dismiss</button>
          </div>
        )}

        {/* Main content */}
        <div className="content">
          {/* Location Selector (when multiple locations) */}
          {hasMultipleLocations && (
            <section className="card location-selector">
              <div className="location-header">
                <h2>📍 Select Location</h2>
              </div>
              <div className="location-options">
                {locations.map((loc) => (
                  <button
                    key={loc.id}
                    className={`location-option ${selectedLocation?.id === loc.id ? 'selected' : ''}`}
                    onClick={() => setSelectedLocation(loc)}
                    type="button"
                  >
                    <div className="location-option-name">
                      {loc.name}
                      {loc.isPrimary && <span className="primary-badge">Primary</span>}
                      {loc.onlineOrderingEnabled === false && (
                        <span className="ordering-paused">Ordering paused</span>
                      )}
                    </div>
                    {loc.address && <div className="location-option-address">{loc.address}</div>}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Vendor Info */}
          {vendor && (selectedLocation?.address || selectedLocation?.pickupInstructions) && (
            <section className="card vendor-info">
              {selectedLocation?.address && (
                <div className="vendor-address">
                  <div className="info-label">📍 {selectedLocation?.name || 'Location'}</div>
                  {(() => {
                    const fullAddress = selectedLocation.address || '';
                    const isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
                    const mapsUrl = isIOS
                      ? `https://maps.apple.com/?q=${encodeURIComponent(fullAddress)}`
                      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;
                    return (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="info-content vendor-address-link"
                      >
                        {fullAddress}
                      </a>
                    );
                  })()}
                </div>
              )}
              {selectedLocation?.pickupInstructions && (
                <div className="vendor-pickup">
                  <div className="info-label">Pickup Instructions</div>
                  <div className="info-content">{selectedLocation.pickupInstructions}</div>
                </div>
              )}
            </section>
          )}

          {/* Storefront Readiness Gate */}
          <section className="card readiness-gate">
            <div className="gate-header">
              <div>
                <h2>Storefront Status</h2>
                <p className="muted">
                  {vendorName}{selectedLocation?.name ? ` · ${selectedLocation.name}` : ''}
                </p>
              </div>
              <span className={`status-pill status-${storefrontState}`}>{storefrontBadge}</span>
            </div>
            <p className="gate-message">{storefrontMessage}</p>
            <div className="gate-details">
              <div className="detail-item">
                <div className="detail-label">Hours</div>
                <div className="detail-value">{hoursDetail}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Contact</div>
                <div className="detail-value">
                  {contactPhone ? (
                    <a href={`tel:${normalizePhone(contactPhone)}`} className="detail-link">
                      {contactPhone}
                    </a>
                  ) : (
                    <span className="muted">Contact the restaurant directly</span>
                  )}
                </div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Map</div>
                <div className="detail-value">
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="detail-link">
                    Open in Maps
                  </a>
                </div>
              </div>
            </div>
            {storefrontActionLabel && (
              <button type="button" onClick={loadMenu} className="btn-secondary gate-action">
                {storefrontActionLabel}
              </button>
            )}
          </section>

          {/* Account */}
          <section className="card account">
            <div className="card-header">
              <h2>Account</h2>
              {user && <button onClick={signOut} className="btn-secondary">Sign out</button>}
            </div>
            {!mounted && <p className="muted">Loading…</p>}
            {mounted && !supabase && (
              <p className="muted">Sign-in not available (auth not configured)</p>
            )}
            {user ? (
              <div className="account-info">
                <div>
                  <div className="label">Signed in</div>
                  <div className="muted">{user.email ?? user.id}</div>
                </div>
                <div className="points">{loyalty !== null ? `${loyalty} pts` : '—'}</div>
              </div>
            ) : (
              mounted && supabase && (
                <div className="auth-buttons">
                  {appleEnabled && (
                    <button onClick={() => signIn('apple')} className="btn-auth">
                      Sign in with Apple
                    </button>
                  )}
                  <button onClick={() => signIn('google')} className="btn-auth">
                    Sign in with Google
                  </button>
                </div>
              )
            )}
            {authError && <p className="error">{authError}</p>}
          </section>

          {/* Order History */}
          <section className="card history">
            <div 
              className="card-header history-header" 
              style={{ cursor: 'pointer' }}
              onClick={() => setHistoryExpanded(!historyExpanded)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <h2 style={{ margin: 0 }}>Order History</h2>
                <span className="muted">{user ? `${orders.length} orders` : 'Sign in'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ transform: historyExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
              </div>
            </div>
            {historyExpanded && (
              <>
                {!user && authStatus === 'ready' && (
                  <p className="muted">Sign in to see past orders.</p>
                )}
                {user && ordersLoading && <p className="muted">Loading orders…</p>}
                {user && ordersError && <p className="error">{ordersError}</p>}
                {user && !ordersLoading && orders.length === 0 && (
                  <p className="muted">No orders yet.</p>
                )}
                {user && !ordersLoading && orders.length > 0 && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setLoadedUserId(null);
                        }}
                        className="btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '14px' }}
                        disabled={ordersLoading}
                      >
                        {ordersLoading ? 'Loading...' : 'Refresh'}
                      </button>
                    </div>
                    {orders.slice(historyPage * ORDERS_PER_PAGE, (historyPage + 1) * ORDERS_PER_PAGE).map((order) => {
                      const items = (order.snapshotJson?.items ?? []) as Array<{ quantity?: number }>;
                      const count = items.reduce((s, i) => s + (i.quantity ?? 0), 0);
                      const total = typeof order.snapshotJson?.total === 'number' ? order.snapshotJson.total : 0;
                      const currency = typeof order.snapshotJson?.currency === 'string' ? order.snapshotJson.currency : 'USD';
                      const dateTime = new Date(order.placedAt);
                      const formattedDateTime = dateTime.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      });
                      const isExpanded = expandedOrderItems[order.id] || false;
                      const parseItems = (snapshot: Record<string, unknown> | null): Array<{ name: string; quantity: number }> => {
                        if (!snapshot || typeof snapshot !== 'object') return [];
                        const items = (snapshot.items as unknown[]) || (snapshot.line_items as unknown[]) || [];
                        return items.map((item: unknown) => {
                          const itemObj = item as Record<string, unknown> | null;
                          return {
                            name: (itemObj?.name as string) || 'Item',
                            quantity: (itemObj?.quantity as number) || 1
                          };
                        });
                      };
                      const orderItems = parseItems(order.snapshotJson);

                      return (
                        <div key={order.id} className="history-item">
                          <div style={{ flex: 1 }}>
                            <div style={{ marginBottom: '4px' }}>
                              <div className="label">Order {order.squareOrderId.slice(-6)}</div>
                            </div>
                            <div className="muted">
                              {formattedDateTime} · {count} items · {formatCurrency(total, currency)}
                            </div>
                            {isExpanded && orderItems.length > 0 && (
                              <div className="order-items-list" style={{ marginTop: '8px' }}>
                                {orderItems.map((item, idx) => (
                                  <div key={idx} className="order-item">
                                    <span className="item-quantity">{item.quantity}×</span>
                                    <span className="item-name">{item.name}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button
                              onClick={() => setExpandedOrderItems(prev => ({ ...prev, [order.id]: !isExpanded }))}
                              className="btn-secondary"
                              style={{ padding: '6px 12px', fontSize: '14px' }}
                            >
                              {isExpanded ? 'Hide' : 'Items'}
                            </button>
                            <button onClick={() => handleReorder(order)} className="btn-secondary">
                              Reorder
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {orders.length > ORDERS_PER_PAGE && (
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '16px' }}>
                        <button
                          onClick={() => setHistoryPage(Math.max(0, historyPage - 1))}
                          className="btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '14px' }}
                          disabled={historyPage === 0}
                        >
                          Previous
                        </button>
                        <span className="muted" style={{ fontSize: '14px' }}>
                          Page {historyPage + 1} of {Math.ceil(orders.length / ORDERS_PER_PAGE)}
                        </span>
                        <button
                          onClick={() => setHistoryPage(Math.min(Math.ceil(orders.length / ORDERS_PER_PAGE) - 1, historyPage + 1))}
                          className="btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '14px' }}
                          disabled={historyPage >= Math.ceil(orders.length / ORDERS_PER_PAGE) - 1}
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </section>

          {/* Order Tracking */}
          <section className="order-tracking">
            {!mounted && <div className="card"><p className="muted">Loading…</p></div>}
            {mounted && !user && (
              <div className="card">
                <div className="card-header"><h2>Order Tracking</h2></div>
                <p className="muted">Sign in to track orders.</p>
              </div>
            )}
            {user && ordersLoading && <div className="card"><p className="muted">Loading orders…</p></div>}
            {user && ordersError && <div className="card"><p className="error">{ordersError}</p></div>}
            {user && !ordersLoading && !recentOrder && (
              <div className="card">
                <div className="card-header"><h2>Order Tracking</h2></div>
                <p className="muted">No active orders.</p>
              </div>
            )}
            {user && !ordersLoading && recentOrder && recentOrderDetails && (() => {
              // Auto-hide if completed >30 minutes ago
              const shouldShow = !recentOrder.completedAt || (() => {
                const completed = new Date(recentOrder.completedAt);
                const now = new Date();
                const minutesSince = (now.getTime() - completed.getTime()) / 60000;
                return minutesSince <= 30;
              })();
              
              if (!shouldShow) return null;

              // Parse items from snapshot
              const parseItems = (snapshot: Record<string, unknown> | null): Array<{ name: string; quantity: number; price?: number }> => {
                if (!snapshot || typeof snapshot !== 'object') return [];
                const items = (snapshot.items as unknown[]) || (snapshot.line_items as unknown[]) || [];
                return items.map((item: unknown) => {
                  const itemObj = item as Record<string, unknown> | null;
                  return {
                    name: (itemObj?.name as string) || 'Item',
                    quantity: (itemObj?.quantity as number) || 1,
                    price: (itemObj?.price as number) || undefined
                  };
                });
              };

              const items = parseItems(recentOrder.snapshotJson);
              
              // Map tracking state to OrderStatusState
              const mapTrackingToStatus = (): OrderStatusState => {
                if (!trackingState) return 'placed';
                switch (trackingState.state) {
                  case 'queued_up': return 'placed';
                  case 'working': return 'preparing';
                  case 'ready': return 'ready';
                  case 'enjoy': return 'completed';
                  default: return 'placed';
                }
              };

              return (
                <OrderStatusTracker
                  status={mapTrackingToStatus()}
                  shortcode={trackingState?.shortcode}
                  orderId={recentOrder.squareOrderId}
                  items={items}
                  total={recentOrderDetails.total}
                  currency={recentOrderDetails.currency}
                  placedAt={recentOrder.placedAt}
                  compact={true}
                />
              );
            })()}
          </section>

          {/* Cart */}
          <aside className="card cart">
            <div className="card-header">
              <h2>Your Cart</h2>
              <span className="muted">{cart.length} items</span>
            </div>
            {cart.length === 0 ? (
              <p className="muted">
                {canOrder ? 'Add items to start your order.' : 'Ordering is currently unavailable.'}
              </p>
            ) : (
              <div className="cart-items">
                {cart.map((item) => (
                  <div key={item.id} className="cart-item">
                    <div>
                      <div className="label">{item.name}</div>
                      <div className="muted">
                        {formatCurrency(item.price, item.currency)} × {item.quantity}
                      </div>
                    </div>
                    <div className="cart-actions">
                      <button onClick={() => removeFromCart(item.id)}>−</button>
                      <button onClick={() => addToCart(item)}>+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="cart-footer">
              <div className="cart-total">
                <span>Total</span>
                <strong>{formatCurrency(cartTotal, cartCurrency)}</strong>
              </div>
              {canOrder && (
                <div className="pickup-eta">
                  Pickup ETA: ~{pickupEtaMinutes} min
                </div>
              )}
              {locationAddress && (
                <label className="pickup-confirmation">
                  <input
                    type="checkbox"
                    checked={pickupConfirmed}
                    onChange={(e) => setPickupConfirmed(e.target.checked)}
                  />
                  <span>
                    I confirm I&apos;m picking up at: {selectedLocation?.name ?? vendorName} - {locationAddress}
                  </span>
                </label>
              )}
              <p className="no-account-label">No account needed — Square Checkout</p>
              <button
                onClick={handleCheckout}
                disabled={cart.length === 0 || checkingOut || !pickupConfirmed || !canOrder}
                className="btn-checkout"
              >
                {checkingOut ? 'Processing…' : 'Checkout with Square'}
              </button>
              {checkoutError && <p className="error">{checkoutError}</p>}
            </div>
          </aside>

          {/* Menu */}
          <section className="menu-section">
            <div className="card-header">
              <h2>Menu</h2>
              <button onClick={loadMenu} className="btn-secondary" disabled={menuLoading}>
                {menuLoading ? 'Loading…' : 'Refresh'}
              </button>
            </div>
            {menuError && <p className="error">{menuError}</p>}
            <div className="menu-grid">
              {menu.map((item) => (
                <div key={item.id} className="menu-card">
                  <div className="menu-image">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} />
                    ) : (
                      <span className="placeholder">☕</span>
                    )}
                  </div>
                  <div className="menu-info">
                    <div className="menu-row">
                      <h3>{item.name}</h3>
                      <span className="price">{formatCurrency(item.price, item.currency)}</span>
                    </div>
                    <p className="muted">{item.description ?? 'Fresh and delicious.'}</p>
                  </div>
                  <button onClick={() => addToCart(item)} className="btn-primary" disabled={!canOrder}>
                    {canOrder ? 'Add to cart' : 'Ordering unavailable'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
        </div>
      </main>

      {/* Styles must be outside main to persist through re-renders */}
      <style jsx global>{`
          .page {
            min-height: 100vh;
            background: var(--ct-bg-primary);
            color: var(--ct-text);
            font-family: var(--theme-font, var(--font-body));
          }

          .page-content {
            width: 100%;
          }

          @media (min-width: 1000px) {
            .page-content {
              max-width: 80vw;
              margin: 0 auto;
            }
          }

          .hero-header {
            padding: 48px 24px 32px;
          }

          .hero-content {
            max-width: 500px;
          }

          .vendor-logo {
            width: 80px;
            height: 80px;
            border-radius: 16px;
            object-fit: cover;
            margin-bottom: 16px;
            border: 2px solid var(--color-border);
          }

          .eyebrow {
            text-transform: uppercase;
            letter-spacing: 3px;
            font-size: 11px;
            color: var(--theme-accent, var(--color-accent));
            margin: 0 0 8px;
          }

          .title {
            font-size: 36px;
            font-weight: 700;
            margin: 0 0 8px;
            background: var(--theme-button, var(--color-primary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .subtitle {
            font-size: 16px;
            color: var(--color-text-muted);
            margin: 0 0 16px;
          }

          .badges {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }

          .badge {
            background: var(--color-bg-warm);
            border: 1px solid var(--color-border);
            color: var(--color-text-muted);
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
          }

          .badge-status.open {
            background: rgba(16, 185, 129, 0.15);
            border-color: rgba(16, 185, 129, 0.35);
            color: #0f766e;
          }

          .badge-status.closed {
            background: rgba(239, 68, 68, 0.12);
            border-color: rgba(239, 68, 68, 0.35);
            color: #b91c1c;
          }

          .ordering-paused {
            margin-left: 8px;
            font-size: 11px;
            color: #f59e0b;
            background: rgba(245, 158, 11, 0.15);
            padding: 2px 6px;
            border-radius: 10px;
          }

          .readiness-gate {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }

          .gate-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
          }

          .status-pill {
            padding: 6px 12px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 600;
            border: 1px solid var(--color-border);
            background: var(--color-bg-warm);
            color: var(--color-text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .status-ordering {
            background: rgba(16, 185, 129, 0.15);
            border-color: rgba(16, 185, 129, 0.35);
            color: #0f766e;
          }

          .status-closed,
          .status-not_accepting,
          .status-network_error {
            background: rgba(239, 68, 68, 0.12);
            border-color: rgba(239, 68, 68, 0.3);
            color: #b91c1c;
          }

          .status-menu_syncing {
            background: rgba(59, 130, 246, 0.12);
            border-color: rgba(59, 130, 246, 0.35);
            color: #1d4ed8;
          }

          .gate-message {
            font-size: 14px;
            color: var(--color-text);
            margin: 0;
          }

          .gate-details {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 12px;
          }

          .detail-item {
            display: flex;
            flex-direction: column;
            gap: 4px;
            font-size: 13px;
          }

          .detail-label {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            color: var(--color-text-muted);
          }

          .detail-link {
            color: var(--theme-accent, var(--color-accent));
            text-decoration: none;
          }

          .detail-link:hover {
            text-decoration: underline;
          }

          .gate-action {
            align-self: flex-start;
          }

          .vendor-info {
            display: flex;
            flex-direction: column;
            gap: 20px;
          }

          .vendor-address,
          .vendor-pickup {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .info-label {
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--theme-accent, var(--color-accent));
          }

          .info-content {
            font-size: 14px;
            line-height: 1.6;
            color: var(--color-text);
            white-space: pre-line;
          }

          .vendor-address-link {
            text-decoration: none;
            color: var(--theme-accent, var(--color-accent));
            transition: color 0.2s;
          }

          .vendor-address-link:hover {
            color: var(--theme-accent, var(--color-primary));
            text-decoration: underline;
          }

          .phone-link {
            color: var(--theme-accent, var(--color-accent));
            text-decoration: none;
          }

          .phone-link:hover {
            text-decoration: underline;
          }

          .notice {
            margin: 0 24px 16px;
            padding: 12px 16px;
            border-radius: 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .notice button {
            background: none;
            border: none;
            color: inherit;
            font-weight: 600;
            cursor: pointer;
          }

          .notice-warning {
            background: #fef3c7;
            color: #92400e;
          }

          .notice-error {
            background: #fee2e2;
            color: #991b1b;
          }

          .notice-info {
            background: #dbeafe;
            color: #1e40af;
          }

          .content {
            display: grid;
            grid-template-columns: 1fr 300px;
            grid-template-areas:
              'location-selector cart'
              'vendor-info cart'
              'account cart'
              'order-tracking cart'
              'menu cart'
              'history cart';
            gap: 20px;
            padding: 0 24px 48px;
            max-width: 1200px;
            margin: 0 auto;
          }

          @media (max-width: 800px) {
            .content {
              grid-template-columns: 1fr;
              grid-template-areas:
                'location-selector'
                'vendor-info'
                'account'
                'order-tracking'
                'cart'
                'menu'
                'history';
            }
          }

          .location-selector {
            grid-area: location-selector;
          }

          .location-header h2 {
            font-size: 16px;
            font-weight: 600;
            margin: 0 0 12px;
          }

          .location-options {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .location-option {
            background: var(--ct-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 12px;
            padding: 14px 16px;
            text-align: left;
            cursor: pointer;
            transition: all 0.2s;
            color: var(--color-text);
            font-family: inherit;
          }

          .location-option:hover {
            background: var(--color-bg-warm);
            border-color: rgba(232, 93, 4, 0.25);
          }

          .location-option.selected {
            background: rgba(232, 93, 4, 0.12);
            border-color: var(--theme-button, var(--color-primary));
          }

          .location-option-name {
            font-weight: 600;
            font-size: 15px;
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .location-option .primary-badge {
            font-size: 10px;
            text-transform: uppercase;
            background: rgba(232, 93, 4, 0.18);
            color: var(--theme-button, var(--color-primary));
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: 600;
          }

          .location-option-address {
            font-size: 13px;
            color: var(--color-text-muted);
            margin-top: 4px;
          }

          .account {
            grid-area: account;
          }

          .vendor-info {
            grid-area: vendor-info;
          }

          .order-tracking {
            grid-area: order-tracking;
          }

          .cart {
            grid-area: cart;
            position: sticky;
            top: 24px;
            align-self: start;
          }

          @media (max-width: 800px) {
            .cart {
              position: static;
            }
          }

          .menu-section {
            grid-area: menu;
            margin-top: 32px;
            margin-bottom: 32px;
          }

          .history {
            grid-area: history;
          }

          .order-items-list {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .order-item {
            display: flex;
            gap: 8px;
            font-size: 13px;
            color: var(--color-text);
          }

          .order-item .item-quantity {
            font-weight: 600;
            color: var(--theme-accent, var(--color-accent));
            min-width: 24px;
          }

          .order-item .item-name {
            color: var(--color-text);
          }

          .order-item-more {
            font-size: 12px;
            color: var(--color-text-muted);
            margin-top: 4px;
          }

          .pickup-confirmation {
            display: flex;
            gap: 8px;
            align-items: flex-start;
            font-size: 13px;
            color: var(--color-text);
            margin: 12px 0;
            cursor: pointer;
          }

          .pickup-confirmation input[type="checkbox"] {
            margin-top: 2px;
            cursor: pointer;
          }

          .no-account-label {
            font-size: 12px;
            color: var(--color-text-muted);
            margin: 8px 0;
            text-align: center;
          }

          .card {
            background: var(--ct-bg-surface);
            border: 1px solid var(--ct-card-border);
            border-radius: 20px;
            padding: 20px;
            box-shadow: var(--ct-card-shadow);
          }

          .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
          }

          .card-header h2 {
            font-size: 18px;
            margin: 0;
          }

          .muted {
            color: var(--color-text-muted);
            font-size: 13px;
            margin: 0;
          }

          .error {
            color: #f87171;
            font-size: 13px;
            margin: 8px 0 0;
          }

          .label {
            font-weight: 600;
            font-size: 14px;
          }

          .account-info {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .order-tracking-info {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .tracking-ladder {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
            padding: 24px;
            background: var(--color-bg-warm);
            border-radius: 16px;
            border: 1px solid var(--color-border);
            margin-top: 12px;
          }

          .tracking-state-ready {
            background: rgba(52, 199, 89, 0.1);
            border-color: rgba(52, 199, 89, 0.3);
          }

          .tracking-state-enjoy {
            background: rgba(255, 159, 10, 0.1);
            border-color: rgba(255, 159, 10, 0.3);
          }

          .tracking-icon {
            font-size: 48px;
            line-height: 1;
          }

          .tracking-message {
            font-size: 18px;
            font-weight: 600;
            color: var(--color-text);
            text-align: center;
          }

          .tracking-shortcode-label {
            font-size: 14px;
            font-weight: 500;
            color: var(--color-text-muted);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-top: 8px;
          }

          .tracking-shortcode {
            font-size: 72px;
            font-weight: 900;
            text-align: center;
            background: var(--theme-button, var(--color-primary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            line-height: 1;
            padding: 8px 0;
            letter-spacing: 4px;
          }

          .tracking-progress {
            display: flex;
            gap: 12px;
            margin-top: 8px;
          }

          .progress-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.2);
            transition: all 0.3s;
          }

          .progress-dot.active {
            background: var(--theme-button, var(--color-primary));
            box-shadow: 0 0 8px rgba(232, 93, 4, 0.4);
            transform: scale(1.2);
          }

          .points {
            background: var(--theme-button, var(--color-primary));
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: 700;
            font-size: 13px;
          }

          .auth-buttons {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }

          .btn-auth {
            padding: 14px;
            border-radius: 12px;
            border: 1px solid var(--color-border);
            background: var(--ct-bg-surface);
            color: var(--color-text);
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
          }

          .btn-auth:hover {
            background: var(--color-bg-warm);
          }

          .btn-primary {
            width: 100%;
            padding: 12px;
            border-radius: 12px;
            border: none;
            background: var(--theme-button, var(--color-primary));
            color: #fff;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.1s, opacity 0.2s;
          }

          .btn-primary:hover {
            opacity: 0.9;
          }

          .btn-primary:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
          }

          .btn-primary:active {
            transform: scale(0.98);
          }

          .btn-secondary {
            padding: 8px 16px;
            border-radius: 20px;
            border: 1px solid var(--color-border);
            background: transparent;
            color: var(--color-text);
            font-size: 13px;
            cursor: pointer;
            transition: background 0.2s;
          }

          .btn-secondary:hover {
            background: var(--color-bg-warm);
          }

          .btn-secondary:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .cart-items {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .cart-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: var(--color-bg-warm);
            border-radius: 12px;
          }

          .cart-actions {
            display: flex;
            gap: 8px;
          }

          .cart-actions button {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            border: 1px solid var(--color-border);
            background: transparent;
            color: var(--color-text);
            font-size: 18px;
            cursor: pointer;
          }

          .cart-actions button:hover {
            background: var(--color-bg-warm);
          }

          .cart-footer {
            margin-top: 16px;
            padding-top: 16px;
            border-top: 1px solid var(--color-border);
          }

          .cart-total {
            display: flex;
            justify-content: space-between;
            font-size: 16px;
            margin-bottom: 12px;
          }

          .pickup-eta {
            font-size: 13px;
            color: var(--color-text-muted);
            margin-bottom: 12px;
          }

          .btn-checkout {
            width: 100%;
            padding: 16px;
            border-radius: 14px;
            border: none;
            background: var(--ct-gradient-primary);
            color: #fff;
            font-weight: 700;
            font-size: 15px;
            cursor: pointer;
            transition: opacity 0.2s;
          }

          .btn-checkout:hover:not(:disabled) {
            opacity: 0.9;
          }

          .btn-checkout:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .menu-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 16px;
            margin-top: 16px;
          }

          .menu-card {
            background: var(--ct-bg-surface);
            border: 1px solid var(--ct-card-border);
            border-radius: 16px;
            padding: 24px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            min-height: 200px;
            box-shadow: var(--ct-card-shadow);
            transition: box-shadow 0.2s ease, border-color 0.2s ease;
          }

          .menu-card:hover {
            border-color: rgba(232, 93, 4, 0.22);
            box-shadow: var(--ct-card-shadow-hover);
          }

          .menu-image {
            height: 120px;
            border-radius: 12px;
            background: var(--ct-bg-surface-warm);
            border: 1px solid var(--ct-card-border);
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }

          .menu-image img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .placeholder {
            font-size: 32px;
          }

          .menu-info {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .menu-info .muted {
            line-height: 1.6;
            min-height: 3.2em;
          }

          .menu-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 8px;
          }

          .menu-row h3 {
            font-size: 15px;
            margin: 0;
          }

          .price {
            font-weight: 700;
            color: var(--theme-accent, var(--color-accent));
          }

          .history-header {
            user-select: none;
          }

          .history-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px;
            background: var(--color-bg-warm);
            border-radius: 12px;
            margin-top: 12px;
          }
        `}</style>
    </>
  );
}
