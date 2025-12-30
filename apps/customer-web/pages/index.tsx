import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { CSSProperties, useCallback, useEffect, useMemo, useState, useRef } from 'react';

import { resolveVendorSlugFromHost } from '@countrtop/data';
import { CartItem, MenuItem, OrderHistoryEntry } from '@countrtop/models';
import { useAuth } from '@countrtop/ui';
import { getServerDataClient } from '../lib/dataClient';
import { getBrowserSupabaseClient } from '../lib/supabaseBrowser';

type CustomerHomeProps = {
  vendorSlug: string | null;
  vendorName: string;
};

type Notice = {
  type: 'info' | 'warning' | 'error';
  message: string;
};

export const getServerSideProps: GetServerSideProps<CustomerHomeProps> = async ({ req }) => {
  const fallback = process.env.DEFAULT_VENDOR_SLUG;
  const vendorSlug = resolveVendorSlugFromHost(req.headers.host, fallback);
  const dataClient = getServerDataClient();
  const vendor = vendorSlug ? await dataClient.getVendorBySlug(vendorSlug) : null;

  return {
    props: {
      vendorSlug: vendorSlug ?? null,
      vendorName: vendor?.displayName ?? 'CountrTop'
    }
  };
};

const formatCurrency = (value: number, currency: string) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(value / 100);

const toFriendlyError = (error: unknown, fallback: string) => {
  if (error instanceof Error) {
    if (/failed to fetch|networkerror/i.test(error.message)) {
      return 'Network issue. Please try again.';
    }
    return error.message;
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }
  return fallback;
};

export default function CustomerHome({ vendorSlug, vendorName }: CustomerHomeProps) {
  const appleEnabled = process.env.NEXT_PUBLIC_APPLE_SIGNIN === 'true';
  const [isClient, setIsClient] = useState(false);
  const [supabase, setSupabase] = useState<ReturnType<typeof getBrowserSupabaseClient>>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuStatus, setMenuStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [menuError, setMenuError] = useState<string | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [orderHistory, setOrderHistory] = useState<OrderHistoryEntry[]>([]);
  const [orderStatus, setOrderStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [orderError, setOrderError] = useState<string | null>(null);
  const [loyaltyBalance, setLoyaltyBalance] = useState<number | null>(null);
  const [isNativeWebView, setIsNativeWebView] = useState(false);

  /**
   * Deduplication and loading guards to prevent fetch storms after sign-in.
   * 
   * WHY THIS IS NEEDED:
   * Without these guards, the following cascade can occur:
   * 1. User signs in → authUser changes → effect triggers fetches
   * 2. Callbacks are recreated (due to dependencies) → effect re-runs
   * 3. Multiple concurrent requests exhaust browser connections (ERR_INSUFFICIENT_RESOURCES)
   * 
   * SOLUTION:
   * - Key-based deduplication: Skip if we've already fetched for this user/vendor combo
   * - Loading guards: Skip if a request is already in flight
   * - Stable callbacks: Use refs to avoid effect re-runs
   */
  const lastOrdersKeyRef = useRef<string | null>(null);
  const isOrdersLoadingRef = useRef(false);
  const lastLoyaltyKeyRef = useRef<string | null>(null);
  const isLoyaltyLoadingRef = useRef(false);
  const vendorSlugRef = useRef(vendorSlug);
  // pushNoticeRef is initialized after pushNotice is declared (below)
  const pushNoticeRef = useRef<(type: Notice['type'], message: string) => void>(() => {});

  // Keep vendorSlugRef updated
  useEffect(() => {
    vendorSlugRef.current = vendorSlug;
  }, [vendorSlug]);

  const cartTotal = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [cartItems]);

  const cartCurrency = cartItems[0]?.currency ?? 'USD';
  useEffect(() => {
    if (!isClient || typeof window === 'undefined') return;
    const userAgent = window.navigator?.userAgent ?? '';
    if (userAgent.includes('CountrTop')) {
      setIsNativeWebView(true);
      return;
    }

    if ((window as any).ReactNativeWebView) {
      setIsNativeWebView(true);
      return;
    }

    const interval = window.setInterval(() => {
      if ((window as any).ReactNativeWebView) {
        setIsNativeWebView(true);
        window.clearInterval(interval);
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [isClient]);

  const pushNotice = useCallback((type: Notice['type'], message: string) => {
    setNotice({ type, message });
  }, []);

  // Keep pushNoticeRef updated (declared early with empty fn, now updated)
  useEffect(() => {
    pushNoticeRef.current = pushNotice;
  }, [pushNotice]);

  const postToNative = useCallback((payload: Record<string, unknown>) => {
    if (!isNativeWebView) return;
    const bridge = (window as typeof window & {
      ReactNativeWebView?: { postMessage?: (message: string) => void };
    }).ReactNativeWebView;
    if (!bridge?.postMessage) return;
    bridge.postMessage(JSON.stringify(payload));
  }, [isNativeWebView]);

  const loadMenu = useCallback(async () => {
    if (!vendorSlug) return;
    setMenuStatus('loading');
    setMenuError(null);
    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/catalog`);
      const payload = await response.json();
      if (!payload.ok) {
        throw new Error(payload.error ?? 'Failed to load menu');
      }
      setMenuItems(payload.items);
      setMenuStatus('ready');
    } catch (error) {
      setMenuStatus('error');
      setMenuError(toFriendlyError(error, 'Unable to load menu'));
    }
  }, [vendorSlug]);

  useEffect(() => {
    if (menuStatus === 'idle' && vendorSlug) {
      void loadMenu();
    }
  }, [loadMenu, menuStatus, vendorSlug]);

  useEffect(() => {
    setIsClient(true);
    setSupabase(getBrowserSupabaseClient());
  }, []);

  // Use shared auth hook
  const { user: authUser, status: authStatus, error: authError, signIn: startOAuth, signOut: signOutBase, isReady: authReady } = useAuth({
    supabase,
    isNativeWebView,
    onNativeAuthUpdate: (user) => {
      if (isNativeWebView) {
        postToNative({
          type: 'ct-auth',
          userId: user?.id ?? null,
          email: user?.email ?? null
        });
      }
    },
    postToNative
  });

  // STABLE CALLBACK with deduplication guards to prevent fetch storm
  const refreshOrderHistory = useCallback(async (userId: string, forceRefresh = false) => {
    const currentVendorSlug = vendorSlugRef.current;
    if (!currentVendorSlug || !userId) return;
    
    const ordersKey = `${currentVendorSlug}:${userId}`;
    
    // Deduplication: skip if already loaded for this key
    if (!forceRefresh && lastOrdersKeyRef.current === ordersKey) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[CustomerHome] Order history already loaded, skipping', { ordersKey });
      }
      return;
    }
    
    // Loading guard: skip if already loading
    if (isOrdersLoadingRef.current) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[CustomerHome] Order history already loading, skipping');
      }
      return;
    }
    
    isOrdersLoadingRef.current = true;
    setOrderStatus('loading');
    setOrderError(null);
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[CustomerHome] Loading order history', { userId, vendorSlug: currentVendorSlug });
    }
    
    try {
      const response = await fetch(`/api/vendors/${currentVendorSlug}/orders?userId=${encodeURIComponent(userId)}`);
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? 'Failed to load order history');
      }
      setOrderHistory(payload.orders ?? []);
      setOrderStatus('ready');
      lastOrdersKeyRef.current = ordersKey;
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[CustomerHome] Order history loaded successfully', { orderCount: payload.orders?.length ?? 0 });
      }
    } catch (error) {
      const message = toFriendlyError(error, 'Unable to load order history');
      console.warn('Order history load failed', { error, userId, vendorSlug: currentVendorSlug });
      setOrderStatus('error');
      setOrderError(message);
      pushNoticeRef.current('error', message);
      // Clear key on error so retry is possible
      lastOrdersKeyRef.current = null;
    } finally {
      isOrdersLoadingRef.current = false;
    }
  }, []); // EMPTY DEPS: Stable callback - uses refs for all external values

  // STABLE CALLBACK with deduplication guards to prevent fetch storm
  const refreshLoyalty = useCallback(async (userId: string, forceRefresh = false) => {
    const currentVendorSlug = vendorSlugRef.current;
    if (!currentVendorSlug || !userId) return;
    
    const loyaltyKey = `${currentVendorSlug}:${userId}`;
    
    // Deduplication: skip if already loaded for this key
    if (!forceRefresh && lastLoyaltyKeyRef.current === loyaltyKey) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[CustomerHome] Loyalty already loaded, skipping', { loyaltyKey });
      }
      return;
    }
    
    // Loading guard: skip if already loading
    if (isLoyaltyLoadingRef.current) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[CustomerHome] Loyalty already loading, skipping');
      }
      return;
    }
    
    isLoyaltyLoadingRef.current = true;
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[CustomerHome] Loading loyalty', { userId, vendorSlug: currentVendorSlug });
    }
    
    try {
      const response = await fetch(`/api/vendors/${currentVendorSlug}/loyalty/${encodeURIComponent(userId)}`);
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? 'Failed to load loyalty');
      }
      setLoyaltyBalance(payload.balance ?? 0);
      lastLoyaltyKeyRef.current = loyaltyKey;
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[CustomerHome] Loyalty loaded successfully', { balance: payload.balance ?? 0 });
      }
    } catch (error) {
      const message = toFriendlyError(error, 'Unable to load loyalty points.');
      console.warn('Loyalty load failed', { error, userId, vendorSlug: currentVendorSlug });
      pushNoticeRef.current('warning', message);
      // Clear key on error so retry is possible
      lastLoyaltyKeyRef.current = null;
    } finally {
      isLoyaltyLoadingRef.current = false;
    }
  }, []); // EMPTY DEPS: Stable callback - uses refs for all external values

  // Auto-refresh orders and loyalty when userId changes
  // CRITICAL: Depend on authUser?.id (not authUser object) to prevent effect cascade
  useEffect(() => {
    const userId = authUser?.id ?? null;
    
    if (!userId || !vendorSlug) {
      // Clear state and refs when no user
      if (lastOrdersKeyRef.current !== null || lastLoyaltyKeyRef.current !== null) {
        setOrderHistory([]);
        setOrderStatus('idle');
        setLoyaltyBalance(null);
        lastOrdersKeyRef.current = null;
        lastLoyaltyKeyRef.current = null;
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[CustomerHome] Cleared order/loyalty state - no user');
        }
      }
      return;
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[CustomerHome] Auto-refreshing orders and loyalty', { userId, vendorSlug });
    }

    void refreshOrderHistory(userId, false);
    void refreshLoyalty(userId, false);
  }, [authUser?.id, vendorSlug, refreshOrderHistory, refreshLoyalty]);

  // Refresh after checkout (bypasses dedup with forceRefresh=true)
  useEffect(() => {
    const userId = authUser?.id ?? null;
    if (!isClient || !userId || !vendorSlug) return;
    
    const refreshKey = sessionStorage.getItem('ct_refresh_after_checkout');
    if (!refreshKey) return;
    sessionStorage.removeItem('ct_refresh_after_checkout');
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[CustomerHome] Forcing refresh after checkout');
    }
    
    // Force refresh after checkout (bypasses dedup)
    void refreshOrderHistory(userId, true);
    void refreshLoyalty(userId, true);
  }, [authUser?.id, isClient, vendorSlug, refreshOrderHistory, refreshLoyalty]);

  const addToCart = (item: MenuItem) => {
    setCartItems((current) => {
      const existing = current.find((entry) => entry.id === item.id);
      if (existing) {
        return current.map((entry) =>
          entry.id === item.id ? { ...entry, quantity: entry.quantity + 1 } : entry
        );
      }
      return [...current, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCartItems((current) =>
      current
        .map((entry) =>
          entry.id === itemId ? { ...entry, quantity: Math.max(0, entry.quantity - 1) } : entry
        )
        .filter((entry) => entry.quantity > 0)
    );
  };

  const handleCheckout = async () => {
    if (!vendorSlug || cartItems.length === 0) return;
    setCheckoutError(null);
    setCheckingOut(true);
    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: authUser?.id ?? null,
          items: cartItems.map((item) => ({
            id: item.id,
            name: item.name,
            price: item.price,
            currency: item.currency,
            quantity: item.quantity,
            variationId: item.variationId
          }))
        })
      });
      const payload = await response.json();
      if (!payload.ok) {
        throw new Error(payload.error ?? 'Checkout failed');
      }
      const snapshot = {
        squareOrderId: payload.squareOrderId,
        items: cartItems.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price
        })),
        total: cartTotal,
        currency: cartCurrency
      };
      sessionStorage.setItem(`ct_order_${payload.orderId}`, JSON.stringify(snapshot));
      window.location.href = payload.checkoutUrl;
    } catch (error) {
      setCheckoutError(toFriendlyError(error, 'Unable to start checkout'));
    } finally {
      setCheckingOut(false);
    }
  };

  const handleReorder = (entry: OrderHistoryEntry) => {
    if (menuStatus !== 'ready') {
      pushNotice('warning', 'Menu is still loading. Try reordering in a moment.');
      return;
    }

    const items = (Array.isArray(entry.snapshotJson?.items) ? entry.snapshotJson.items : []) as Array<{
      id: string;
      name: string;
      quantity: number;
      price: number;
      modifiers?: string[];
    }>;
    if (!items.length) {
      pushNotice('warning', 'No items found for that order.');
      return;
    }

    const menuByVariationId = new Map(menuItems.map((item) => [item.variationId, item]));
    const menuByItemId = new Map(menuItems.map((item) => [item.id, item]));
    let missingCount = 0;
    let unavailableCount = 0;
    let modifiersSkipped = false;
    const nextItems: CartItem[] = [];

    items.forEach((item) => {
      const menuItem = menuByVariationId.get(item.id) ?? menuByItemId.get(item.id);
      if (!menuItem) {
        missingCount += 1;
        return;
      }
      if (!menuItem.price || menuItem.price <= 0) {
        unavailableCount += 1;
        return;
      }
      modifiersSkipped = modifiersSkipped || !!(item.modifiers && item.modifiers.length > 0);

      nextItems.push({
        ...menuItem,
        quantity: Math.max(1, item.quantity || 1)
      });
    });

    if (!nextItems.length) {
      pushNotice('warning', 'No items from that order are available right now.');
      return;
    }

    setCartItems(nextItems);

    if (missingCount + unavailableCount + (modifiersSkipped ? 1 : 0) > 0) {
      const messages: string[] = [];
      if (missingCount + unavailableCount > 0) {
        messages.push('Some items from that order are no longer available.');
      }
      if (modifiersSkipped) {
        messages.push('Modifiers from past orders are not re-applied.');
      }
      console.warn('Reorder warnings', {
        missingCount,
        unavailableCount,
        modifiersSkipped,
        orderId: entry.id,
        vendorSlug
      });
      pushNotice('warning', messages.join(' '));
    }
  };

  // Wrap signOut to clear app-specific state
  const signOut = useCallback(async () => {
    await signOutBase();
    setOrderHistory([]);
    setOrderStatus('idle');
    setLoyaltyBalance(null);
  }, [signOutBase]);
  const contentStyle: CSSProperties = isNativeWebView
    ? { ...styles.content, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }
    : styles.content;

  return (
    <>
      <Head>
        <title>{`${vendorName} · CountrTop`}</title>
      </Head>
      <main style={styles.page} className={isNativeWebView ? 'ct-native' : undefined}>
        <section style={styles.hero}>
          <div style={styles.heroCard}>
            <p style={styles.heroEyebrow}>CountrTop</p>
            <h1 style={styles.heroTitle}>{vendorName}</h1>
            <p style={styles.heroSubtitle}>
              Order fast, earn points, and get notified when it&apos;s ready.
            </p>
            <div style={styles.heroBadgeRow}>
              <span style={styles.heroBadge}>Square checkout</span>
              <span style={styles.heroBadge}>Pickup only</span>
              <span style={styles.heroBadge}>No account needed</span>
            </div>
          </div>
        </section>

        {notice && (
          <section
            style={{
              ...styles.notice,
              ...(notice.type === 'error'
                ? styles.noticeError
                : notice.type === 'warning'
                  ? styles.noticeWarning
                  : styles.noticeInfo)
            }}
            role="status"
          >
            <span style={styles.noticeText}>{notice.message}</span>
            <button type="button" onClick={() => setNotice(null)} style={styles.noticeDismiss}>
              Dismiss
            </button>
          </section>
        )}

        <section style={contentStyle} className="ct-grid">
          <div style={styles.menuColumn} className="ct-account">
            <div style={styles.accountCard}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Account</h2>
                {authUser && (
                  <button type="button" onClick={signOut} style={styles.refreshButton}>
                    Sign out
                  </button>
                )}
              </div>
              {!authReady && <p style={styles.helperText}>Loading sign-in…</p>}
              {isClient && !supabase && (
                <p style={{ ...styles.helperText, color: '#b91c1c' }}>
                  Supabase auth is not configured.
                </p>
              )}
              {authUser ? (
                <div style={styles.accountRow}>
                  <div>
                    <div style={styles.accountName}>Signed in</div>
                    <div style={styles.accountMeta}>{authUser.email ?? authUser.id}</div>
                  </div>
                  <div style={styles.pointsChip}>
                    {loyaltyBalance !== null ? `${loyaltyBalance} pts` : '—'}
                  </div>
                </div>
              ) : (
                <div style={styles.authButtons}>
                  {appleEnabled && (
                    <button type="button" style={styles.authButton} onClick={() => startOAuth('apple')}>
                      Sign in with Apple
                    </button>
                  )}
                  <button type="button" style={styles.authButton} onClick={() => startOAuth('google')}>
                    Sign in with Google
                  </button>
                </div>
              )}
              {authError && <p style={{ ...styles.helperText, color: '#b91c1c' }}>{authError}</p>}
              {authUser && (
                <p style={styles.helperText}>
                  Points accumulate automatically after each completed order.
                </p>
              )}
            </div>
          </div>

          <aside style={styles.cartColumn} className="ct-cart">
            <div style={styles.cartCard}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Your cart</h2>
                <span style={styles.cartCount}>{cartItems.length} items</span>
              </div>
              {cartItems.length === 0 ? (
                <p style={styles.helperText}>Add items to start your order.</p>
              ) : (
                <div style={styles.cartList}>
                  {cartItems.map((item) => (
                    <div key={item.id} style={styles.cartRow}>
                      <div>
                        <div style={styles.cartName}>{item.name}</div>
                        <div style={styles.cartMeta}>
                          {formatCurrency(item.price, item.currency)} · Qty {item.quantity}
                        </div>
                      </div>
                      <div style={styles.cartActions}>
                        <button
                          type="button"
                          style={styles.cartActionButton}
                          onClick={() => removeFromCart(item.id)}
                        >
                          −
                        </button>
                        <button
                          type="button"
                          style={styles.cartActionButton}
                          onClick={() => addToCart(item)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={styles.cartFooter}>
                <div style={styles.cartTotalRow}>
                  <span>Total</span>
                  <strong>{formatCurrency(cartTotal, cartCurrency)}</strong>
                </div>
                <button
                  type="button"
                  style={{
                    ...styles.checkoutButton,
                    opacity: cartItems.length === 0 || checkingOut ? 0.6 : 1
                  }}
                  disabled={cartItems.length === 0 || checkingOut}
                  onClick={handleCheckout}
                >
                  {checkingOut ? 'Starting checkout…' : 'Checkout with Square'}
                </button>
                {checkoutError && (
                  <p style={{ ...styles.helperText, color: '#b91c1c' }}>{checkoutError}</p>
                )}
              </div>
            </div>
          </aside>

          <div style={styles.menuColumn} className="ct-menu">
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>Menu</h2>
              <button type="button" onClick={loadMenu} style={styles.refreshButton}>
                Refresh
              </button>
            </div>
            {!vendorSlug && (
              <p style={{ ...styles.helperText, color: '#b91c1c' }}>No vendor resolved for this host.</p>
            )}
            {menuStatus === 'loading' && <p style={styles.helperText}>Loading Square catalog…</p>}
            {menuStatus === 'error' && (
              <p style={{ ...styles.helperText, color: '#b91c1c' }}>{menuError}</p>
            )}
            <div style={styles.menuGrid}>
              {menuItems.map((item) => (
                <div key={item.id} style={styles.menuCard}>
                  <div style={styles.menuImage} className="ct-menu-image">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt={item.name} style={styles.menuImgTag} />
                    ) : (
                      <span style={styles.menuPlaceholder}>☕</span>
                    )}
                  </div>
                  <div style={styles.menuInfo}>
                    <div style={styles.menuTopRow}>
                      <h3 style={styles.menuName}>{item.name}</h3>
                      <span style={styles.menuPrice}>{formatCurrency(item.price, item.currency)}</span>
                    </div>
                    <p style={styles.menuDescription}>{item.description ?? 'Seasonal favorite.'}</p>
                  </div>
                  <button type="button" style={styles.menuButton} onClick={() => addToCart(item)}>
                    Add to cart
                  </button>
                </div>
              ))}
              {menuStatus === 'ready' && menuItems.length === 0 && (
                <p style={styles.helperText}>No menu items available yet.</p>
              )}
            </div>

            <div style={styles.historyCard}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Order history</h2>
                <span style={styles.cartCount}>
                  {authUser ? `${orderHistory.length} orders` : 'Sign in'}
                </span>
              </div>
              {!authUser && authStatus === 'loading' && (
                <p style={styles.helperText}>Checking your session…</p>
              )}
              {!authUser && authStatus === 'ready' && (
                <p style={styles.helperText}>Sign in to see past orders and reorder favorites.</p>
              )}
              {authUser && orderStatus === 'loading' && (
                <div style={styles.skeletonStack}>
                  {[0, 1].map((index) => (
                    <div key={`history-skeleton-${index}`} style={styles.skeletonRow}>
                      <div className="ct-skeleton" style={styles.skeletonLine} />
                      <div className="ct-skeleton" style={styles.skeletonLineSmall} />
                    </div>
                  ))}
                </div>
              )}
              {authUser && orderStatus === 'error' && (
                <p style={{ ...styles.helperText, color: '#b91c1c' }}>{orderError}</p>
              )}
              {authUser && orderStatus === 'ready' && orderHistory.length === 0 && (
                <p style={styles.helperText}>No orders yet. Your first order will appear here.</p>
              )}
              {authUser &&
                orderHistory.map((order) => {
                  const items = (Array.isArray(order.snapshotJson?.items) ? order.snapshotJson.items : []) as Array<{
                    quantity?: number;
                  }>;
                  const itemCount = items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
                  const itemLabel = itemCount === 1 ? '1 item' : `${itemCount} items`;
                  return (
                    <div key={order.id} style={styles.historyRow}>
                      <div>
                        <div style={styles.historyTitle}>Order {order.squareOrderId.slice(-6)}</div>
                        <div style={styles.historyMeta}>
                          {new Date(order.placedAt).toLocaleString()} · {itemLabel} ·{' '}
                          {formatCurrency(
                            (typeof order.snapshotJson?.total === 'number' ? order.snapshotJson.total : 0),
                            (typeof order.snapshotJson?.currency === 'string' ? order.snapshotJson.currency : 'USD')
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        style={styles.historyButton}
                        onClick={() => handleReorder(order)}
                      >
                        Order again
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        </section>
        <style jsx>{`
          .ct-grid {
            display: grid;
            grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
            grid-template-areas:
              'account cart'
              'menu cart';
          }

          .ct-account {
            grid-area: account;
          }

          .ct-menu {
            grid-area: menu;
          }

          .ct-menu-image {
            height: 150px;
          }

          .ct-cart {
            grid-area: cart;
          }

          .ct-native .ct-grid {
            display: flex;
            flex-direction: column;
          }

          .ct-native .ct-account,
          .ct-native .ct-cart,
          .ct-native .ct-menu {
            width: 100%;
            align-self: stretch;
          }

          .ct-native .ct-cart {
            position: static;
            order: -1;
          }

          .ct-native .ct-account {
            order: -2;
          }

          @media (min-width: 901px) {
            .ct-cart {
              position: sticky;
              top: 24px;
            }
          }

          @media (max-width: 900px), (max-device-width: 900px), (hover: none) and (pointer: coarse) {
            .ct-grid {
              display: flex;
              flex-direction: column;
            }

            .ct-account,
            .ct-cart,
            .ct-menu {
              width: 100%;
              align-self: stretch;
            }

            .ct-menu-image {
              height: 120px;
            }

            .ct-cart {
              position: static;
              order: -1;
            }

            .ct-account {
              order: -2;
            }
          }

          .ct-skeleton {
            position: relative;
            overflow: hidden;
            background: #e2e8f0;
          }

          .ct-skeleton::after {
            content: '';
            position: absolute;
            inset: 0;
            transform: translateX(-100%);
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.6), transparent);
            animation: shimmer 1.4s infinite;
          }

          @keyframes shimmer {
            100% {
              transform: translateX(100%);
            }
          }
        `}</style>
      </main>
    </>
  );
}

const panelWidth: CSSProperties = {
  minWidth: 0
};

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'radial-gradient(circle at top, #f1f5f9, #e2e8f0)',
    color: '#0f172a',
    fontFamily: '"Space Grotesk", "Segoe UI", sans-serif',
    paddingBottom: 'env(safe-area-inset-bottom)'
  },
  hero: {
    padding: 'clamp(28px, 6vw, 48px) clamp(16px, 8vw, 96px) 20px'
  },
  heroCard: {
    background: 'linear-gradient(120deg, #0f172a, #1e293b)',
    color: '#f8fafc',
    padding: 'clamp(20px, 5vw, 32px)',
    borderRadius: 'clamp(18px, 4vw, 24px)',
    boxShadow: '0 24px 60px rgba(15, 23, 42, 0.25)'
  },
  heroEyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontSize: 12,
    color: '#94a3b8',
    margin: 0
  },
  heroTitle: {
    fontSize: 'clamp(28px, 7vw, 36px)',
    margin: '8px 0 12px'
  },
  heroSubtitle: {
    fontSize: 'clamp(14px, 4vw, 16px)',
    maxWidth: 520,
    color: '#cbd5f5',
    margin: 0,
    lineHeight: 1.4
  },
  heroBadgeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12
  },
  heroBadge: {
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
    borderRadius: 999,
    padding: '6px 10px',
    fontSize: 12
  },
  content: {
    gap: 20,
    padding: '24px clamp(16px, 8vw, 96px) 72px'
  },
  notice: {
    margin: '0 clamp(16px, 8vw, 96px) 16px',
    padding: '12px 16px',
    borderRadius: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    border: '1px solid transparent'
  },
  noticeInfo: {
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5f5',
    color: '#0f172a'
  },
  noticeWarning: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
    color: '#7c2d12'
  },
  noticeError: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
    color: '#7f1d1d'
  },
  noticeText: {
    fontSize: 13,
    fontWeight: 600
  },
  noticeDismiss: {
    border: 'none',
    background: 'transparent',
    color: 'inherit',
    fontWeight: 600,
    cursor: 'pointer'
  },
  menuColumn: {
    minWidth: 0
  },
  accountCard: {
    ...panelWidth,
    backgroundColor: '#fff',
    borderRadius: 'clamp(16px, 4vw, 20px)',
    padding: 'clamp(16px, 4vw, 20px)',
    marginBottom: 20,
    boxShadow: '0 16px 32px rgba(15, 23, 42, 0.08)'
  },
  accountRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap'
  },
  accountName: {
    fontWeight: 600
  },
  accountMeta: {
    color: '#64748b',
    fontSize: 13
  },
  authButtons: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10
  },
  authButton: {
    flex: '1 1 180px',
    padding: '12px 16px',
    borderRadius: 12,
    border: '1px solid #0f172a',
    backgroundColor: '#fff',
    color: '#0f172a',
    fontWeight: 600,
    cursor: 'pointer'
  },
  pointsChip: {
    backgroundColor: '#0f172a',
    color: '#fff',
    borderRadius: 999,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 600
  },
  cartColumn: {
    alignSelf: 'start'
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 8
  },
  sectionTitle: {
    fontSize: 'clamp(18px, 4.5vw, 20px)',
    margin: 0
  },
  refreshButton: {
    border: '1px solid #cbd5f5',
    padding: '6px 12px',
    borderRadius: 999,
    backgroundColor: '#f8fafc',
    cursor: 'pointer'
  },
  menuGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 16
  },
  historyCard: {
    ...panelWidth,
    marginTop: 24,
    backgroundColor: '#fff',
    borderRadius: 'clamp(16px, 4vw, 20px)',
    padding: 'clamp(16px, 4vw, 20px)',
    boxShadow: '0 16px 32px rgba(15, 23, 42, 0.08)'
  },
  historyRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    border: '1px solid #e2e8f0',
    borderRadius: 16,
    padding: '12px 14px',
    marginBottom: 12
  },
  historyTitle: {
    fontWeight: 600
  },
  historyMeta: {
    fontSize: 12,
    color: '#64748b'
  },
  historyButton: {
    padding: '8px 12px',
    borderRadius: 12,
    border: '1px solid #0f172a',
    backgroundColor: '#fff',
    color: '#0f172a',
    fontWeight: 600,
    cursor: 'pointer'
  },
  menuCard: {
    backgroundColor: '#fff',
    borderRadius: 'clamp(16px, 4vw, 20px)',
    padding: 'clamp(14px, 4vw, 16px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    boxShadow: '0 16px 32px rgba(15, 23, 42, 0.08)'
  },
  menuImage: {
    borderRadius: 16,
    backgroundColor: '#e2e8f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  menuImgTag: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  menuPlaceholder: {
    fontSize: 32
  },
  menuInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6
  },
  menuTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12
  },
  menuName: {
    fontSize: 'clamp(15px, 4.2vw, 16px)',
    margin: 0
  },
  menuPrice: {
    fontWeight: 600
  },
  menuDescription: {
    margin: 0,
    color: '#64748b',
    fontSize: 13
  },
  menuButton: {
    borderRadius: 12,
    padding: '12px 14px',
    backgroundColor: '#0f172a',
    color: '#fff',
    border: 'none',
    cursor: 'pointer'
  },
  cartCard: {
    ...panelWidth,
    backgroundColor: '#fff',
    borderRadius: 'clamp(18px, 4vw, 24px)',
    padding: 'clamp(16px, 4vw, 20px)',
    boxShadow: '0 20px 40px rgba(15, 23, 42, 0.12)'
  },
  cartCount: {
    fontSize: 12,
    color: '#64748b'
  },
  cartList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },
  cartRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    border: '1px solid #e2e8f0',
    borderRadius: 16,
    padding: '12px 14px'
  },
  cartName: {
    fontWeight: 600
  },
  cartMeta: {
    fontSize: 12,
    color: '#64748b'
  },
  cartActions: {
    display: 'flex',
    gap: 8
  },
  cartActionButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: '1px solid #cbd5f5',
    backgroundColor: '#f8fafc',
    cursor: 'pointer'
  },
  cartFooter: {
    marginTop: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },
  skeletonStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },
  skeletonRow: {
    borderRadius: 16,
    border: '1px solid #e2e8f0',
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  },
  skeletonLine: {
    height: 12,
    borderRadius: 999
  },
  skeletonLineSmall: {
    height: 10,
    borderRadius: 999,
    width: '60%'
  },
  cartTotalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 'clamp(15px, 4vw, 16px)'
  },
  checkoutButton: {
    padding: '14px 16px',
    borderRadius: 14,
    border: 'none',
    backgroundColor: '#38bdf8',
    color: '#0f172a',
    fontWeight: 700,
    fontSize: 'clamp(14px, 4vw, 16px)',
    cursor: 'pointer'
  },
  helperText: {
    margin: 0,
    color: '#64748b',
    fontSize: 13
  }
};
