import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { resolveVendorSlugFromHost } from '@countrtop/data';
import { CartItem, MenuItem, OrderHistoryEntry, Vendor } from '@countrtop/models';
import { useAuth } from '@countrtop/ui';
import { getServerDataClient } from '../lib/dataClient';
import { getBrowserSupabaseClient } from '../lib/supabaseBrowser';

// ============================================================================
// TYPES
// ============================================================================

type Props = {
  vendorSlug: string | null;
  vendorName: string;
  vendor: Vendor | null;
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
  const vendor = vendorSlug ? await dataClient.getVendorBySlug(vendorSlug) : null;

  return {
    props: {
      vendorSlug: vendorSlug ?? null,
      vendorName: vendor?.displayName ?? 'CountrTop',
      vendor: vendor ?? null
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

export default function CustomerHome({ vendorSlug, vendorName, vendor }: Props) {
  // ---------------------------------------------------------------------------
  // Core state
  // ---------------------------------------------------------------------------
  const [mounted, setMounted] = useState(false);
  const [supabase, setSupabase] = useState<ReturnType<typeof getBrowserSupabaseClient>>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isNative, setIsNative] = useState(false);

  // Menu state
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

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
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [loyalty, setLoyalty] = useState<number | null>(null);

  // Track what user data we've loaded to prevent duplicate fetches
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);

  // Order History state
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
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
    if (!vendorSlug || cart.length === 0 || checkingOut) return;
    setCheckoutError(null);
    setCheckingOut(true);

    try {
      const res = await fetch(`/api/vendors/${vendorSlug}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id ?? null,
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

      sessionStorage.setItem(
        `ct_order_${data.orderId}`,
        JSON.stringify({
          squareOrderId: data.squareOrderId,
          items: cart.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, price: i.price })),
          total: cartTotal,
          currency: cartCurrency
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
  // Render
  // ---------------------------------------------------------------------------
  return (
    <>
      <Head>
        <title>{`${vendorName} · CountrTop`}</title>
      </Head>
      <main className="page">
        <div className="page-content">
          {/* Hero */}
          <header className="hero-header">
            <div className="hero-content">
              <p className="eyebrow">CountrTop</p>
              <h1 className="title">{vendorName}</h1>
              <p className="subtitle">Order fast, earn points, get notified when ready.</p>
              <div className="badges">
                <span className="badge">Square checkout</span>
                <span className="badge">Pickup only</span>
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
          {/* Vendor Info */}
          {vendor && (vendor.addressLine1 || vendor.city || vendor.pickupInstructions) && (
            <section className="card vendor-info">
              {vendor.addressLine1 && (
                <div className="vendor-address">
                  <div className="info-label">Location</div>
                  <div className="info-content">
                    {vendor.addressLine1}
                    {vendor.addressLine2 && <>{'\n'}{vendor.addressLine2}</>}
                    {vendor.city && (
                      <>
                        {'\n'}
                        {vendor.city}
                        {vendor.state && `, ${vendor.state}`}
                        {vendor.postalCode && ` ${vendor.postalCode}`}
                      </>
                    )}
                    {vendor.phone && (
                      <>
                        {'\n'}
                        <a href={`tel:${vendor.phone}`} className="phone-link">{vendor.phone}</a>
                      </>
                    )}
                  </div>
                </div>
              )}
              {vendor.pickupInstructions && (
                <div className="vendor-pickup">
                  <div className="info-label">Pickup Instructions</div>
                  <div className="info-content">{vendor.pickupInstructions}</div>
                </div>
              )}
            </section>
          )}

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

          {/* Order Tracking */}
          <section className="card order-tracking">
            <div className="card-header">
              <h2>Order Tracking</h2>
            </div>
            {!mounted && <p className="muted">Loading…</p>}
            {mounted && !user && (
              <p className="muted">Sign in to track orders.</p>
            )}
            {user && ordersLoading && <p className="muted">Loading orders…</p>}
            {user && ordersError && <p className="error">{ordersError}</p>}
            {user && !ordersLoading && !recentOrder && (
              <p className="muted">No orders yet.</p>
            )}
            {user && !ordersLoading && recentOrder && recentOrderDetails && (
              <div className="order-tracking-info">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <div className="label">Order {recentOrder.squareOrderId.slice(-6)}</div>
                    {recentOrder.fulfillmentStatus && (() => {
                      const status = recentOrder.fulfillmentStatus;
                      const badgeClass = status === 'PLACED' ? 'ct-badge-placed' : status === 'READY' ? 'ct-badge-ready' : (status === 'COMPLETE' || status === 'COMPLETED') ? 'ct-badge-complete' : 'ct-badge-placed';
                      const badgeLabel = status === 'PLACED' ? 'Placed' : status === 'READY' ? 'Ready' : (status === 'COMPLETE' || status === 'COMPLETED') ? 'Complete' : 'Placed';
                      return <span className={`ct-badge ${badgeClass}`}>{badgeLabel}</span>;
                    })()}
                  </div>
                  <div className="muted">
                    {new Date(recentOrder.placedAt).toLocaleDateString()} · {recentOrderDetails.count} items · {formatCurrency(recentOrderDetails.total, recentOrderDetails.currency)}
                  </div>
                </div>
                {trackingLoading && <p className="muted" style={{ marginTop: '12px' }}>Loading tracking...</p>}
                {!trackingLoading && trackingState && (
                  <div className={`tracking-ladder tracking-state-${trackingState.state}`} style={{ marginTop: '16px' }}>
                    <div className="tracking-icon">
                      {trackingState.state === 'queued_up' && '⏳'}
                      {trackingState.state === 'working' && '👨‍🍳'}
                      {trackingState.state === 'ready' && '✅'}
                      {trackingState.state === 'enjoy' && '🎉'}
                    </div>
                    <div className="tracking-message">{trackingState.message}</div>
                    {trackingState.state === 'ready' && trackingState.shortcode && (
                      <>
                        <div className="tracking-shortcode-label">Your code</div>
                        <div className="tracking-shortcode">{trackingState.shortcode}</div>
                      </>
                    )}
                    {(trackingState.state === 'queued_up' || trackingState.state === 'working') && (
                      <div className="tracking-progress">
                        <div className={`progress-dot ${trackingState.state === 'queued_up' ? 'active' : ''}`}></div>
                        <div className={`progress-dot ${trackingState.state === 'working' ? 'active' : ''}`}></div>
                        <div className="progress-dot"></div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Cart */}
          <aside className="card cart">
            <div className="card-header">
              <h2>Your Cart</h2>
              <span className="muted">{cart.length} items</span>
            </div>
            {cart.length === 0 ? (
              <p className="muted">Add items to start your order.</p>
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
              <button
                onClick={handleCheckout}
                disabled={cart.length === 0 || checkingOut}
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
                  <button onClick={() => addToCart(item)} className="btn-primary">
                    Add to cart
                  </button>
                </div>
              ))}
              {!menuLoading && menu.length === 0 && <p className="muted">No menu items yet.</p>}
            </div>
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
                      const status = order.fulfillmentStatus ?? 'PLACED';
                      const statusLabels: Record<string, string> = {
                        PLACED: 'Placed',
                        READY: 'Ready',
                        COMPLETE: 'Complete'
                      };
                      const statusColors: Record<string, string> = {
                        PLACED: '#888',
                        READY: '#fbbf24',
                        COMPLETE: '#4ade80'
                      };
                      return (
                        <div key={order.id} className="history-item">
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <div className="label">Order {order.squareOrderId.slice(-6)}</div>
                              <span
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  textTransform: 'uppercase',
                                  backgroundColor: `${statusColors[status]}20`,
                                  color: statusColors[status],
                                  border: `1px solid ${statusColors[status]}40`
                                }}
                              >
                                {statusLabels[status] || status}
                              </span>
                            </div>
                            <div className="muted">
                              {new Date(order.placedAt).toLocaleDateString()} · {count} items · {formatCurrency(total, currency)}
                              {order.readyAt && (
                                <> · Ready {new Date(order.readyAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</>
                              )}
                              {order.completedAt && (
                                <> · Complete {new Date(order.completedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</>
                              )}
                            </div>
                          </div>
                          <button onClick={() => handleReorder(order)} className="btn-secondary">
                            Reorder
                          </button>
                        </div>
                      );
                    })}
                    {orders.length > ORDERS_PER_PAGE && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setHistoryPage(Math.max(0, historyPage - 1));
                          }}
                          className="btn-secondary"
                          disabled={historyPage === 0}
                        >
                          Previous
                        </button>
                        <span className="muted">
                          Page {historyPage + 1} of {Math.ceil(orders.length / ORDERS_PER_PAGE)}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setHistoryPage(Math.min(Math.ceil(orders.length / ORDERS_PER_PAGE) - 1, historyPage + 1));
                          }}
                          className="btn-secondary"
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
          </div>
        </div>

        <style jsx>{`
          .page {
            min-height: 100vh;
            background: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%);
            color: #e8e8e8;
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
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

          .eyebrow {
            text-transform: uppercase;
            letter-spacing: 3px;
            font-size: 11px;
            color: #a78bfa;
            margin: 0 0 8px;
          }

          .title {
            font-size: 36px;
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
            margin: 0 0 16px;
          }

          .badges {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }

          .badge {
            background: rgba(255, 255, 255, 0.2);
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
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
            color: #a78bfa;
          }

          .info-content {
            font-size: 14px;
            line-height: 1.6;
            color: #e8e8e8;
            white-space: pre-line;
          }

          .phone-link {
            color: #a78bfa;
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
                'vendor-info'
                'account'
                'order-tracking'
                'cart'
                'menu'
                'history';
            }
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

          .card {
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            padding: 20px;
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
            color: #888;
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
            background: rgba(255, 255, 255, 0.03);
            border-radius: 16px;
            border: 1px solid rgba(255, 255, 255, 0.1);
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
            color: #e8e8e8;
            text-align: center;
          }

          .tracking-shortcode-label {
            font-size: 14px;
            font-weight: 500;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-top: 8px;
          }

          .tracking-shortcode {
            font-size: 72px;
            font-weight: 900;
            text-align: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
            background: #667eea;
            box-shadow: 0 0 8px rgba(102, 126, 234, 0.5);
            transform: scale(1.2);
          }

          .points {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
            border: 1px solid rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.05);
            color: #fff;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
          }

          .btn-auth:hover {
            background: rgba(255, 255, 255, 0.1);
          }

          .btn-primary {
            width: 100%;
            padding: 12px;
            border-radius: 12px;
            border: none;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #fff;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.1s, opacity 0.2s;
          }

          .btn-primary:hover {
            opacity: 0.9;
          }

          .btn-primary:active {
            transform: scale(0.98);
          }

          .btn-secondary {
            padding: 8px 16px;
            border-radius: 20px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            background: transparent;
            color: #e8e8e8;
            font-size: 13px;
            cursor: pointer;
            transition: background 0.2s;
          }

          .btn-secondary:hover {
            background: rgba(255, 255, 255, 0.1);
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
            background: rgba(255, 255, 255, 0.03);
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
            border: 1px solid rgba(255, 255, 255, 0.2);
            background: transparent;
            color: #e8e8e8;
            font-size: 18px;
            cursor: pointer;
          }

          .cart-actions button:hover {
            background: rgba(255, 255, 255, 0.1);
          }

          .cart-footer {
            margin-top: 16px;
            padding-top: 16px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
          }

          .cart-total {
            display: flex;
            justify-content: space-between;
            font-size: 16px;
            margin-bottom: 12px;
          }

          .btn-checkout {
            width: 100%;
            padding: 16px;
            border-radius: 14px;
            border: none;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 16px;
            padding: 24px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            min-height: 200px;
          }

          .menu-image {
            height: 120px;
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.03);
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
            color: #a78bfa;
          }

          .history-header {
            user-select: none;
          }

          .history-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 12px;
            margin-top: 12px;
          }
        `}</style>
      </main>
    </>
  );
}
